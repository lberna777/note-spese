// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../seed';
import { monthTotals } from '../totals';
import { currentMonth } from '../labels';
import { buildXlsx, HEADER_ROW, SHEET_NAME } from './xlsx';
import type { ExportInput } from './rows';

function input(recipientId: string): ExportInput {
  const s = buildSeed();
  const recipient = s.recipients.find((r) => r.id === recipientId)!;
  const month = currentMonth();
  return { headerName: s.settings.headerName, recipient, month, totals: monthTotals(s.expenses, recipient, month), cards: s.cards, photos: new Map() };
}

describe('xlsx', () => {
  it('righe e formule dei totali (cliente)', async () => {
    const inp = input('r-lunari');
    const blob = await buildXlsx(inp);
    expect(blob.size).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet(SHEET_NAME)!;
    expect(ws).toBeTruthy();
    const n = inp.totals.rows.length;
    expect(n).toBe(5);
    const first = HEADER_ROW + 1;
    expect(ws.getCell(`D${first}`).value).toBe(inp.totals.rows[0].supplier);
    expect(ws.getCell(`G${first}`).value).toBe(inp.totals.rows[0].amountCents / 100);
    expect(ws.getCell(`G${first}`).numFmt).toContain('€');
    const t = first + n + 1;
    const f = (a: string) => (ws.getCell(a).value as { formula: string }).formula;
    expect(f(`G${t}`)).toBe(`SUM(G${first}:G${first + n - 1})`);
    expect(f(`G${t + 1}`)).toContain('SUMIF(I');
    expect(f(`G${t + 1}`)).toContain('"Azienda"');
    expect(f(`G${t + 2}`)).toContain('"Personale"');
    expect(f(`G${t + 3}`)).toBe(`G${t}`);
    expect(ws.getCell(`F${t + 3}`).value).toBe('Da rimborsare');
  });

  it('nota verso l\'azienda: da rimborsare al consulente', async () => {
    const blob = await buildXlsx(input('r-azienda'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet(SHEET_NAME)!;
    const t = HEADER_ROW + 1 + 5 + 1;
    expect(ws.getCell(`F${t + 3}`).value).toBe('Da rimborsare al consulente');
    expect((ws.getCell(`G${t + 3}`).value as { formula: string }).formula).toBe(`G${t + 2}`);
  });
});
