import { useState } from 'preact/hooks';
import { exportBackup, importBackup } from '../backup';
import { deleteRoute, deleteTheme, newId, putRecipient, putRoute, putSettings, putTheme } from '../db';
import { formatRatePerKm, parseRatePerKm } from '../money';
import { isDefaultTheme, parseThemeText } from '../theme';
import type { Recipient, RecipientKind, Route } from '../types';
import { Field, Sheet, val } from './common';
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
    if (cents == null) return setMsg('Tariffa non valida: scrivi per esempio 0,5000.');
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
    return <EditorSheet editing={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />;
  }

  return (
    <div class="page">
      <h1>Impostazioni</h1>
      <p class="demo-tag">Demo con dati finti</p>

      <section class="group">
        <h2>Destinatari</h2>
        <ul class="expenses">
          {data.recipients.map((r) => (
            <li key={r.id}>
              <button type="button" class="expense" onClick={() => setEditing({ kind: 'recipient', item: r })}>
                <span class="grow">{r.name}<small>{r.kind === 'cliente' ? 'cliente' : 'azienda'} · {r.defaultPlace || 'senza località'}{r.active ? '' : ' · non attivo'}</small></span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" class="btn" onClick={() => setEditing({ kind: 'recipient', item: { id: newId(), name: '', kind: 'cliente', defaultPlace: '', active: true } })}>Aggiungi destinatario</button>
      </section>

      <section class="group">
        <h2>Tratte in auto</h2>
        <ul class="expenses">
          {data.routes.map((r) => (
            <li key={r.id}>
              <button type="button" class="expense" onClick={() => setEditing({ kind: 'route', item: r })}>
                <span class="grow">{r.from} – {r.to}<small>{r.km} km (sola andata)</small></span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" class="btn" onClick={() => setEditing({ kind: 'route', item: { id: newId(), from: '', to: '', km: 0 } })}>Aggiungi tratta</button>
      </section>

      <form class="group form" onSubmit={(e) => void saveGeneral(e)}>
        <h2>Tariffa e intestazione</h2>
        <Field label="Tariffa al km (€/km, 4 decimali)">
          <input type="text" inputMode="decimal" value={rate} onInput={(e) => setRate(val(e))} />
        </Field>
        <Field label="Nome nell’intestazione della nota">
          <input type="text" value={header} onInput={(e) => setHeader(val(e))} />
        </Field>
        <button type="submit" class="btn primary">Salva</button>
      </form>

      <section class="group">
        <h2>Aspetto</h2>
        <div class="theme-preview" data-testid="theme-preview">
          {data.theme.logo ? <img src={data.theme.logo} alt="Logo del tema" class="theme-logo" /> : null}
          <strong>{data.theme.companyName || 'Tema predefinito'}</strong>
          <span class="swatches" aria-label="Colori del tema">
            {Object.entries(data.theme.colors).map(([k, c]) => (
              <i key={k} class="swatch" style={{ background: c }} title={`${k} ${c}`} />
            ))}
          </span>
        </div>
        <p class="muted">Il tema (nome, logo e colori dell’azienda) si importa da un file .json e resta solo nel telefono.</p>
        <label class="btn file-btn">
          Importa tema
          <input type="file" accept="application/json,.json" hidden onChange={(e) => void doImportTheme(e)} />
        </label>
        <button type="button" class="btn" disabled={isDefaultTheme(data.theme)} onClick={() => void resetTheme()}>Torna al tema predefinito</button>
      </section>

      <section class="group">
        <h2>Backup</h2>
        <p class="muted">
          {data.settings.lastBackupAt ? `Ultimo backup: ${new Date(data.settings.lastBackupAt).toLocaleDateString('it-IT')}.` : 'Nessun backup ancora.'} Il file contiene dati e foto e resta dove lo salvi tu.
        </p>
        <button type="button" class="btn" onClick={() => void doExport()}>Esporta backup</button>
        <label class="btn file-btn">
          Importa backup
          <input type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} />
        </label>
      </section>

      {msg ? <div class="banner" role="status">{msg}</div> : null}
    </div>
  );
}

function EditorSheet(props: { editing: NonNullable<Editing>; onClose: () => void; onSaved: () => Promise<void> }) {
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
    <Sheet title={title} onClose={props.onClose}>
      <form class="form" onSubmit={(e) => void save(e)}>
        {editing.kind === 'recipient' ? (() => {
          const r = item as Recipient;
          return (
            <>
              <Field label="Nome"><input type="text" value={r.name} onInput={(e) => patch({ name: val(e) })} /></Field>
              <Field label="Tipo">
                <select value={r.kind} onChange={(e) => patch({ kind: val(e) as RecipientKind })}>
                  <option value="cliente">Cliente</option>
                  <option value="azienda">Azienda</option>
                </select>
              </Field>
              <Field label="Località predefinita"><input type="text" value={r.defaultPlace} onInput={(e) => patch({ defaultPlace: val(e) })} /></Field>
              <label class="check"><input type="checkbox" checked={r.active} onChange={(e) => patch({ active: (e.target as HTMLInputElement).checked })} />Attivo</label>
            </>
          );
        })() : null}
        {editing.kind === 'route' ? (() => {
          const r = item as Route;
          return (
            <>
              <Field label="Da"><input type="text" value={r.from} onInput={(e) => patch({ from: val(e) })} /></Field>
              <Field label="A"><input type="text" value={r.to} onInput={(e) => patch({ to: val(e) })} /></Field>
              <Field label="Km (sola andata)"><input type="number" min={1} value={r.km || ''} onInput={(e) => patch({ km: Number(val(e)) })} /></Field>
            </>
          );
        })() : null}
        {err ? <div class="banner error" role="alert">{err}</div> : null}
        <button type="submit" class="btn primary big">Salva</button>
        {editing.kind !== 'recipient' ? <button type="button" class="btn danger big" onClick={() => void remove()}>Elimina</button> : null}
      </form>
    </Sheet>
  );
}
