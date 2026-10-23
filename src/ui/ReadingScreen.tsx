import { useEffect, useState } from 'preact/hooks';
import { newId, putPhoto } from '../db';
import { resizePhoto } from '../image';
import { parseReceipt } from '../receipt/parse';
import type { AppData } from './useData';
import type { ReceiptDraft } from '../types';

export interface ReadingResult {
  photoId: string;
  draft: ReceiptDraft;
  warning: string | null;
}

// Schermata «Lettura»: riduce e salva la foto, legge il testo, compila una bozza.
export function ReadingScreen(props: { file: File; data: AppData; onDone: (r: ReadingResult) => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('Preparo la foto…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const photoId = newId();
      let blob: Blob = props.file;
      try {
        blob = await resizePhoto(props.file);
      } catch {
        /* se la riduzione fallisce si tiene l'originale */
      }
      await putPhoto({ id: photoId, blob });
      if (cancelled) return;
      setPhase('Leggo lo scontrino sul telefono…');
      let draft: ReceiptDraft = {};
      let warning: string | null = null;
      try {
        const { readText } = await import('../receipt/ocr');
        const text = await readText(blob, (f) => !cancelled && setProgress(f));
        draft = parseReceipt(text, {
          cards: props.data.cards,
          recipients: props.data.recipients,
          knownSuppliers: props.data.suppliers,
        });
        if (!text.trim()) warning = 'Dalla foto non è uscito alcun testo: compila i campi a mano.';
      } catch (err) {
        warning = `Lettura non riuscita (${String((err as Error)?.message ?? err)}): compila i campi a mano.`;
      }
      if (!cancelled) props.onDone({ photoId, draft, warning });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.file]);

  return (
    <div class="screen center">
      <h1>Lettura</h1>
      <p>{phase}</p>
      <progress max={1} value={progress} aria-label="Avanzamento della lettura" />
      <p class="hint">{Math.round(progress * 100)}%</p>
    </div>
  );
}
