import { categoryText, payerText, PERSONAL, reimburseLabel, TOTAL_LABELS } from '../export/rows';
import { monthLabel, shortDate } from '../labels';
import { formatEuro } from '../money';
import type { Recipient } from '../types';
import { Group, Sheet } from './common';
import { useNoteExport } from './useNoteExport';
import type { AppData } from './useData';

// Nota spese del telefono: foglio con righe, totali e, in coda, PDF ed Excel (condivisione).
export function NoteScreen(props: { data: AppData; recipient: Recipient; month: string; onClose: () => void }) {
  const { data, recipient, month } = props;
  const { totals, personal, busy, msg, run } = useNoteExport(data, recipient, month, false);
  if (!totals) return null;

  return (
    <Sheet title="Nota spese" onClose={props.onClose} closeLabel="Chiudi" actionLabel="Fine">
      <p class="note-head"><strong>{data.settings.headerName}</strong><br />{recipient.name} · {monthLabel(month)}</p>
      <Group title="Spese">
        {totals.rows.length === 0 ? <div class="row empty">Nessuna spesa in questo mese.</div> : null}
        {totals.rows.map((e, i) => (
          <div class="row two-line" key={e.id}>
            <span class="n">{i + 1}</span>
            <span class="grow">
              <span class="primary-text">{shortDate(e.date)} · {e.supplier || categoryText(e)}</span>
              <span class="secondary-text">{categoryText(e)} · {e.place} · fattura {e.invoice ? 'sì' : 'no'} · {payerText(e)}</span>
            </span>
            <span class="amount">{formatEuro(e.amountCents)}</span>
          </div>
        ))}
      </Group>
      <Group title="Totali">
        <div class="row"><span class="grow">{TOTAL_LABELS.total}</span><span class="amount-plain">{formatEuro(totals.totalCents)}</span></div>
        <div class="row"><span class="grow">{TOTAL_LABELS.paidByCompany}</span><span class="amount-plain">{formatEuro(totals.paidByCompanyCents)}</span></div>
        <div class="row"><span class="grow">{TOTAL_LABELS.advanced}</span><span class="amount-plain">{formatEuro(totals.advancedPersonallyCents)}</span></div>
        <div class="row total"><span class="grow lbl">{reimburseLabel(recipient)}</span><span class="amount-accent">{formatEuro(totals.toReimburseCents)}</span></div>
      </Group>
      <div class="btn-pair">
        <button type="button" class="btn-fill" disabled={!!busy || !totals.rows.length} onClick={() => void run('pdf')}>{busy === 'pdf' ? 'Preparo…' : 'PDF'}</button>
        <button type="button" class="btn-plain" disabled={!!busy || !totals.rows.length} onClick={() => void run('xlsx')}>{busy === 'xlsx' ? 'Preparo…' : 'Excel'}</button>
      </div>
      {recipient.kind === 'cliente' && totals.rows.length ? (
        // Estratto per l'azienda: solo le spese di questo cliente pagate con la carta personale.
        <Group title={PERSONAL.section} footer={personal ? 'Documento separato per l’azienda: solo le spese di questo cliente pagate con la carta personale, con gli scontrini.' : undefined}>
          {personal ? (
            <>
              <div class="row">
                <span class="grow">{personal.rows.length === 1 ? '1 spesa' : `${personal.rows.length} spese`} con carta personale</span>
                <span class="amount-accent">{formatEuro(personal.totalCents)}</span>
              </div>
              <div class="btn-pair in-group">
                <button type="button" class="btn-plain" disabled={!!busy} onClick={() => void run('pdf', true)}>{busy === 'personal-pdf' ? 'Preparo…' : 'PDF'}</button>
                <button type="button" class="btn-plain" disabled={!!busy} onClick={() => void run('xlsx', true)}>{busy === 'personal-xlsx' ? 'Preparo…' : 'Excel'}</button>
              </div>
            </>
          ) : (
            <div class="row empty">{PERSONAL.none}</div>
          )}
        </Group>
      ) : null}
      {msg ? <p class="status" role="status">{msg}</p> : null}
    </Sheet>
  );
}
