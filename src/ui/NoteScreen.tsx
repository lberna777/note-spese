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
import { Sheet } from './common';
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
    <Sheet title="Nota spese" onClose={props.onClose}>
      <p><strong>{data.settings.headerName}</strong><br />{recipient.name} · {monthLabel(month)}</p>
      {totals.rows.length === 0 ? <p class="muted">Nessuna spesa in questo mese.</p> : (
        <ol class="note-rows">
          {totals.rows.map((e, i) => (
            <li key={e.id}>
              <span class="n">{i + 1}</span>
              <span class="grow">{shortDate(e.date)} · {e.supplier || categoryText(e)}<br /><small>{categoryText(e)} · {e.place} · fattura {e.invoice ? 'sì' : 'no'} · {payerText(e)}</small></span>
              <strong>{formatEuro(e.amountCents)}</strong>
            </li>
          ))}
        </ol>
      )}
      <dl class="totals">
        <div><dt>{TOTAL_LABELS.total}</dt><dd>{formatEuro(totals.totalCents)}</dd></div>
        <div><dt>{TOTAL_LABELS.paidByCompany}</dt><dd>{formatEuro(totals.paidByCompanyCents)}</dd></div>
        <div><dt>{TOTAL_LABELS.advanced}</dt><dd>{formatEuro(totals.advancedPersonallyCents)}</dd></div>
        <div class="strong"><dt>{reimburseLabel(recipient)}</dt><dd>{formatEuro(totals.toReimburseCents)}</dd></div>
      </dl>
      <div class="row-buttons">
        <button type="button" class="btn primary big" disabled={!!busy || !totals.rows.length} onClick={() => void run('pdf')}>{busy === 'pdf' ? 'Preparo…' : 'PDF'}</button>
        <button type="button" class="btn big" disabled={!!busy || !totals.rows.length} onClick={() => void run('xlsx')}>{busy === 'xlsx' ? 'Preparo…' : 'Excel'}</button>
      </div>
      {msg ? <div class="banner" role="status">{msg}</div> : null}
    </Sheet>
  );
}
