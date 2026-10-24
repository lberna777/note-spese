import { describe, expect, it } from 'vitest';
import { estimateSkew, isTextVertical, type BinaryImage } from './skew';

// Righe di «testo» (barrette) su un fondo vuoto, inclinate di `deg` gradi (positivo = scendono verso destra).
function lines(w: number, h: number, deg: number, vertical = false): BinaryImage {
  const data = new Uint8Array(w * h);
  const t = (deg * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // coordinate nel riferimento del foglio
      const dx = x - cx;
      const dy = y - cy;
      let u = dx * Math.cos(t) + dy * Math.sin(t);
      let v = -dx * Math.sin(t) + dy * Math.cos(t);
      if (vertical) [u, v] = [v, -u];
      const vv = Math.floor(v + 5000);
      const uu = Math.floor(u + 5000);
      if (vv % 24 < 7 && uu % 50 < 36 && Math.abs(u) < w * 0.4 && Math.abs(v) < h * 0.4) data[y * w + x] = 1;
    }
  }
  return { data, width: w, height: h };
}

describe('estimateSkew', () => {
  it('misura l\'inclinazione entro mezzo grado', () => {
    for (const deg of [0, 4, -4, 2.5, -7]) {
      const r = estimateSkew(lines(400, 600, deg));
      expect(Math.abs(r.angle - deg)).toBeLessThanOrEqual(0.5);
    }
  });

  it('senza testo restituisce 0', () => {
    expect(estimateSkew({ data: new Uint8Array(100 * 100), width: 100, height: 100 }).angle).toBe(0);
  });
});

describe('isTextVertical', () => {
  it('riconosce le righe orizzontali e quelle verticali (anche un po\' inclinate)', () => {
    expect(isTextVertical(lines(400, 600, 0))).toBe(false);
    expect(isTextVertical(lines(400, 600, 4))).toBe(false);
    expect(isTextVertical(lines(400, 600, 0, true))).toBe(true);
    expect(isTextVertical(lines(400, 600, -5, true))).toBe(true);
  });
});
