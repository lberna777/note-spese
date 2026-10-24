// Geometria della scansione: funzioni pure (senza OpenCV), così si provano con vitest.

export interface Point {
  x: number;
  y: number;
}

/** Quadrilatero in ordine: alto-sx, alto-dx, basso-dx, basso-sx. */
export type Quad = [Point, Point, Point, Point];

/** Frazione minima dell'immagine che deve coprire il documento perché il rilevamento sia credibile. */
export const MIN_AREA_FRACTION = 0.2;
/** Oltre questa frazione il «documento» è quasi certamente il bordo della foto, non lo scontrino. */
export const MAX_AREA_FRACTION = 0.97;
/** Margine del rettangolo di ripiego, in frazione del lato. */
export const FALLBACK_MARGIN = 0.05;
/** Lato lungo massimo dell'immagine raddrizzata. */
export const MAX_OUTPUT_SIDE = 2000;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Area col metodo dei lacci (valore assoluto). */
export function polygonArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Vero se il poligono è convesso (tutti i prodotti vettoriali dello stesso segno, nessun lato di lunghezza zero). */
export function isConvex(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Ordina quattro punti in: alto-sx, alto-dx, basso-dx, basso-sx.
 * Prima li dispone in senso orario attorno al baricentro (con l'asse y verso il basso), poi sceglie come
 * «alto-sx» il punto con x+y minima: regge anche le rotazioni forti, dove il metodo somma/differenza sbaglia.
 */
export function orderCorners(pts: Point[]): Quad {
  if (pts.length !== 4) throw new Error('Servono esattamente quattro punti');
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const cw = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (cw[i].x + cw[i].y < cw[start].x + cw[start].y) start = i;
  return [0, 1, 2, 3].map((k) => ({ ...cw[(start + k) % 4] })) as Quad;
}

/** Il quadrilatero è credibile come scontrino? Convesso, dentro l'immagine, né troppo piccolo né grande quanto la foto. */
export function isValidQuad(pts: Point[], width: number, height: number): boolean {
  if (pts.length !== 4) return false;
  const tol = Math.max(width, height) * 0.01;
  if (pts.some((p) => p.x < -tol || p.y < -tol || p.x > width + tol || p.y > height + tol)) return false;
  if (!isConvex(pts)) return false;
  const frac = polygonArea(pts) / (width * height);
  return frac >= MIN_AREA_FRACTION && frac <= MAX_AREA_FRACTION;
}

/** Rettangolo con margine (frazione del lato) rispetto ai bordi dell'immagine. */
export function fallbackQuad(width: number, height: number, margin = FALLBACK_MARGIN): Quad {
  const mx = width * margin;
  const my = height * margin;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

export function scaleQuad(q: Quad, factor: number): Quad {
  return q.map((p) => ({ x: p.x * factor, y: p.y * factor })) as Quad;
}

/** Porta i punti dentro l'immagine. */
export function clampPoint(p: Point, width: number, height: number): Point {
  return { x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) };
}

/** Dimensione dell'immagine raddrizzata: proporzionata ai lati, lato lungo al massimo `maxSide`, mai ingrandita oltre l'originale. */
export function outputSize(q: Quad, maxSide = MAX_OUTPUT_SIDE): { width: number; height: number } {
  const [tl, tr, br, bl] = q;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  w *= k;
  h *= k;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}
