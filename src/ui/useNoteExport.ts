import { useEffect, useMemo, useState } from 'preact/hooks';
import { getPhoto } from '../db';
import { exportFilename, PERSONAL, type ExportInput } from '../export/rows';
import { rasterizeLogo } from '../logo';
import { download, shareFile } from '../share';
import { companyNameOf, monthTotals, personalExtract } from '../totals';
import type { Recipient } from '../types';
import type { AppData } from './useData';

// Totali del mese di un destinatario, foto dei giustificativi e generazione di PDF ed Excel.
// Per i clienti anche l'estratto per l'azienda delle spese con la carta personale (`personal`, null se non serve).
// `direct`: sul computer si scarica il file; sul telefono si apre il foglio di condivisione.
export function useNoteExport(data: AppData, recipient: Recipient | null, month: string, direct: boolean) {
  const totals = useMemo(() => (recipient ? monthTotals(data.expenses, recipient, month) : null), [data, recipient, month]);
  // solo per i clienti e solo se nel mese c'è almeno una spesa con la carta personale
  const personal = useMemo(() => {
    if (!totals || recipient?.kind !== 'cliente') return null;
    const p = personalExtract(totals);
    return p.rows.length ? p : null;
  }, [totals, recipient]);
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

  // `busy` vale 'pdf' / 'xlsx' per la nota e 'personal-pdf' / 'personal-xlsx' per l'estratto.
  async function run(kind: 'pdf' | 'xlsx', forCompany = false) {
    if (!recipient || !totals) return;
    if (forCompany && !personal) return;
    setBusy(forCompany ? `personal-${kind}` : kind);
    setMsg(null);
    try {
      const base = { headerName: data.settings.headerName, recipient, month, photos, theme: data.theme, logo: await rasterizeLogo(data.theme.logo) };
      const input: ExportInput = forCompany && personal
        ? { ...base, totals: personal, personal: { companyName: companyNameOf(data.recipients, data.theme.companyName), refs: personal.refs } }
        : { ...base, totals };
      const blob = kind === 'pdf' ? await (await import('../export/pdf')).buildPdf(input) : await (await import('../export/xlsx')).buildXlsx(input);
      const name = exportFilename(recipient, month, kind, forCompany);
      if (direct) {
        download(blob, name);
        setMsg('File scaricato.');
      } else {
        const res = await shareFile(blob, name, forCompany ? `${PERSONAL.title} · ${recipient.name}` : `Nota spese ${recipient.name}`);
        setMsg(res === 'shared' ? 'File condiviso.' : res === 'downloaded' ? 'File scaricato.' : 'Condivisione annullata.');
      }
    } catch (err) {
      setMsg(`Errore: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setBusy(null);
    }
  }

  return { totals, personal, photos, busy, msg, run };
}
