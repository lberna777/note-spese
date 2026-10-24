import { useEffect, useMemo, useState } from 'preact/hooks';
import { getPhoto } from '../db';
import { exportFilename, type ExportInput } from '../export/rows';
import { rasterizeLogo } from '../logo';
import { download, shareFile } from '../share';
import { monthTotals } from '../totals';
import type { Recipient } from '../types';
import type { AppData } from './useData';

// Totali del mese di un destinatario, foto dei giustificativi e generazione di PDF ed Excel.
// `direct`: sul computer si scarica il file; sul telefono si apre il foglio di condivisione.
export function useNoteExport(data: AppData, recipient: Recipient | null, month: string, direct: boolean) {
  const totals = useMemo(() => (recipient ? monthTotals(data.expenses, recipient, month) : null), [data, recipient, month]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Map<string, Blob>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = new Map<string, Blob>();
      for (const e of totals?.rows ?? []) {
        if (!e.photoId) continue;
        const p = await getPhoto(e.photoId);
        if (p) m.set(e.id, p.blob);
      }
      if (!cancelled) setPhotos(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [totals]);

  useEffect(() => setMsg(null), [recipient?.id, month]);

  async function run(kind: 'pdf' | 'xlsx') {
    if (!recipient || !totals) return;
    setBusy(kind);
    setMsg(null);
    try {
      const input: ExportInput = {
        headerName: data.settings.headerName, recipient, month, totals, photos, theme: data.theme, logo: await rasterizeLogo(data.theme.logo),
      };
      const blob = kind === 'pdf' ? await (await import('../export/pdf')).buildPdf(input) : await (await import('../export/xlsx')).buildXlsx(input);
      const name = exportFilename(recipient, month, kind);
      if (direct) {
        download(blob, name);
        setMsg('File scaricato.');
      } else {
        const res = await shareFile(blob, name, `Nota spese ${recipient.name}`);
        setMsg(res === 'shared' ? 'File condiviso.' : res === 'downloaded' ? 'File scaricato.' : 'Condivisione annullata.');
      }
    } catch (err) {
      setMsg(`Errore: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setBusy(null);
    }
  }

  return { totals, photos, busy, msg, run };
}
