import { useRef } from 'preact/hooks';
import { categoryText } from '../export/rows';
import { shortDate } from '../labels';
import { formatEuro } from '../money';
import { monthTotals } from '../totals';
import type { Expense, Recipient } from '../types';
import { MonthPicker } from './common';
import type { AppData } from './useData';

const DAY = 24 * 3600 * 1000;

export function backupOverdue(lastBackupAt: string | null, now: number = Date.now()): boolean {
  return !lastBackupAt || now - new Date(lastBackupAt).getTime() > 30 * DAY;
}

export function MonthScreen(props: {
  data: AppData;
  month: string;
  onMonth: (m: string) => void;
  onPhoto: (f: File) => void;
  onManual: () => void;
  onEdit: (e: Expense) => void;
  onNote: (r: Recipient) => void;
  onGoSettings: () => void;
}) {
  const { data, month } = props;
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const groups = data.recipients
    .map((r) => ({ r, t: monthTotals(data.expenses, r, month) }))
    .filter((g) => g.t.rows.length > 0);

  const picked = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) props.onPhoto(f);
  };

  return (
    <div class="page">
      {backupOverdue(data.settings.lastBackupAt) ? (
        <button type="button" class="banner warn-banner link" onClick={props.onGoSettings}>
          {data.settings.lastBackupAt ? 'L’ultimo backup ha più di 30 giorni.' : 'Non hai ancora fatto un backup.'} Tocca per esportarlo.
        </button>
      ) : null}
      <MonthPicker month={month} onChange={props.onMonth} />

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} data-testid="camera-input" />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={picked} data-testid="gallery-input" />
      <button type="button" class="btn primary big" onClick={() => camera.current?.click()}>Fotografa scontrino</button>
      <div class="row-buttons">
        <button type="button" class="btn big" onClick={() => gallery.current?.click()}>Scegli dalla galleria</button>
        <button type="button" class="btn big" onClick={props.onManual}>Spesa senza scontrino</button>
      </div>

      {groups.length === 0 ? <p class="muted">Nessuna spesa in questo mese.</p> : null}
      {groups.map(({ r, t }) => (
        <section class="group" key={r.id}>
          <header>
            <h2>{r.name}</h2>
            <div class="group-total">{formatEuro(t.totalCents)}</div>
          </header>
          <ul class="expenses">
            {t.rows.map((e) => (
              <li key={e.id}>
                <button type="button" class="expense" onClick={() => props.onEdit(e)}>
                  <span class="date">{shortDate(e.date)}</span>
                  <span class="grow">
                    {e.supplier || categoryText(e)}
                    <small>{categoryText(e)} · {e.payer === 'personale' ? 'anticipata da te' : "pagata dall'azienda"}{e.invoice ? ' · fattura' : ''}</small>
                  </span>
                  <strong>{formatEuro(e.amountCents)}</strong>
                </button>
              </li>
            ))}
          </ul>
          <p class="sub">
            {r.kind === 'cliente' ? 'Da rimborsare' : 'Da rimborsare al consulente'}: <strong>{formatEuro(t.toReimburseCents)}</strong>
          </p>
          <button type="button" class="btn" onClick={() => props.onNote(r)}>Nota spese</button>
        </section>
      ))}
    </div>
  );
}
