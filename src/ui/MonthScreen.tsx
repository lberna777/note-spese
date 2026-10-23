import { useRef, useState } from 'preact/hooks';
import { categoryText, payerText, reimburseLabel } from '../export/rows';
import { currentDevice, dismissIosHint, iosHintDismissed, shouldShowIosHint } from '../ios';
import { shortDate } from '../labels';
import { formatEuro } from '../money';
import { monthTotals } from '../totals';
import type { Expense, Recipient } from '../types';
import { Group, MonthPicker } from './common';
import { IconCamera, IconChevronRight, IconClose, IconPencil, IconPhotos, IconWarning } from './icons';
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
  const [iosHint, setIosHint] = useState(() => shouldShowIosHint(currentDevice()) && !iosHintDismissed());
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
    <div class="page with-toolbar">
      {iosHint ? (
        <Group>
          <div class="row two-line" role="note">
            <span class="grow secondary-text">Per usarla come un’app e non perdere i dati: tocca Condividi, poi «Aggiungi alla schermata Home».</span>
            <button type="button" class="icon-btn" aria-label="Chiudi il suggerimento" onClick={() => { dismissIosHint(); setIosHint(false); }}><IconClose /></button>
          </div>
        </Group>
      ) : null}
      {backupOverdue(data.settings.lastBackupAt) ? (
        <Group>
          <button type="button" class="row two-line tap" onClick={props.onGoSettings}>
            <IconWarning class="warn-icon" />
            <span class="grow">
              <span class="primary-text">{data.settings.lastBackupAt ? 'L’ultimo backup ha più di 30 giorni.' : 'Non hai ancora fatto un backup.'}</span>
              <span class="secondary-text">Tocca per esportarlo.</span>
            </span>
            <IconChevronRight class="chev" />
          </button>
        </Group>
      ) : null}
      <MonthPicker month={month} onChange={props.onMonth} />

      {groups.length === 0 ? (
        <Group><div class="row empty">Nessuna spesa in questo mese.</div></Group>
      ) : null}
      {groups.map(({ r, t }) => (
        <Group title={r.name} key={r.id}>
          {t.rows.map((e) => (
            <button type="button" class="row two-line tap" key={e.id} onClick={() => props.onEdit(e)}>
              <span class="grow">
                <span class="primary-text">{e.supplier || categoryText(e)}</span>
                <span class="secondary-text">{categoryText(e)} · {payerText(e)}{e.invoice ? ' · fattura' : ''}</span>
              </span>
              <span class="right-col">
                <span class="amount">{formatEuro(e.amountCents)}</span>
                <span class="date-text">{shortDate(e.date)}</span>
              </span>
              <IconChevronRight class="chev" />
            </button>
          ))}
          <div class="row">
            <span class="grow">Totale</span>
            <span class="amount-plain">{formatEuro(t.totalCents)}</span>
          </div>
          <div class="row">
            <span class="grow">{reimburseLabel(r)}</span>
            <span class="amount">{formatEuro(t.toReimburseCents)}</span>
          </div>
          <button type="button" class="row tap link-row" onClick={() => props.onNote(r)}>
            <span class="grow">Nota spese</span>
            <IconChevronRight class="chev" />
          </button>
        </Group>
      ))}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} data-testid="camera-input" />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={picked} data-testid="gallery-input" />
      <div class="toolbar" role="toolbar" aria-label="Aggiungi una spesa">
        <button type="button" class="tool" onClick={() => gallery.current?.click()}>
          <IconPhotos />
          <span>Galleria</span>
        </button>
        <button type="button" class="shutter" aria-label="Fotografa scontrino" onClick={() => camera.current?.click()}>
          <IconCamera size={28} />
        </button>
        <button type="button" class="tool" onClick={props.onManual}>
          <IconPencil />
          <span>Senza scontrino</span>
        </button>
      </div>
    </div>
  );
}
