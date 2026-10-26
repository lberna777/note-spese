// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../seed';
import { monthTotals } from '../totals';
import { currentMonth } from '../labels';
import { DEFAULT_THEME, parseThemeText } from '../theme';
import { buildPdf } from './pdf';
import type { ExportInput, RasterLogo } from './rows';

const pub = (...p: string[]) => readFileSync(join(process.cwd(), 'public', ...p));
const exampleTheme = () => parseThemeText(pub('esempi', 'tema-esempio.json').toString('utf8'));
// In node non c'è un canvas per rasterizzare l'SVG del tema: per il logo si usa un PNG qualunque.
const pngLogo = (): RasterLogo => ({ dataUrl: 'data:image/png;base64,' + pub('icon-192.png').toString('base64'), format: 'PNG', width: 192, height: 192 });

function input(over: Partial<ExportInput> = {}): ExportInput {
  const s = buildSeed();
  const recipient = s.recipients[0];
  const month = currentMonth();
  const totals = monthTotals(s.expenses, recipient, month);
  return { headerName: s.settings.headerName, recipient, month, totals, photos: new Map(), theme: DEFAULT_THEME, logo: null, ...over };
}

const text = async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString('latin1');
const pageCount = (raw: string) => (raw.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
// Misure di ogni pagina in punti tipografici, dal /MediaBox [x0 y0 x1 y1] di ciascuna.
const pageSizes = (raw: string) =>
  [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => ({
    w: Number(m[3]) - Number(m[1]),
    h: Number(m[4]) - Number(m[2]),
  }));
const expectA4Landscape = (raw: string) => {
  const sizes = pageSizes(raw);
  expect(sizes).toHaveLength(pageCount(raw));
  for (const { w, h } of sizes) {
    expect(w).toBeGreaterThan(h);
    expect(w).toBeCloseTo(841.89, 0);
    expect(h).toBeCloseTo(595.28, 0);
  }
};

const SYSTEM = { ...DEFAULT_THEME, font: 'system' as const };

describe('pdf', () => {
  it('con il carattere di sistema genera un PDF non vuoto in Helvetica, con il testo leggibile', async () => {
    const blob = await buildPdf(input({ theme: SYSTEM }));
    expect(blob.size).toBeGreaterThan(1000);
    const raw = await text(blob);
    expect(raw.slice(0, 5)).toBe('%PDF-');
    expect(raw).toContain('Carta aziendale');
    expect(raw).toContain('Pagato con carta aziendale');
    expect(raw).toContain('Anticipato con carta personale');
    expect(raw).toContain('Da rimborsare');
    expect(raw).toContain('/Helvetica');
    expect(raw).not.toContain('/FontFile2');
    expect(raw).not.toMatch(/\*{4}/);
    expect(raw).toContain('pagina 1 di 1');
    expectA4Landscape(raw);
  });

  it('con il tema d’esempio, il logo e due foto: intestazione, giustificativi e «pagina N di M»', async () => {
    const base = input();
    const photo = new Blob([pub('esempi', 'scontrino-trattoria.png')], { type: 'image/png' });
    const photos = new Map([[base.totals.rows[0].id, photo], [base.totals.rows[2].id, photo], [base.totals.rows[3].id, photo]]);
    const blob = await buildPdf({ ...base, theme: { ...exampleTheme(), font: 'system' }, logo: pngLogo(), photos });
    const raw = await text(blob);
    expect(raw.slice(0, 5)).toBe('%PDF-');
    const pages = pageCount(raw);
    expect(pages).toBe(3); // nota + due pagine di giustificativi (3 foto, due per pagina)
    for (let p = 1; p <= pages; p++) expect(raw).toContain(`pagina ${p} di ${pages}`);
    expect(raw).toContain('STUDIO AURORA S.R.L.');
    expect(raw).toContain('GIUSTIFICATIVI');
    expectA4Landscape(raw);
  });

  it('cinque giustificativi verticali: due per pagina affiancati, l’ultimo da solo, tutte le pagine A4 orizzontali', async () => {
    const base = input();
    const rows = base.totals.rows;
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const photo = new Blob([pub('esempi', 'scontrino-trattoria.png')], { type: 'image/png' }); // 618 × 996, verticale
    const photos = new Map(rows.slice(0, 5).map((r) => [r.id, photo]));
    const raw = await text(await buildPdf({ ...base, theme: { ...exampleTheme(), font: 'system' }, logo: pngLogo(), photos }));
    expect(pageCount(raw)).toBe(4); // nota + 2 pagine con due giustificativi + 1 con l'ultimo
    expect(raw).toContain('pagina 4 di 4');
    expectA4Landscape(raw);
  });

  it('con il tema d’esempio ma senza logo (SVG non rasterizzabile) non va in errore', async () => {
    const blob = await buildPdf(input({ theme: exampleTheme(), logo: null }));
    expect(blob.size).toBeGreaterThan(1000);
  });

  it('con il tema «avenir» incorpora Nunito Sans (TrueType) nel PDF', async () => {
    const blob = await buildPdf(input({ theme: exampleTheme(), logo: pngLogo() }));
    const raw = await text(blob);
    expect(raw.slice(0, 5)).toBe('%PDF-');
    expect(raw).toContain('/FontFile2');
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+NunitoSans|\/BaseFont\s*\/NunitoSans/);
    expect(raw).toContain('NunitoSansLight');
    // tre file di carattere incorporati (leggero, normale, grassetto); il PDF supera la somma dei loro byte
    expect((raw.match(/\/FontFile2/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(blob.size).toBeGreaterThan(90_000);
    expectA4Landscape(raw);
  });

  it('il PDF usa sempre la variante chiara anche se il tema scuro è molto diverso', async () => {
    const t = exampleTheme();
    const raw = await text(await buildPdf(input({ theme: { ...t, font: 'system', dark: { ...t.dark, text: '#ff0000' } } })));
    expect(raw).not.toContain('1 0 0 rg'); // il rosso del tema scuro non compare
  });
});
