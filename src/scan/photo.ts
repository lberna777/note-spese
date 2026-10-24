// Lettura della foto per la scansione: orientamento corretto (EXIF) e lato lungo al massimo `WORK_SIDE`.
import type { RasterImage } from './detect';

/** Lato lungo massimo dell'immagine su cui si ritaglia e si raddrizza (limita la memoria sui telefoni). */
export const WORK_SIDE = 2400;
/** Lato lungo dell'immagine ridotta su cui si cercano i bordi. */
export const DETECT_SIDE = 1000;

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {
      /* ripiega su <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function drawScaled(source: CanvasImageSource, sw: number, sh: number, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decodifica la foto e la porta su un canvas di lavoro. */
export async function loadWorkCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const { source, width, height } = await decode(blob);
  const canvas = drawScaled(source, width, height, WORK_SIDE);
  (source as ImageBitmap).close?.();
  return canvas;
}

/** Copia ridotta (lato lungo `DETECT_SIDE`) per il rilevamento dei bordi. */
export function smallImage(work: HTMLCanvasElement): RasterImage {
  const c = drawScaled(work, work.width, work.height, DETECT_SIDE);
  const ctx = c.getContext('2d')!;
  return ctx.getImageData(0, 0, c.width, c.height);
}

export function fullImage(work: HTMLCanvasElement): RasterImage {
  return work.getContext('2d')!.getImageData(0, 0, work.width, work.height);
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione JPEG fallita'))), 'image/jpeg', quality),
  );
}
