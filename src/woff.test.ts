// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
// @ts-expect-error modulo .mjs senza tipi
import { WEIGHTS, woffToTtf } from '../scripts/woff-to-ttf.mjs';

const root = process.cwd();
const pkg = dirname(createRequire(join(root, 'package.json')).resolve('@fontsource/nunito-sans/package.json'));

// Directory delle tabelle di un sfnt: tag -> { offset, length }.
function tables(ttf: Buffer) {
  const n = ttf.readUInt16BE(4);
  const out: Record<string, { offset: number; length: number }> = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    out[ttf.toString('latin1', o, o + 4)] = { offset: ttf.readUInt32BE(o + 8), length: ttf.readUInt32BE(o + 12) };
  }
  return out;
}

describe('conversione WOFF → TTF', () => {
  const woff = readFileSync(join(pkg, 'files', 'nunito-sans-latin-400-normal.woff'));

  it('produce un file con intestazione TrueType valida e tabelle coerenti', () => {
    const ttf: Buffer = woffToTtf(woff);
    expect(ttf.readUInt32BE(0)).toBe(0x00010000); // versione sfnt di TrueType
    const t = tables(ttf);
    for (const tag of ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name']) expect(t).toHaveProperty(tag);
    // le tabelle stanno dentro il file, allineate a 4 byte; «head» ha il numero magico
    for (const { offset, length } of Object.values(t)) {
      expect(offset % 4).toBe(0);
      expect(offset + length).toBeLessThanOrEqual(ttf.length);
    }
    expect(ttf.readUInt32BE(t.head.offset + 12)).toBe(0x5f0f3cf5);
    // la directory è in ordine di tag
    const tags = Object.keys(t);
    expect([...tags].sort()).toEqual(tags);
  });

  it('i file TTF committati corrispondono alla conversione dei WOFF del pacchetto', () => {
    for (const [weight, name] of WEIGHTS as [number, string][]) {
      const committed = join(root, 'src', 'export', 'fonts', name);
      expect(existsSync(committed)).toBe(true);
      const expected = woffToTtf(readFileSync(join(pkg, 'files', `nunito-sans-latin-${weight}-normal.woff`)));
      expect(readFileSync(committed).equals(expected as never)).toBe(true);
    }
    expect(readFileSync(join(root, 'src', 'export', 'fonts', 'OFL.txt'), 'utf8')).toContain('SIL Open Font License');
  });

  it('rifiuta ciò che non è WOFF e gestisce le tabelle non compresse', () => {
    expect(() => woffToTtf(Buffer.alloc(64))).toThrow(/WOFF/);
    // WOFF minimo con una tabella compressa e una no
    const a = Buffer.from('abcdabcdabcdabcdabcdabcdabcdabcd');
    const b = Buffer.from('xyz!');
    const ca: Buffer = deflateSync(a as never);
    const head = Buffer.alloc(44 + 2 * 20);
    head.write('wOFF', 0, 'latin1');
    head.writeUInt32BE(0x00010000, 4);
    head.writeUInt16BE(2, 12);
    let off = head.length;
    const entry = (i: number, tag: string, data: Buffer, orig: number) => {
      const o = 44 + i * 20;
      head.write(tag, o, 'latin1');
      head.writeUInt32BE(off, o + 4);
      head.writeUInt32BE(data.length, o + 8);
      head.writeUInt32BE(orig, o + 12);
      off += Math.ceil(data.length / 4) * 4;
    };
    entry(0, 'aaaa', ca, a.length);
    entry(1, 'bbbb', b, b.length);
    const pad = (x: Buffer): Buffer => Buffer.concat([x, Buffer.alloc((4 - (x.length % 4)) % 4)] as never);
    const ttf: Buffer = woffToTtf(Buffer.concat([head, pad(ca), pad(b)] as never));
    const t = tables(ttf);
    expect(ttf.subarray(t.aaaa.offset, t.aaaa.offset + t.aaaa.length).equals(a as never)).toBe(true);
    expect(ttf.subarray(t.bbbb.offset, t.bbbb.offset + t.bbbb.length).equals(b as never)).toBe(true);
  });
});
