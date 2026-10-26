// Riduce una foto: lato lungo al massimo 1600 px, JPEG qualità 0,8.
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.8;

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
    // l'immagine è già decodificata
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function resizePhoto(blob: Blob, maxSide: number = MAX_SIDE, quality: number = JPEG_QUALITY): Promise<Blob> {
  const { source, width, height } = await decode(blob);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversione JPEG fallita'))), 'image/jpeg', quality),
  );
}
