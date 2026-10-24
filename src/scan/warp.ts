// Raddrizzamento prospettico e filtri (Documento · Colore) con OpenCV.js.
import { loadCv, type Cv } from './cv';
import { clearEdgeDark } from './cleanup';
import type { RasterImage } from './detect';
import { outputSize, type Quad } from './geometry';
import { estimateSkew, isTextVertical, type BinaryImage } from './skew';

export type ScanFilter = 'documento' | 'colore';

export const SCAN_JPEG_QUALITY = 0.85;

/** Margine rifilato dopo il raddrizzamento, per lato (frazione della dimensione): toglie il bordo con il fondo. */
export const TRIM = 0.015;

export interface WarpResult extends RasterImage {
  /** Quarti di giro orari applicati in automatico perché il testo era verticale. */
  autoTurns: number;
  /** Inclinazione residua delle righe corretta con la rotazione fine, in gradi (0 se non serve). */
  skewDeg: number;
}

type Mat = InstanceType<Cv['Mat']>;

/** Binarizza (inchiostro = 1) una copia ridotta di `gray`, senza il margine esterno, per stimare inclinazione e orientamento. */
function textImage(cv: Cv, gray: Mat, keep: Keep): BinaryImage {
  const k = 700 / Math.max(gray.cols, gray.rows);
  const small = keep(new cv.Mat());
  cv.resize(gray, small, new cv.Size(Math.max(8, Math.round(gray.cols * k)), Math.max(8, Math.round(gray.rows * k))), 0, 0, cv.INTER_AREA);
  const block = Math.max(7, Math.round(Math.max(small.cols, small.rows) / 30) | 1);
  const bin = keep(new cv.Mat());
  cv.adaptiveThreshold(small, bin, 1, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, block, 12);
  const w = bin.cols;
  const h = bin.rows;
  const data = new Uint8Array(bin.data);
  const mx = Math.round(w * 0.06);
  const my = Math.round(h * 0.06);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (x < mx || x >= w - mx || y < my || y >= h - my) data[y * w + x] = 0;
  }
  return { data, width: w, height: h };
}

/**
 * Raddrizza il quadrilatero `corners` di `src` e applica il filtro. Dopo la prospettiva: rifila il margine, ruota di
 * 90° se il testo è verticale, corregge l'inclinazione residua delle righe (se oltre 0,5°). Restituisce un'immagine RGBA.
 */
export async function warpDocument(src: RasterImage, corners: Quad, filter: ScanFilter): Promise<WarpResult> {
  const { cv } = await loadCv();
  const mats: Array<{ delete(): void }> = [];
  const keep: Keep = (m) => {
    mats.push(m);
    return m;
  };
  try {
    const { width, height } = outputSize(corners);
    const rgba = keep(new cv.Mat(src.height, src.width, cv.CV_8UC4));
    rgba.data.set(src.data);
    const from = keep(cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => [p.x, p.y])));
    // Il rettangolo di arrivo è un po' più piccolo del quadrilatero: così il margine esterno (con il fondo) resta fuori.
    const mx = width * TRIM;
    const my = height * TRIM;
    const to = keep(cv.matFromArray(4, 1, cv.CV_32FC2, [-mx, -my, width + mx, -my, width + mx, height + my, -mx, height + my]));
    const m = keep(cv.getPerspectiveTransform(from, to));
    let flat = keep(new cv.Mat());
    cv.warpPerspective(rgba, flat, m, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

    // Orientamento: testo verticale -> 90° orari (non si distingue 90° da 270°: il pulsante «Ruota» corregge).
    let autoTurns = 0;
    let gray = keep(new cv.Mat());
    cv.cvtColor(flat, gray, cv.COLOR_RGBA2GRAY);
    if (isTextVertical(textImage(cv, gray, keep))) {
      const rot = keep(new cv.Mat());
      cv.rotate(flat, rot, cv.ROTATE_90_CLOCKWISE);
      flat = rot;
      autoTurns = 1;
      gray = keep(new cv.Mat());
      cv.cvtColor(flat, gray, cv.COLOR_RGBA2GRAY);
    }

    // Raddrizzamento fine: rotazione antioraria dell'angolo stimato.
    let skewDeg = 0;
    const { angle } = estimateSkew(textImage(cv, gray, keep));
    if (Math.abs(angle) > 0.5) {
      const centre = new cv.Point(flat.cols / 2, flat.rows / 2);
      const r = keep(cv.getRotationMatrix2D(centre, angle, 1));
      const turned = keep(new cv.Mat());
      cv.warpAffine(flat, turned, r, new cv.Size(flat.cols, flat.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
      flat = turned;
      skewDeg = angle;
    }

    const out = filter === 'documento' ? documentFilter(cv, flat, keep) : colorFilter(cv, flat, keep);
    return { data: new Uint8ClampedArray(out.data), width: flat.cols, height: flat.rows, autoTurns, skewDeg };
  } finally {
    for (const m of mats) m.delete();
  }
}

type Keep = <T extends { delete(): void }>(m: T) => T;

/** Valore di luminanza sotto cui sta la frazione `p` dei pixel (0..1). */
function percentile(values: Uint8Array | Uint8ClampedArray, stride: number, offset: number, p: number): number {
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let i = offset; i < values.length; i += stride) {
    hist[values[i]]++;
    n++;
  }
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * p) return v;
  }
  return 255;
}

/**
 * Documento: grigio, divisione per lo sfondo stimato (cancella ombre e sfumature della luce), poi
 * allungamento del contrasto con una curva dolce. Niente soglia dura: il testo sbiadito degli scontrini
 * termici resta in toni di grigio leggibili invece di sparire.
 */
function documentFilter(cv: Cv, flat: InstanceType<Cv['Mat']>, keep: Keep): InstanceType<Cv['Mat']> {
  const gray = keep(new cv.Mat());
  cv.cvtColor(flat, gray, cv.COLOR_RGBA2GRAY);
  // Sfondo: si stima su una copia ridotta a un quarto (è una variazione lenta, non serve la risoluzione piena):
  // chiusura morfologica (toglie il testo scuro), sfocatura, poi si riporta alla misura originale.
  const small = keep(new cv.Mat());
  cv.resize(gray, small, new cv.Size(Math.max(1, Math.round(gray.cols / 4)), Math.max(1, Math.round(gray.rows / 4))), 0, 0, cv.INTER_AREA);
  const k = Math.max(5, Math.round(Math.max(small.cols, small.rows) / 25) | 1);
  const kernel = keep(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k)));
  const bgSmall = keep(new cv.Mat());
  cv.morphologyEx(small, bgSmall, cv.MORPH_CLOSE, kernel);
  const kb = Math.max(3, Math.round(k / 2) | 1);
  cv.GaussianBlur(bgSmall, bgSmall, new cv.Size(kb, kb), 0);
  const bg = keep(new cv.Mat());
  cv.resize(bgSmall, bg, new cv.Size(gray.cols, gray.rows), 0, 0, cv.INTER_LINEAR);
  const norm = keep(new cv.Mat());
  cv.divide(gray, bg, norm, 255); // 255 dove il pixel è uguale allo sfondo (carta), meno dove è più scuro
  // Livelli: nero al 1° percentile, bianco poco sotto la carta; la curva (gamma 1,6) scurisce i grigi medi
  // (testo sbiadito) senza toccare la carta.
  const lo = percentile(norm.data, 1, 0, 0.01);
  const hi = 235;
  const range = Math.max(40, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / range));
    lut[v] = Math.round(255 * Math.pow(t, 1.6));
  }
  const out = keep(new cv.Mat(norm.rows, norm.cols, cv.CV_8UC4));
  const src = new Uint8ClampedArray(norm.data.length);
  for (let i = 0; i < src.length; i++) src[i] = lut[norm.data[i]];
  // Fondo rimasto fuori dalla carta (aree scure collegate al bordo): bianco.
  clearEdgeDark(src, norm.cols, norm.rows);
  const dst = out.data;
  for (let i = 0, j = 0; i < src.length; i++, j += 4) {
    const v = src[i];
    dst[j] = dst[j + 1] = dst[j + 2] = v;
    dst[j + 3] = 255;
  }
  return out;
}

/** Colore: colori originali; contrasto e luminosità si bilanciano con lo stesso allungamento su tutti i canali (la tinta non cambia). */
function colorFilter(cv: Cv, flat: InstanceType<Cv['Mat']>, keep: Keep): InstanceType<Cv['Mat']> {
  const gray = keep(new cv.Mat());
  cv.cvtColor(flat, gray, cv.COLOR_RGBA2GRAY);
  const lo = percentile(gray.data, 1, 0, 0.01);
  const hi = Math.max(lo + 40, percentile(gray.data, 1, 0, 0.97));
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    lut[v] = Math.round(255 * Math.pow(t, 0.9));
  }
  const out = keep(new cv.Mat(flat.rows, flat.cols, cv.CV_8UC4));
  const src = flat.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    dst[i] = lut[src[i]];
    dst[i + 1] = lut[src[i + 1]];
    dst[i + 2] = lut[src[i + 2]];
    dst[i + 3] = 255;
  }
  return out;
}

/** Codifica in JPEG (qualità 0,85) tramite canvas. */
export function encodeJpeg(img: RasterImage): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas non disponibile'));
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione JPEG fallita'))), 'image/jpeg', SCAN_JPEG_QUALITY),
  );
}
