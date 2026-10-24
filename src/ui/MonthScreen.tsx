import { useRef, useState } from 'preact/hooks';
import { categoryText, reimburseLabel } from '../export/rows';
import { currentDevice, dismissIosHint, iosHintDismissed, shouldShowIosHint } from '../ios';
import { kindLabel, monthLabel, PAYER_SHORT, shortDate } from '../labels';
import { formatEuro } from '../money';
import { monthTotals } from '../totals';
import type { Expense, Recipient } from '../types';
import { ScreenTitle } from './common';
import { IconCamera, IconClose, IconPhotos, IconPlus, IconWarning } from './icons';
import type { AppData } from './useData';

const DAY = 24 * 3600 * 1000;

export function backupOverdue(lastBackupAt: string | null, now: number = Date.now()): boolean {
  return !lastBackupAt || now - new Date(lastBackupAt).getTime() > 30 * DAY;
}

// Riga della spesa: «Treno · Aziendale · Fattura» (per l'auto «Auto · 428 km · Personale»).
export function expenseMeta(e: Expense): string {
  return [categoryText(e), e.category === 'auto' && e.km != null ? `${e.km} km` : null, PAYER_SHORT[e.payer], e.invoice ? 'Fattura' : null]
    .filter(Boolean)
    .join(' · ');
}

export interface MonthGroup {
  r: Recipient;
  t: ReturnType<typeof monthTotals>;
}

export function monthGroups(data: AppData, month: string): MonthGroup[] {
  return data.recipients.map((r) => ({ r, t: monthTotals(data.expenses, r, month) })).filter((g) => g.t.rows.length > 0);
}

// Mese del telefono: titolo, striscia dei totali, una sezione per destinatario, barra in basso con le azioni.
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
  const groups = monthGroups(data, month);
  const count = groups.reduce((s, g) => s + g.t.rows.length, 0);
  const sum = (f: (g: MonthGroup) => number) => groups.reduce((s, g) => s + f(g), 0);

  const picked = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) props.onPhoto(f);
  };

  return (
    <div class="page with-toolbar">
      <ScreenTitle
        title={monthLabel(month)}
        sub={`${count} ${count === 1 ? 'spesa' : 'spese'} · ${groups.length} ${groups.length === 1 ? 'destinatario' : 'destinatari'}`}
        month={month}
        onMonth={props.onMonth}
      />
      <div class="strip">
        <div><div class="lbl">Totale</div><div class="v num">{formatEuro(sum((g) => g.t.totalCents))}</div></div>
        <div><div class="lbl">Azienda</div><div class="v num">{formatEuro(sum((g) => g.t.paidByCompanyCents))}</div></div>
        <div><div class="lbl">Anticipi</div><div class="v accent num">{formatEuro(sum((g) => g.t.advancedPersonallyCents))}</div></div>
      </div>

      {iosHint ? (
        <div class="notice" role="note">
          <span class="grow">Per usarla come un’app e non perdere i dati: tocca Condividi, poi «Aggiungi alla schermata Home».</span>
          <button type="button" class="icon-btn" aria-label="Chiudi il suggerimento" onClick={() => { dismissIosHint(); setIosHint(false); }}><IconClose size={18} /></button>
        </div>
      ) : null}
      {backupOverdue(data.settings.lastBackupAt) ? (
        <button type="button" class="notice tap" onClick={props.onGoSettings}>
          <IconWarning class="warn-icon" size={20} />
          <span class="grow">
            <span class="primary-text">{data.settings.lastBackupAt ? 'L’ultimo backup ha più di 30 giorni.' : 'Non hai ancora fatto un backup.'}</span>
            <span class="secondary-text">Tocca per esportarlo.</span>
          </span>
        </button>
      ) : null}

      {groups.length === 0 ? <p class="empty">Nessuna spesa in questo mese.</p> : null}
      {groups.map(({ r, t }) => (
        <section class="sect" key={r.id}>
          <div class="sect-head"><span class="lbl lbl-accent">{r.name}</span><span class="lbl">{kindLabel(r.kind, data.theme)}</span></div>
          <div class="rows">
            {t.rows.map((e) => (
              <button type="button" class="row exp" key={e.id} onClick={() => props.onEdit(e)}>
                <span class="grow">
                  <span class="nome">{e.supplier || categoryText(e)}</span>
                  <span class="meta">{expenseMeta(e)}</span>
                </span>
                <span class="right-col">
                  <span class="imp num">{formatEuro(e.amountCents)}</span>
                  <span class="data num">{shortDate(e.date)}</span>
                </span>
              </button>
            ))}
          </div>
          <div class="sect-foot"><span class="lbl">{reimburseLabel(r)}</span><span class="v accent num">{formatEuro(t.toReimburseCents)}</span></div>
          <button type="button" class="cta-nota" onClick={() => props.onNote(r)}>Nota spese</button>
        </section>
      ))}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} data-testid="camera-input" />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={picked} data-testid="gallery-input" />
      <div class="ph-bar" role="toolbar" aria-label="Aggiungi una spesa">
        <button type="button" class="side" onClick={() => gallery.current?.click()}>
          <IconPhotos size={24} />
          <span>Galleria</span>
        </button>
        <button type="button" class="shoot" aria-label="Fotografa scontrino" onClick={() => camera.current?.click()}>
          <IconCamera size={26} />
        </button>
        <button type="button" class="side" onClick={props.onManual}>
          <IconPlus size={24} />
          <span>Senza foto</span>
        </button>
      </div>
    </div>
  );
}
