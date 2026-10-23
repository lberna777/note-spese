// Nota spese in Excel: stesse righe del PDF, totali con formule vere, stile del tema.
import { fullDate, monthLabel } from '../labels';
import { categoryText, payerText, reimburseLabel, TOTAL_LABELS, type ExportInput } from './rows';

export const SHEET_NAME = 'Nota spese';
export const HEADER_ROW = 5;
const EURO_FMT = '#,##0.00 "€"';

// '#rrggbb' -> 'FFRRGGBB' (formato ARGB di Excel)
const argb = (hex: string) => 'FF' + hex.slice(1).toUpperCase();

export async function buildXlsx(input: ExportInput): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const { headerName, recipient, month, totals, theme, logo } = input;
  const c = theme.colors;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);

  if (theme.companyName) {
    ws.getCell('A1').value = theme.companyName;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: argb(c.primary) } };
  }
  ws.getCell('A2').value = `Nota spese - ${headerName}`;
  ws.getCell('A2').font = { bold: true, size: 12 };
  ws.getCell('A3').value = `Destinatario: ${recipient.name}`;
  ws.getCell('A4').value = `Mese: ${monthLabel(month)}`;

  // Logo in alto a destra, alto circa quanto le righe 1-4
  if (logo) {
    const base64 = logo.dataUrl.slice(logo.dataUrl.indexOf(',') + 1);
    const id = wb.addImage({ base64, extension: logo.format === 'PNG' ? 'png' : 'jpeg' });
    const h = 60;
    const w = Math.min(220, (logo.width / logo.height) * h);
    ws.addImage(id, { tl: { col: 8, row: 0.1 }, ext: { width: w, height: h } });
  }

  const headers = ['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato con', 'Note'];
  const head = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.primary) } };
  });

  totals.rows.forEach((e, i) => {
    const r = ws.getRow(HEADER_ROW + 1 + i);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = fullDate(e.date);
    r.getCell(3).value = e.place;
    r.getCell(4).value = e.supplier;
    r.getCell(5).value = categoryText(e);
    if (e.km != null) r.getCell(6).value = e.km;
    r.getCell(7).value = e.amountCents / 100;
    r.getCell(7).numFmt = EURO_FMT;
    r.getCell(8).value = e.invoice ? 'sì' : 'no';
    r.getCell(9).value = payerText(e);
    r.getCell(10).value = e.notes;
    if (i % 2 === 1) {
      for (let col = 1; col <= headers.length; col++) {
        r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(c.surface) } };
      }
    }
  });

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + Math.max(1, totals.rows.length);
  const range = (col: string) => `${col}${first}:${col}${last}`;
  const t = last + 2;
  const edge = { style: 'medium' as const, color: { argb: argb(c.accent) } };
  const put = (row: number, label: string, formula: string, result: number) => {
    for (const col of ['F', 'G']) {
      ws.getCell(`${col}${row}`).border = { top: edge, bottom: edge, left: edge, right: edge };
    }
    ws.getCell(`F${row}`).value = label;
    ws.getCell(`F${row}`).font = { bold: true };
    ws.getCell(`G${row}`).value = { formula, result: result / 100 };
    ws.getCell(`G${row}`).numFmt = EURO_FMT;
    ws.getCell(`G${row}`).font = { bold: true };
  };
  put(t, TOTAL_LABELS.total, `SUM(${range('G')})`, totals.totalCents);
  put(t + 1, TOTAL_LABELS.paidByCompany, `SUMIF(${range('I')},"Carta aziendale",${range('G')})`, totals.paidByCompanyCents);
  put(t + 2, TOTAL_LABELS.advanced, `SUMIF(${range('I')},"Carta personale",${range('G')})`, totals.advancedPersonallyCents);
  put(t + 3, reimburseLabel(recipient), recipient.kind === 'cliente' ? `G${t}` : `G${t + 2}`, totals.toReimburseCents);

  // Le etichette dei totali sono lunghe: la colonna F le ospita senza tagliarle
  [5, 12, 20, 24, 20, 32, 14, 9, 16, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
