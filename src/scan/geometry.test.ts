import { describe, expect, it } from 'vitest';
import {
  fallbackQuad,
  isConvex,
  isValidQuad,
  orderCorners,
  outputSize,
  polygonArea,
  type Point,
} from './geometry';

const P = (x: number, y: number): Point => ({ x, y });

describe('orderCorners', () => {
  const tl = P(100, 80);
  const tr = P(700, 120);
  const br = P(660, 900);
  const bl = P(60, 860);

  it('ordina qualunque permutazione in alto-sx, alto-dx, basso-dx, basso-sx', () => {
    const perms = [
      [tl, tr, br, bl],
      [br, bl, tl, tr],
      [tr, tl, bl, br],
      [bl, br, tr, tl],
      [tl, br, tr, bl],
    ];
    for (const p of perms) expect(orderCorners(p)).toEqual([tl, tr, br, bl]);
  });

  it('regge una rotazione di circa 40 gradi', () => {
    const a = (40 * Math.PI) / 180;
    const rot = (x: number, y: number) => P(500 + x * Math.cos(a) - y * Math.sin(a), 500 + x * Math.sin(a) + y * Math.cos(a));
    const q = [rot(-100, -200), rot(100, -200), rot(100, 200), rot(-100, 200)];
    const o = orderCorners([q[2], q[0], q[3], q[1]]);
    // l'ordine resta orario e il primo punto è quello con x+y minima
    expect(o[0]).toEqual(q[0]);
    expect(o).toEqual(q);
  });

  it('rifiuta un numero sbagliato di punti', () => {
    expect(() => orderCorners([tl, tr, br])).toThrow();
  });
});

describe('validazione', () => {
  const W = 1000;
  const H = 750;

  it('area e convessità', () => {
    expect(polygonArea([P(0, 0), P(10, 0), P(10, 5), P(0, 5)])).toBe(50);
    expect(isConvex([P(0, 0), P(10, 0), P(10, 10), P(0, 10)])).toBe(true);
    expect(isConvex([P(0, 0), P(10, 0), P(2, 2), P(0, 10)])).toBe(false);
  });

  it('accetta il rettangolo di ripiego e un quadrilatero ampio', () => {
    expect(isValidQuad(fallbackQuad(W, H), W, H)).toBe(true);
    expect(isValidQuad([P(150, 40), P(800, 80), P(760, 700), P(120, 650)], W, H)).toBe(true);
  });

  it('rifiuta i quadrilateri troppo piccoli, non convessi, fuori dall\'immagine o grandi quanto la foto', () => {
    expect(isValidQuad([P(100, 100), P(300, 100), P(300, 250), P(100, 250)], W, H)).toBe(false); // < 20%
    expect(isValidQuad([P(100, 100), P(900, 100), P(200, 200), P(100, 600)], W, H)).toBe(false); // concavo
    expect(isValidQuad([P(-300, 0), P(900, 0), P(900, 700), P(-300, 700)], W, H)).toBe(false); // fuori
    expect(isValidQuad([P(0, 0), P(W, 0), P(W, H), P(0, H)], W, H)).toBe(false); // tutta la foto
    expect(isValidQuad([P(0, 0), P(1, 1), P(2, 2)], W, H)).toBe(false);
  });
});

describe('fallbackQuad e outputSize', () => {
  it('il ripiego ha il 5% di margine', () => {
    const q = fallbackQuad(1000, 800);
    expect(q[0]).toEqual(P(50, 40));
    expect(q[2]).toEqual(P(950, 760));
  });

  it('dimensione proporzionata ai lati, con lato lungo al massimo 2000', () => {
    expect(outputSize([P(0, 0), P(300, 0), P(300, 900), P(0, 900)])).toEqual({ width: 300, height: 900 });
    const big = outputSize([P(0, 0), P(1500, 0), P(1500, 4000), P(0, 4000)]);
    expect(big.height).toBe(2000);
    expect(big.width).toBe(750);
  });
});
