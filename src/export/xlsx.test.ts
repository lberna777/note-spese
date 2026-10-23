// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../seed';
import { monthTotals } from '../totals';
import { currentMonth } from '../labels';
import { DEFAULT_THEME, parseThemeText } from '../theme';
import { buildXlsx, HEADER_ROW, SHEET_NAME } from './xlsx';
import type { ExportInput } from './rows';

const pub = (...p: string[]) => readFileSync(join(process.cwd(), 'public', ...p));

function input(recipientId: string, over: Partial<ExportInput> = {}): ExportInput {
  const s = buildSeed();
  const recipient = s.recipients.find((r) => r.id === recipientId)!;
  const month = currentMonth();
  return {
    headerName: s.settings.headerName, recipient, month, totals: monthTotals(s.expenses, recipient, month),
    photos: new Map(), theme: DEFAULT_THEME, logo: null, ...over,
  };
}

async function load(blob: Blob) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb;
}

describe('xlsx', () => {
  it('righe e formule dei totali (cliente)', async () => {
    const inp = input('r-lunari');
    const blob = await buildXlsx(inp);
    expect(blob.size).toBeGreaterThan(0);
    const wb = await load(blob);
    const ws = wb.getWorksheet(SHEET_NAME)!;
    expect(ws).toBeTruthy();
    const n = inp.totals.rows.length;
    expect(n).toBe(5);
    const first = HEADER_ROW + 1;
    expect(ws.getCell(`D${first}`).value).toBe(inp.totals.rows[0].supplier);
    expect(ws.getCell(`G${first}`).value).toBe(inp.totals.rows[0].amountCents / 100);
    expect(ws.getCell(`G${first}`).numFmt).toContain('€');
    expect(ws.getCell(`I${first}`).value).toBe('Carta aziendale');
    const t = first + n + 1;
    const f = (a: string) => (ws.getCell(a).value as { formula: string }).formula;
    expect(f(`G${t}`)).toBe(`SUM(G${first}:G${first + n - 1})`);
    expect(f(`G${t + 1}`)).toContain('SUMIF(I');
    expect(f(`G${t + 1}`)).toContain('"Carta aziendale"');
    expect(f(`G${t + 2}`)).toContain('"Carta personale"');
    expect(f(`G${t + 3}`)).toBe(`G${t}`);
    expect(ws.getCell(`F${t + 1}`).value).toBe('Pagato con carta aziendale');
    expect(ws.getCell(`F${t + 2}`).value).toBe('Anticipato con carta personale');
    expect(ws.getCell(`F${t + 3}`).value).toBe('Da rimborsare');
  });

  it('nota verso l\'azienda: da rimborsare al consulente', async () => {
    const wb = await load(await buildXlsx(input('r-azienda')));
    const ws = wb.getWorksheet(SHEET_NAME)!;
    const t = HEADER_ROW + 1 + 5 + 1;
    expect(ws.getCell(`F${t + 3}`).value).toBe('Da rimborsare al consulente');
    expect((ws.getCell(`G${t + 3}`).value as { formula: string }).formula).toBe(`G${t + 2}`);
  });

  it('con il tema: logo, nome azienda, intestazione colorata e totali bordati', async () => {
    const theme = parseThemeText(pub('esempi', 'tema-esempio.json').toString('utf8'));
    const logo = { dataUrl: 'data:image/png;base64,' + pub('icon-192.png').toString('base64'), format: 'PNG' as const, width: 192, height: 192 };
    const wb = await load(await buildXlsx(input('r-lunari', { theme, logo })));
    const ws = wb.getWorksheet(SHEET_NAME)!;
    expect(ws.getImages()).toHaveLength(1);
    expect(wb.model.media?.length ?? 0).toBeGreaterThan(0);
    expect(ws.getCell('A1').value).toBe('Studio Aurora S.r.l.');
    const head = ws.getCell(`A${HEADER_ROW}`);
    expect((head.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF12474F');
    expect(head.font?.color?.argb).toBe('FFFFFFFF');
    const t = HEADER_ROW + 1 + 5 + 1;
    expect(ws.getCell(`G${t + 3}`).border?.top?.color?.argb).toBe('FFB86B3C');
    expect(ws.getCell(`G${t + 3}`).numFmt).toContain('€');
  });
});
