import { describe, expect, it } from 'vitest';
import { clearEdgeDark, rotateQuarterTurns } from './cleanup';

describe('clearEdgeDark', () => {
  const W = 100;
  const H = 100;
  const paper = () => new Uint8ClampedArray(W * H).fill(255);

  it('schiarisce il cuneo scuro nell\'angolo ma non il testo staccato dal bordo', () => {
    const g = paper();
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30 - y; x++) g[y * W + x] = 10; // cuneo
    for (let y = 50; y < 54; y++) for (let x = 40; x < 60; x++) g[y * W + x] = 20; // riga di testo
    const n = clearEdgeDark(g, W, H);
    expect(n).toBeGreaterThan(400);
    expect(g[0]).toBe(255);
    expect(g[5 * W + 5]).toBe(255);
    expect(g[51 * W + 50]).toBe(20);
  });

  it('lascia le lettere piccole attaccate al bordo', () => {
    const g = paper();
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g[y * W + x] = 0;
    clearEdgeDark(g, W, H);
    expect(g[0]).toBe(0);
  });
});

describe('rotateQuarterTurns', () => {
  const img = { data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255]), width: 3, height: 2 };
  it('90° orari: la prima riga diventa l\'ultima colonna', () => {
    const r = rotateQuarterTurns(img, 1);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(Array.from({ length: 6 }, (_, i) => r.data[i * 4])).toEqual([4, 1, 5, 2, 6, 3]);
  });
  it('quattro quarti di giro tornano all\'originale, due ribaltano', () => {
    expect(rotateQuarterTurns(rotateQuarterTurns(img, 3), 1).data).toEqual(img.data);
    expect(Array.from({ length: 6 }, (_, i) => rotateQuarterTurns(img, 2).data[i * 4])).toEqual([6, 5, 4, 3, 2, 1]);
  });
});
