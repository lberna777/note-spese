import { useState } from 'preact/hooks';
import { exportBackup, importBackup } from '../backup';
import { deleteCard, deleteRoute, newId, putCard, putRecipient, putRoute, putSettings } from '../db';
import { formatRatePerKm, parseRatePerKm } from '../money';
import type { Card, Payer, Recipient, RecipientKind, Route } from '../types';
import { Field, Sheet, val } from './common';
import type { AppData } from './useData';

type Editing =
  | { kind: 'recipient'; item: Recipient }
  | { kind: 'card'; item: Card }
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
        <h2>Carte</h2>
        <ul class="expenses">
          {data.cards.map((c) => (
            <li key={c.id}>
              <button type="button" class="expense" onClick={() => setEditing({ kind: 'card', item: c })}>
                <span class="grow">{c.name}<small>intestata a {c.owner === 'azienda' ? 'Azienda' : 'Personale'} · ****{c.last4}</small></span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" class="btn" onClick={() => setEditing({ kind: 'card', item: { id: newId(), name: '', owner: 'azienda', last4: '' } })}>Aggiungi carta</button>
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
  const [item, setItem] = useState<Recipient | Card | Route>(editing.item);
  const [err, setErr] = useState<string | null>(null);
  const patch = (p: Partial<Recipient & Card & Route>) => setItem({ ...item, ...p } as typeof item);

  async function save(e: Event) {
    e.preventDefault();
    if (editing.kind === 'recipient') {
      const r = item as Recipient;
      if (!r.name.trim()) return setErr('Scrivi il nome.');
      await putRecipient({ ...r, name: r.name.trim(), defaultPlace: r.defaultPlace.trim() });
    } else if (editing.kind === 'card') {
      const c = item as Card;
      if (!c.name.trim()) return setErr('Scrivi il nome.');
      if (!/^\d{4}$/.test(c.last4)) return setErr('Servono le ultime 4 cifre.');
      await putCard({ ...c, name: c.name.trim() });
    } else {
      const r = item as Route;
      if (!r.from.trim() || !r.to.trim() || !(r.km > 0)) return setErr('Indica partenza, arrivo e km (maggiori di zero).');
      await putRoute({ ...r, from: r.from.trim(), to: r.to.trim() });
    }
    await props.onSaved();
  }

  async function remove() {
    if (!window.confirm('Eliminare?')) return;
    if (editing.kind === 'card') await deleteCard(item.id);
    if (editing.kind === 'route') await deleteRoute(item.id);
    await props.onSaved();
  }

  const title = editing.kind === 'recipient' ? 'Destinatario' : editing.kind === 'card' ? 'Carta' : 'Tratta';
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
        {editing.kind === 'card' ? (() => {
          const c = item as Card;
          return (
            <>
              <Field label="Nome"><input type="text" value={c.name} onInput={(e) => patch({ name: val(e) })} /></Field>
              <Field label="Intestata a">
                <select value={c.owner} onChange={(e) => patch({ owner: val(e) as Payer })}>
                  <option value="azienda">Azienda</option>
                  <option value="personale">Personale</option>
                </select>
              </Field>
              <Field label="Ultime 4 cifre"><input type="text" inputMode="numeric" maxLength={4} value={c.last4} onInput={(e) => patch({ last4: val(e) })} /></Field>
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
