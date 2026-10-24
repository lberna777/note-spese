// @vitest-environment node
// Prova con OpenCV vero (gira anche in node): un documento ruotato e in prospettiva su fondo scuro.
import { describe, expect, it } from 'vitest';
import { detectDocument, type RasterImage } from './detect';
import type { Point, Quad } from './geometry';
import { warpDocument } from './warp';
import { estimateSkew, isTextVertical } from './skew';

function inside(p: Point, q: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

// Fondo scuro con una leggera grana; carta chiara; righe di «testo» e un quadratino nero vicino all'angolo alto-sx.
function makePhoto(w: number, h: number, quad: Quad): RasterImage {
  const data = new Uint8ClampedArray(w * h * 4);
  const mark = [quad[0], { x: quad[0].x + (quad[1].x - quad[0].x) * 0.15, y: quad[0].y + (quad[1].y - quad[0].y) * 0.15 },
    { x: quad[0].x + (quad[2].x - quad[0].x) * 0.12, y: quad[0].y + (quad[2].y - quad[0].y) * 0.12 },
    { x: quad[0].x + (quad[3].x - quad[0].x) * 0.15, y: quad[0].y + (quad[3].y - quad[0].y) * 0.15 }];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = { x, y };
      let v = 45 + ((x * 7 + y * 13) % 11);
      if (inside(p, quad)) {
        v = 235 - Math.round((y / h) * 25); // sfumatura di luce
        if (y % 22 < 6 && (x * 3 + y) % 40 < 28) v = 90; // righe di testo
        if (inside(p, mark)) v = 0;
      }
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const W = 600;
const H = 800;
const truth: Quad = [
  { x: 130, y: 90 },
  { x: 470, y: 60 },
  { x: 520, y: 720 },
  { x: 90, y: 700 },
];

describe('OpenCV: rilevamento e raddrizzamento', () => {
  it('trova gli angoli del documento nell\'immagine ridotta', async () => {
    const img = makePhoto(W, H, truth);
    const r = await detectDocument(img, { width: W, height: H });
    expect(r.found).toBe(true);
    r.corners.forEach((c, i) => {
      expect(Math.hypot(c.x - truth[i].x, c.y - truth[i].y)).toBeLessThan(25);
    });
  }, 60_000);

  it('riporta gli angoli alle coordinate dell\'originale quando l\'immagine è più grande', async () => {
    const img = makePhoto(W, H, truth);
    const r = await detectDocument(img, { width: W * 2, height: H * 2 });
    expect(r.found).toBe(true);
    expect(Math.hypot(r.corners[2].x - truth[2].x * 2, r.corners[2].y - truth[2].y * 2)).toBeLessThan(50);
  }, 60_000);

  it('usa il rettangolo con margine se non c\'è nessun documento', async () => {
    const data = new Uint8ClampedArray(W * H * 4).fill(120);
    const r = await detectDocument({ data, width: W, height: H }, { width: W, height: H });
    expect(r.found).toBe(false);
    expect(r.corners[0]).toEqual({ x: W * 0.05, y: H * 0.05 });
  }, 60_000);

  it('raddrizza: dimensione proporzionata, carta bianca, angolo alto-sx al suo posto', async () => {
    const img = makePhoto(W, H, truth);
    for (const filter of ['documento', 'colore'] as const) {
      const out = await warpDocument(img, truth, filter);
      expect(out.width).toBeGreaterThan(380);
      expect(out.width).toBeLessThan(470);
      expect(out.height).toBeGreaterThan(640);
      expect(out.height).toBeLessThan(680);
      let sum = 0;
      for (let i = 0; i < out.data.length; i += 4) sum += out.data[i];
      expect(sum / (out.data.length / 4)).toBeGreaterThan(filter === 'documento' ? 170 : 150);
      // il quadratino nero era in alto a sinistra: dopo il raddrizzamento è nel quarto alto-sx
      // (nel filtro Documento, toccando il bordo, viene giustamente cancellato come fondo)
      if (filter === 'documento') continue;
      let dark = 0;
      for (let y = 0; y < out.height / 4; y++)
        for (let x = 0; x < out.width / 4; x++) if (out.data[(y * out.width + x) * 4] < 40) dark++;
      expect(dark).toBeGreaterThan(200);
    }
  }, 60_000);
});

// Foglio rettangolare con righe di testo inclinate di `deg` (positivo = scendono verso destra), anche verticali.
function makeTilted(deg: number, vertical = false, quad: Quad = rect): RasterImage {
  const w = 600;
  const h = 800;
  const data = new Uint8ClampedArray(w * h * 4);
  const t = (deg * Math.PI) / 180;
  const cx = (quad[0].x + quad[2].x) / 2;
  const cy = (quad[0].y + quad[2].y) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let v = 50 + ((x * 7 + y * 13) % 11);
      if (inside({ x, y }, rect)) {
        v = 235;
        let u = (x - cx) * Math.cos(t) + (y - cy) * Math.sin(t);
        let r = -(x - cx) * Math.sin(t) + (y - cy) * Math.cos(t);
        if (vertical) [u, r] = [r, -u];
        if (Math.floor(r + 5000) % 24 < 7 && Math.floor(u + 5000) % 50 < 36 && Math.abs(u) < 220 && Math.abs(r) < 300) v = 70;
      }
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}
const rect: Quad = [
  { x: 100, y: 60 },
  { x: 500, y: 60 },
  { x: 500, y: 740 },
  { x: 100, y: 740 },
];

function darkPixels(img: RasterImage) {
  const bin = new Uint8Array(img.width * img.height);
  const mx = Math.round(img.width * 0.06);
  const my = Math.round(img.height * 0.06);
  for (let y = my; y < img.height - my; y++)
    for (let x = mx; x < img.width - mx; x++) bin[y * img.width + x] = img.data[(y * img.width + x) * 4] < 130 ? 1 : 0;
  return { data: bin, width: img.width, height: img.height };
}

describe('OpenCV: raddrizzamento fine, bordo scuro e rotazione', () => {
  it('righe inclinate di 4° escono entro ±0,5°', async () => {
    for (const deg of [4, -4]) {
      const out = await warpDocument(makeTilted(deg), rect, 'documento');
      expect(out.skewDeg).not.toBe(0);
      const left = estimateSkew(darkPixels(out)).angle;
      expect(Math.abs(left)).toBeLessThanOrEqual(0.5);
    }
  }, 60_000);

  it('non tocca un foglio già dritto', async () => {
    const out = await warpDocument(makeTilted(0), rect, 'colore');
    expect(out.skewDeg).toBe(0);
    expect(out.autoTurns).toBe(0);
  }, 60_000);

  it('testo ruotato di 90°: lo rimette in orizzontale', async () => {
    const out = await warpDocument(makeTilted(0, true), rect, 'documento');
    expect(out.autoTurns).toBe(1);
    const bin = darkPixels(out);
    expect(isTextVertical(bin)).toBe(false);
    expect(Math.abs(estimateSkew(bin).angle)).toBeLessThanOrEqual(0.5);
    expect(out.width).toBeGreaterThan(out.height); // il foglio 400x680 con testo verticale ora è largo
  }, 60_000);

  it('il fondo rimasto nell\'angolo diventa bianco nel filtro Documento', async () => {
    const wide: Quad = [{ x: 40, y: 20 }, rect[1], rect[2], rect[3]]; // l'angolo alto-sx esce dalla carta
    const out = await warpDocument(makeTilted(0), wide, 'documento');
    let sum = 0;
    let n = 0;
    for (let y = 0; y < out.height * 0.05; y++)
      for (let x = 0; x < out.width * 0.05; x++) {
        sum += out.data[(y * out.width + x) * 4];
        n++;
      }
    expect(sum / n).toBeGreaterThan(235);
  }, 60_000);
});
