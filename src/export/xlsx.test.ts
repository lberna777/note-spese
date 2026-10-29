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

  it('l’ordine delle righe segue le position', async () => {
    const base = input('r-lunari');
    const rows = [...base.totals.rows].reverse().map((x, i) => ({ ...x, position: i }));
    const totals = monthTotals(rows, base.recipient, base.month);
    const ws = (await load(await buildXlsx({ ...base, totals }))).getWorksheet(SHEET_NAME)!;
    const first = HEADER_ROW + 1;
    expect(ws.getCell(`D${first}`).value).toBe(base.totals.rows[rows.length - 1].supplier);
    expect(ws.getCell(`D${first + rows.length - 1}`).value).toBe(base.totals.rows[0].supplier);
  });

  it('nota verso l\'azienda: da rimborsare al consulente', async () => {
    const wb = await load(await buildXlsx(input('r-azienda')));
    const ws = wb.getWorksheet(SHEET_NAME)!;
    const t = HEADER_ROW + 1 + 5 + 1;
    expect(ws.getCell(`F${t + 3}`).value).toBe('Da rimborsare al consulente');
    expect((ws.getCell(`G${t + 3}`).value as { formula: string }).formula).toBe(`G${t + 2}`);
  });

  it('con il tema: logo, nome azienda, intestazione con filetto d’accento, importi in grassetto e «Da rimborsare» in accento', async () => {
    const theme = parseThemeText(pub('esempi', 'tema-esempio.json').toString('utf8'));
    const logo = { dataUrl: 'data:image/png;base64,' + pub('icon-192.png').toString('base64'), format: 'PNG' as const, width: 192, height: 192 };
    const wb = await load(await buildXlsx(input('r-lunari', { theme, logo })));
    const ws = wb.getWorksheet(SHEET_NAME)!;
    expect(ws.getImages()).toHaveLength(1);
    expect(wb.model.media?.length ?? 0).toBeGreaterThan(0);
    expect(ws.getCell('A1').value).toBe('Studio Aurora S.r.l.');
    // intestazione: nessun riempimento, filetto d'accento sotto
    const head = ws.getCell(`A${HEADER_ROW}`);
    expect((head.fill as ExcelJS.FillPattern | undefined)?.pattern ?? 'none').toBe('none');
    expect(head.border?.bottom?.color?.argb).toBe('FFA85A2C');
    expect(head.value).toBe('N.');
    // righe: niente righe a strisce, filetti neutri; importi in grassetto
    const first = HEADER_ROW + 1;
    for (const r of [first, first + 1]) expect((ws.getCell(`B${r}`).fill as ExcelJS.FillPattern | undefined)?.pattern ?? 'none').toBe('none');
    expect(ws.getCell(`G${first}`).font?.bold).toBe(true);
    expect(ws.getCell(`B${first}`).border?.bottom?.style).toBe('thin');
    // carattere del tema «avenir»
    expect(ws.getCell(`D${first}`).font?.name).toBe('Avenir Next');
    // totali: «Da rimborsare» in accento
    const t = HEADER_ROW + 1 + 5 + 1;
    expect(ws.getCell(`F${t + 3}`).font?.color?.argb).toBe('FF8A4A22');
    expect(ws.getCell(`G${t + 3}`).font?.bold).toBe(true);
    expect(ws.getCell(`G${t + 3}`).border?.top?.color?.argb).toBe('FFA85A2C');
    expect(ws.getCell(`G${t + 3}`).numFmt).toContain('€');
  });

  it('con il carattere di sistema non impone un carattere', async () => {
    const wb = await load(await buildXlsx(input('r-lunari', { theme: { ...DEFAULT_THEME, font: 'system' } })));
    const ws = wb.getWorksheet(SHEET_NAME)!;
    expect(ws.getCell(`G${HEADER_ROW + 1}`).font?.name).not.toBe('Avenir Next');
  });
});
