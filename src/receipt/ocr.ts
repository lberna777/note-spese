// Lettura del testo dalla foto, interamente nel browser (Tesseract.js in WebAssembly).
// Worker, motore e modello italiano sono serviti dall'app stessa (public/tesseract/, copiati da
// scripts/copy-tesseract.mjs): nessuna richiesta verso CDN o terzi.

type TessWorker = {
  recognize(image: Blob): Promise<{ data: { text: string } }>;
};

interface LoggerMessage {
  status: string;
  progress: number;
}

// Funzione che riceve il progresso dell'eventuale riconoscimento in corso (il worker è unico).
let currentProgress: ((fraction: number) => void) | undefined;
let workerPromise: Promise<TessWorker> | null = null;

function localPath(rel: string): string {
  // URL assoluto: il worker risolve i percorsi rispetto a sé, non alla pagina, e con base
  // relativa («./», per pubblicare in una sottocartella) sbaglierebbe cartella.
  return new URL(`${import.meta.env.BASE_URL}tesseract/${rel}`, document.baseURI).href;
}

async function getWorker(): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Import dinamico: il codice di Tesseract si scarica solo quando serve la prima volta.
      const mod = await import('tesseract.js');
      const T = (mod as unknown as { default?: typeof mod }).default ?? mod;
      return (await T.createWorker('ita', T.OEM.LSTM_ONLY, {
        workerPath: localPath('worker.min.js'),
        // Cartella: tesseract.js sceglie da solo tesseract-core-{relaxedsimd,simd,}-lstm.wasm.js
        corePath: localPath(''),
        langPath: localPath('lang'),
        gzip: true,
        logger: (m: LoggerMessage) => {
          if (m.status === 'recognizing text') currentProgress?.(m.progress);
        },
      })) as unknown as TessWorker;
    })().catch((err) => {
      workerPromise = null; // permette un nuovo tentativo
      throw err;
    });
  }
  return workerPromise;
}

const MAX_SIDE = 2200;

// Preelaborazione leggera: riduzione se enorme, scala di grigi e stiramento del contrasto
// (si scartano l'1% di pixel più scuri e più chiari). Se il browser non la supporta si usa
// l'immagine originale.
async function preprocess(image: Blob): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return image;
    const bmp = await createImageBitmap(image);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const hist = new Array<number>(256).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = g;
      hist[g]++;
    }
    const total = w * h;
    let lo = 0;
    let hi = 255;
    for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
    for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; hi--);
    if (hi - lo > 40) {
      const k = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.max(0, Math.min(255, Math.round((d[i] - lo) * k)));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    return out ?? image;
  } catch {
    return image;
  }
}

export async function readText(
  image: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const worker = await getWorker();
  const prepared = await preprocess(image);
  currentProgress = onProgress;
  try {
    const { data } = await worker.recognize(prepared);
    onProgress?.(1);
    return data.text;
  } finally {
    currentProgress = undefined;
  }
}
