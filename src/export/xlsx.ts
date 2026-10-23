// Nota spese in Excel: stesse righe del PDF, totali con formule vere.
import { fullDate, monthLabel } from '../labels';
import { categoryText, methodText, payerText, reimburseLabel, type ExportInput } from './rows';

export const SHEET_NAME = 'Nota spese';
export const HEADER_ROW = 5;
const EURO_FMT = '#,##0.00 "€"';

export async function buildXlsx(input: ExportInput): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const { headerName, recipient, month, totals, cards } = input;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);

  ws.getCell('A1').value = `Nota spese - ${headerName}`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Destinatario: ${recipient.name}`;
  ws.getCell('A3').value = `Mese: ${monthLabel(month)}`;

  const headers = ['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato da', 'Carta / contanti', 'Note'];
  const head = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
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
    r.getCell(10).value = methodText(e, cards);
    r.getCell(11).value = e.notes;
  });

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + Math.max(1, totals.rows.length);
  const range = (col: string) => `${col}${first}:${col}${last}`;
  const t = last + 2;
  const put = (row: number, label: string, formula: string, result: number) => {
    ws.getCell(`F${row}`).value = label;
    ws.getCell(`F${row}`).font = { bold: true };
    ws.getCell(`G${row}`).value = { formula, result: result / 100 };
    ws.getCell(`G${row}`).numFmt = EURO_FMT;
    ws.getCell(`G${row}`).font = { bold: true };
  };
  put(t, 'Totale complessivo', `SUM(${range('G')})`, totals.totalCents);
  put(t + 1, 'Pagato dall\'azienda', `SUMIF(${range('I')},"Azienda",${range('G')})`, totals.paidByCompanyCents);
  put(t + 2, 'Anticipato dal consulente', `SUMIF(${range('I')},"Personale",${range('G')})`, totals.advancedPersonallyCents);
  put(t + 3, reimburseLabel(recipient), recipient.kind === 'cliente' ? `G${t}` : `G${t + 2}`, totals.toReimburseCents);

  [5, 12, 20, 24, 20, 8, 14, 9, 11, 18, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
