// Prepara il logo del tema per PDF ed Excel (che accettano solo PNG e JPEG): gli SVG si
// disegnano su un canvas. Solo nel browser; altrove (o in caso di errore) il logo si omette.
import type { RasterLogo } from './export/rows';

const MAX_RASTER_WIDTH = 600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo non leggibile'));
    img.src = src;
  });
}

export async function rasterizeLogo(dataUrl: string): Promise<RasterLogo | null> {
  if (!dataUrl || typeof document === 'undefined') return null;
  try {
    const img = await loadImage(dataUrl);
    let w = img.naturalWidth || 300;
    let h = img.naturalHeight || 100;
    const isSvg = dataUrl.startsWith('data:image/svg+xml');
    if (!isSvg) {
      return { dataUrl, format: dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', width: w, height: h };
    }
    const k = MAX_RASTER_WIDTH / w;
    w = Math.round(w * k);
    h = Math.round(h * k);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/png'), format: 'PNG', width: w, height: h };
  } catch {
    return null;
  }
}
