// Rilevamento dei quattro angoli dello scontrino con OpenCV.js.
import { loadCv, type Cv } from './cv';
import {
  fallbackQuad,
  isValidQuad,
  orderCorners,
  polygonArea,
  scaleQuad,
  type Point,
  type Quad,
} from './geometry';

/** Immagine RGBA come `ImageData` (struttura sola, così funziona anche fuori dal browser). */
export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DetectResult {
  /** Angoli in coordinate dell'immagine originale (alto-sx, alto-dx, basso-dx, basso-sx). */
  corners: Quad;
  /** Falso se il documento non è stato trovato e gli angoli sono il rettangolo di ripiego. */
  found: boolean;
}

/**
 * Cerca il contorno del documento in `small` (immagine ridotta, lato lungo ~1000 px). `original` dà le
 * dimensioni dell'immagine su cui lavorerà il raddrizzamento: gli angoli sono riportati lì.
 */
export async function detectDocument(
  small: RasterImage,
  original: { width: number; height: number },
): Promise<DetectResult> {
  const { cv } = await loadCv();
  const factor = original.width / small.width;
  const pts = findQuad(cv, small);
  if (pts) return { corners: scaleQuad(orderCorners(pts), factor), found: true };
  return { corners: fallbackQuad(original.width, original.height), found: false };
}

function findQuad(cv: Cv, img: RasterImage): Point[] | null {
  const mats: Array<{ delete(): void }> = [];
  const keep = <T extends { delete(): void }>(m: T): T => {
    mats.push(m);
    return m;
  };
  try {
    const rgba = keep(new cv.Mat(img.height, img.width, cv.CV_8UC4));
    rgba.data.set(img.data);
    const gray = keep(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const blur = keep(new cv.Mat());
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const edges = keep(new cv.Mat());
    cv.Canny(blur, edges, 50, 150);
    // Dilatazione: chiude le piccole interruzioni del bordo, così il contorno è un anello unico.
    const kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
    const dilated = keep(new cv.Mat());
    cv.dilate(edges, dilated, kernel);

    const contours = keep(new cv.MatVector());
    const hierarchy = keep(new cv.Mat());
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    // Contorni dal più grande: il primo che si riduce a un quadrilatero valido è lo scontrino.
    const list: Array<{ idx: number; area: number }> = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      list.push({ idx: i, area: cv.contourArea(c) });
      c.delete();
    }
    list.sort((a, b) => b.area - a.area);
    const minArea = img.width * img.height * 0.2 * 0.8; // il contorno dilatato è un po' più grande del bordo vero
    for (const { idx, area } of list.slice(0, 8)) {
      if (area < minArea) break;
      const c = contours.get(idx);
      const hull = new cv.Mat();
      try {
        cv.convexHull(c, hull, false, true);
        const peri = cv.arcLength(hull, true);
        // Si prova con tolleranze crescenti: i bordi di carta stropicciata non sono mai rettilinei.
        for (const eps of [0.02, 0.03, 0.045, 0.06]) {
          const approx = new cv.Mat();
          try {
            cv.approxPolyDP(hull, approx, eps * peri, true);
            if (approx.rows !== 4) continue;
            const pts: Point[] = [];
            for (let k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
            if (isValidQuad(pts, img.width, img.height) && polygonArea(pts) > 0) return pts;
          } finally {
            approx.delete();
          }
        }
      } finally {
        hull.delete();
        c.delete();
      }
    }
    return null;
  } finally {
    for (const m of mats) m.delete();
  }
}
