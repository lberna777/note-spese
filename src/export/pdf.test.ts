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

describe('pdf', () => {
  it('genera un PDF non vuoto con il tema neutro', async () => {
    const blob = await buildPdf(input());
    expect(blob.size).toBeGreaterThan(1000);
    const raw = await text(blob);
    expect(raw.slice(0, 5)).toBe('%PDF-');
    expect(raw).toContain('Carta aziendale');
    expect(raw).toContain('Pagato con carta aziendale');
    expect(raw).toContain('Anticipato con carta personale');
    expect(raw).not.toMatch(/\*{4}/);
    expect(raw).toContain('pagina 1 di 1');
  });

  it('con il tema d’esempio, il logo e due foto: intestazione, giustificativi e «pagina N di M»', async () => {
    const base = input();
    const photo = new Blob([pub('esempi', 'scontrino-trattoria.png')], { type: 'image/png' });
    const photos = new Map([[base.totals.rows[0].id, photo], [base.totals.rows[2].id, photo], [base.totals.rows[3].id, photo]]);
    const blob = await buildPdf({ ...base, theme: exampleTheme(), logo: pngLogo(), photos });
    const raw = await text(blob);
    expect(raw.slice(0, 5)).toBe('%PDF-');
    const pages = pageCount(raw);
    expect(pages).toBe(3); // nota + due pagine di giustificativi (3 foto, due per pagina)
    for (let p = 1; p <= pages; p++) expect(raw).toContain(`pagina ${p} di ${pages}`);
    expect(raw).toContain('Studio Aurora S.r.l.');
    expect(raw).toContain('/Times-Bold');
    expect(raw).toContain('Giustificativi');
  });

  it('con il tema d’esempio ma senza logo (SVG non rasterizzabile) non va in errore', async () => {
    const blob = await buildPdf(input({ theme: exampleTheme(), logo: null }));
    expect(blob.size).toBeGreaterThan(1000);
  });
});
