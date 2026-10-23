import { useEffect, useMemo, useState } from 'preact/hooks';
import { getPhoto } from '../db';
import { exportFilename, type ExportInput } from '../export/rows';
import { categoryText, payerText, reimburseLabel, TOTAL_LABELS } from '../export/rows';
import { rasterizeLogo } from '../logo';
import { monthLabel, shortDate } from '../labels';
import { formatEuro } from '../money';
import { shareFile } from '../share';
import { monthTotals } from '../totals';
import type { Recipient } from '../types';
import { Group, Sheet } from './common';
import type { AppData } from './useData';

export function NoteScreen(props: { data: AppData; recipient: Recipient; month: string; onClose: () => void }) {
  const { data, recipient, month } = props;
  const totals = useMemo(() => monthTotals(data.expenses, recipient, month), [data, recipient, month]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Map<string, Blob>>(new Map());

  useEffect(() => {
    (async () => {
      const m = new Map<string, Blob>();
      for (const e of totals.rows) {
        if (!e.photoId) continue;
        const p = await getPhoto(e.photoId);
        if (p) m.set(e.id, p.blob);
      }
      setPhotos(m);
    })();
  }, [totals]);

  const input = async (): Promise<ExportInput> => ({
    headerName: data.settings.headerName, recipient, month, totals, photos, theme: data.theme, logo: await rasterizeLogo(data.theme.logo),
  });

  async function run(kind: 'pdf' | 'xlsx') {
    setBusy(kind);
    setMsg(null);
    try {
      const blob = kind === 'pdf' ? await (await import('../export/pdf')).buildPdf(await input()) : await (await import('../export/xlsx')).buildXlsx(await input());
      const res = await shareFile(blob, exportFilename(recipient, month, kind), `Nota spese ${recipient.name}`);
      setMsg(res === 'shared' ? 'File condiviso.' : res === 'downloaded' ? 'File scaricato.' : 'Condivisione annullata.');
    } catch (err) {
      setMsg(`Errore: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setBusy(null);
    }
  }

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
        <div class="row"><span class="grow strong-text">{reimburseLabel(recipient)}</span><span class="amount">{formatEuro(totals.toReimburseCents)}</span></div>
      </Group>
      <div class="btn-pair">
        <button type="button" class="btn-fill" disabled={!!busy || !totals.rows.length} onClick={() => void run('pdf')}>{busy === 'pdf' ? 'Preparo…' : 'PDF'}</button>
        <button type="button" class="btn-plain" disabled={!!busy || !totals.rows.length} onClick={() => void run('xlsx')}>{busy === 'xlsx' ? 'Preparo…' : 'Excel'}</button>
      </div>
      {msg ? <Group><div class="row" role="status">{msg}</div></Group> : null}
    </Sheet>
  );
}
