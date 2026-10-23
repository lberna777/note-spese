import { useState } from 'preact/hooks';
import { exportBackup, importBackup } from '../backup';
import { deleteRoute, deleteTheme, newId, putRecipient, putRoute, putSettings, putTheme } from '../db';
import { kindLabel } from '../labels';
import { formatRatePerKm, parseRatePerKm } from '../money';
import { isDefaultTheme, parseThemeText, type Theme } from '../theme';
import type { Recipient, RecipientKind, Route } from '../types';
import { Field, Group, Sheet, Switch, val } from './common';
import { IconChevronRight, IconPlus } from './icons';
import type { AppData } from './useData';

type Editing =
  | { kind: 'recipient'; item: Recipient }
  | { kind: 'route'; item: Route }
  | null;

export function SettingsScreen(props: { data: AppData; reload: () => Promise<void> }) {
  const { data, reload } = props;
  const [editing, setEditing] = useState<Editing>(null);
  const [rate, setRate] = useState(formatRatePerKm(data.settings.centsPerKm));
  const [header, setHeader] = useState(data.settings.headerName);
  const [msg, setMsg] = useState<string | null>(null);

  async function saveGeneral(e: Event) {
    e.preventDefault();
    const cents = parseRatePerKm(rate);
    if (cents == null) return setMsg('Rimborso auto non valido: scrivi per esempio 0,5000.');
    await putSettings({ ...data.settings, centsPerKm: cents, headerName: header.trim() || data.settings.headerName });
    await reload();
    setMsg('Impostazioni salvate.');
  }

  async function doExport() {
    const r = await exportBackup();
    await reload();
    setMsg(r === 'cancelled' ? 'Esportazione annullata.' : 'Backup esportato.');
  }

  async function doImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const ok = await importBackup(f);
      if (ok) {
        await reload();
        setMsg('Backup importato.');
      }
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function doImportTheme(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const theme = parseThemeText(await f.text());
      await putTheme(theme);
      await reload();
      setMsg(`Tema «${theme.companyName}» importato.`);
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  }

  async function resetTheme() {
    await deleteTheme();
    await reload();
    setMsg('Tema predefinito ripristinato.');
  }

  if (editing) {
    return <EditorSheet theme={data.theme} editing={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />;
  }

  return (
    <div class="page">
      <p class="demo-tag">Demo con dati finti</p>

      <Group title="Destinatari">
        {data.recipients.map((r) => (
          <button type="button" class="row two-line tap" key={r.id} onClick={() => setEditing({ kind: 'recipient', item: r })}>
            <span class="grow">
              <span class="primary-text">{r.name}</span>
              <span class="secondary-text">{kindLabel(r.kind, data.theme)} · {r.defaultPlace || 'senza località'}{r.active ? '' : ' · non attivo'}</span>
            </span>
            <IconChevronRight class="chev" />
          </button>
        ))}
        <button type="button" class="row tap link-row" onClick={() => setEditing({ kind: 'recipient', item: { id: newId(), name: '', kind: 'cliente', defaultPlace: '', active: true } })}>
          <IconPlus size={20} /><span class="grow">Aggiungi destinatario</span>
        </button>
      </Group>

      <Group title="Tratte in auto">
        {data.routes.map((r) => (
          <button type="button" class="row two-line tap" key={r.id} onClick={() => setEditing({ kind: 'route', item: r })}>
            <span class="grow">
              <span class="primary-text">{r.from} – {r.to}</span>
              <span class="secondary-text">{r.km} km (sola andata)</span>
            </span>
            <IconChevronRight class="chev" />
          </button>
        ))}
        <button type="button" class="row tap link-row" onClick={() => setEditing({ kind: 'route', item: { id: newId(), from: '', to: '', km: 0 } })}>
          <IconPlus size={20} /><span class="grow">Aggiungi tratta</span>
        </button>
      </Group>

      <form onSubmit={(e) => void saveGeneral(e)}>
        <Group title="I tuoi dati e il rimborso auto" footer="Il nome compare nella nota spese, alla voce «Consulente». Il rimborso è quanto ti viene riconosciuto per ogni km fatto in auto, per esempio 0,5000.">
          <Field label="Il tuo nome">
            <input type="text" value={header} onInput={(e) => setHeader(val(e))} />
          </Field>
          <Field label="Rimborso auto (€ per km)">
            <input type="text" inputMode="decimal" value={rate} onInput={(e) => setRate(val(e))} />
          </Field>
          <button type="submit" class="row tap link-row strong-text center">Salva</button>
        </Group>
      </form>

      <Group title="Aspetto" footer="Il tema (nome, logo e colori dell’azienda) si importa da un file .json e resta solo nel telefono.">
        <div class="row two-line" data-testid="theme-preview">
          {data.theme.logo ? <span class="brand-chip"><img src={data.theme.logo} alt="Logo del tema" class="theme-logo" /></span> : null}
          <strong class="grow">{data.theme.companyName || 'Tema predefinito'}</strong>
          <span class="swatches" role="img" aria-label="Colori del tema">
            {Object.entries(data.theme.colors).map(([k, c]) => (
              <i key={k} class="swatch" style={{ background: c }} title={`${k} ${c}`} />
            ))}
          </span>
        </div>
        <label class="row tap link-row">
          <span class="grow">Importa tema</span>
          <input type="file" accept="application/json,.json" hidden onChange={(e) => void doImportTheme(e)} />
        </label>
        <button type="button" class="row tap link-row" disabled={isDefaultTheme(data.theme)} onClick={() => void resetTheme()}>
          <span class="grow">Torna al tema predefinito</span>
        </button>
      </Group>

      <Group title="Backup" footer="Il file contiene dati e foto e resta dove lo salvi tu.">
        <div class="row">
          <span class="grow">{data.settings.lastBackupAt ? `Ultimo backup: ${new Date(data.settings.lastBackupAt).toLocaleDateString('it-IT')}.` : 'Nessun backup ancora.'}</span>
        </div>
        <button type="button" class="row tap link-row" onClick={() => void doExport()}>
          <span class="grow">Esporta backup</span>
        </button>
        <label class="row tap link-row">
          <span class="grow">Importa backup</span>
          <input type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} />
        </label>
      </Group>

      {msg ? <Group><div class="row" role="status">{msg}</div></Group> : null}
    </div>
  );
}

function EditorSheet(props: { editing: NonNullable<Editing>; theme: Theme; onClose: () => void; onSaved: () => Promise<void> }) {
  const { editing } = props;
  const [item, setItem] = useState<Recipient | Route>(editing.item);
  const [err, setErr] = useState<string | null>(null);
  const patch = (p: Partial<Recipient & Route>) => setItem({ ...item, ...p } as typeof item);

  async function save(e: Event) {
    e.preventDefault();
    if (editing.kind === 'recipient') {
      const r = item as Recipient;
      if (!r.name.trim()) return setErr('Scrivi il nome.');
      await putRecipient({ ...r, name: r.name.trim(), defaultPlace: r.defaultPlace.trim() });
    } else {
      const r = item as Route;
      if (!r.from.trim() || !r.to.trim() || !(r.km > 0)) return setErr('Indica partenza, arrivo e km (maggiori di zero).');
      await putRoute({ ...r, from: r.from.trim(), to: r.to.trim() });
    }
    await props.onSaved();
  }

  async function remove() {
    if (!window.confirm('Eliminare?')) return;
    if (editing.kind === 'route') await deleteRoute(item.id);
    await props.onSaved();
  }

  const title = editing.kind === 'recipient' ? 'Destinatario' : 'Tratta';
  return (
    <Sheet title={title} onClose={props.onClose} onSubmit={(e) => void save(e)}>
      {err ? <Group><div class="row error-text" role="alert">{err}</div></Group> : null}
      {editing.kind === 'recipient' ? (() => {
        const r = item as Recipient;
        return (
          <Group>
            <Field label="Nome"><input type="text" value={r.name} onInput={(e) => patch({ name: val(e) })} /></Field>
            <Field label="Tipo" select>
              <select value={r.kind} onChange={(e) => patch({ kind: val(e) as RecipientKind })}>
                <option value="cliente">{kindLabel('cliente', props.theme)}</option>
                <option value="azienda">{kindLabel('azienda', props.theme)}</option>
              </select>
            </Field>
            <Field label="Località predefinita"><input type="text" value={r.defaultPlace} onInput={(e) => patch({ defaultPlace: val(e) })} /></Field>
            <Switch label="Attivo" checked={r.active} onChange={(v) => patch({ active: v })} />
          </Group>
        );
      })() : null}
      {editing.kind === 'route' ? (() => {
        const r = item as Route;
        return (
          <Group>
            <Field label="Da"><input type="text" value={r.from} onInput={(e) => patch({ from: val(e) })} /></Field>
            <Field label="A"><input type="text" value={r.to} onInput={(e) => patch({ to: val(e) })} /></Field>
            <Field label="Km (sola andata)"><input type="number" inputMode="numeric" min={1} value={r.km || ''} onInput={(e) => patch({ km: Number(val(e)) })} /></Field>
          </Group>
        );
      })() : null}
      {editing.kind !== 'recipient' ? (
        <Group><button type="button" class="row tap destructive center" onClick={() => void remove()}>Elimina tratta</button></Group>
      ) : null}
    </Sheet>
  );
}
