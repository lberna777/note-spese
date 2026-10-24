// Caricamento di OpenCV.js (Apache-2.0), solo quando serve. Il file, con il WebAssembly incorporato,
// è nel pacchetto dell'app e nel precache della PWA: nessuna richiesta a CDN.
import type * as CvTypes from '@techstark/opencv-js';

export type Cv = typeof CvTypes;

// Il modulo di Emscripten ha un metodo `then`: se lo si restituisse da una promessa, `await` lo
// richiamerebbe all'infinito. Per questo la promessa porta un oggetto `{ cv }` e mai `cv` da solo.
let loading: Promise<{ cv: Cv }> | null = null;

const TIMEOUT_MS = 45_000;

export function loadCv(): Promise<{ cv: Cv }> {
  if (!loading) {
    loading = import('./opencv-entry')
      .then(
        (mod) =>
          new Promise<{ cv: Cv }>((resolve, reject) => {
            const m = mod.getCv().cv as Cv & { onRuntimeInitialized?: () => void };
            // Il runtime è pronto quando compaiono le classi (Mat): altrimenti si aspetta onRuntimeInitialized.
            if (typeof (m as { Mat?: unknown }).Mat === 'function') return resolve({ cv: m });
            const timer = setTimeout(() => reject(new Error('OpenCV non si è avviato in tempo')), TIMEOUT_MS);
            m.onRuntimeInitialized = () => {
              clearTimeout(timer);
              resolve({ cv: m });
            };
          }),
      )
      .catch((err) => {
        loading = null; // permette un nuovo tentativo
        throw err;
      });
  }
  return loading;
}
