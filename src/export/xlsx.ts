// Nota spese in Excel: stesse righe e stesso ordine del PDF, totali con formule vere, stile del tema (variante chiara):
// intestazione con filetto d'accento invece del riempimento pieno, importi in grassetto, «Da rimborsare» in accento.
// Con `input.personal` è l'estratto per l'azienda (solo carta personale): foglio «Carta personale», colonna «Rif.»
// con il numero della riga nella nota per il cliente al posto di «Pagato con», due totali.
import { fullDate, monthLabel } from '../labels';
import { flatten } from '../theme';
import { categoryText, payerText, PERSONAL, reimburseLabel, TOTAL_LABELS, type ExportInput } from './rows';

export const SHEET_NAME = 'Nota spese';
export const PERSONAL_SHEET_NAME = 'Carta personale';
export const HEADER_ROW = 5;
const EURO_FMT = '#,##0.00 "€"';

// '#rrggbb' -> 'FFRRGGBB' (formato ARGB di Excel)
const argb = (hex: string) => 'FF' + hex.slice(1, 7).toUpperCase();

export async function buildXlsx(input: ExportInput): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const { headerName, recipient, month, totals, theme, logo, personal } = input;
  const v = theme.light;
  // Excel non ha le trasparenze: i filetti si appoggiano sul fondo bianco.
  const c = {
    text: flatten(v.text, '#ffffff'),
    muted: flatten(v.textMuted, '#ffffff'),
    line: flatten(v.line, '#ffffff'),
    lineAccent: flatten(v.lineAccent, '#ffffff'),
    accent: flatten(v.accent, '#ffffff'),
    accentText: flatten(v.accentText, '#ffffff'),
  };
  // Con il tema «avenir» il carattere è Avenir Next (se manca sul computer Excel ripiega da solo); altrimenti il predefinito.
  const fontName = theme.font === 'avenir' ? 'Avenir Next' : undefined;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(personal ? PERSONAL_SHEET_NAME : SHEET_NAME);

  if (theme.companyName) {
    ws.getCell('A1').value = theme.companyName;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: argb(c.text) } };
  }
  ws.getCell('A2').value = `${personal ? `${PERSONAL.title} - ${PERSONAL.badge}` : 'Nota spese'} - ${headerName}`;
  ws.getCell('A2').font = { size: 18, color: { argb: argb(c.text) } };
  if (personal) {
    ws.getCell('A3').value = `Destinatario: ${personal.companyName} - Cliente: ${recipient.name}`;
    ws.getCell('A4').value = `Mese: ${monthLabel(month)} - Rif. = numero della riga nella nota spese per il cliente`;
  } else {
    ws.getCell('A3').value = `Destinatario: ${recipient.name}`;
    ws.getCell('A4').value = `Mese: ${monthLabel(month)}`;
  }

  // Logo in alto a destra, alto circa quanto le righe 1-4
  if (logo) {
    const base64 = logo.dataUrl.slice(logo.dataUrl.indexOf(',') + 1);
    const id = wb.addImage({ base64, extension: logo.format === 'PNG' ? 'png' : 'jpeg' });
    const h = 60;
    const w = Math.min(220, (logo.width / logo.height) * h);
    ws.addImage(id, { tl: { col: 8, row: 0.1 }, ext: { width: w, height: h } });
  }

  const headers = personal
    ? ['N.', 'Rif.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Note']
    : ['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato con', 'Note'];
  // Colonne (base 1) di ogni campo: nell'estratto da «Data» in poi slittano di una e «Pagato con» non c'è.
  const off = personal ? 1 : 0;
  const K = { date: 2 + off, place: 3 + off, supplier: 4 + off, cat: 5 + off, km: 6 + off, amount: 7 + off, invoice: 8 + off, payer: 9, notes: 10 };
  const letter = (n: number) => String.fromCharCode(64 + n);
  const head = ws.getRow(HEADER_ROW);
  const rule = (color: string, style: 'thin' | 'medium' = 'thin') => ({ style, color: { argb: argb(color) } });
  head.height = 22;
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h.toUpperCase();
    cell.font = { bold: true, size: 9, color: { argb: argb(c.muted) } };
    cell.border = { bottom: rule(c.accent, 'medium') };
    cell.alignment = { vertical: 'middle', horizontal: i + 1 === K.km || i + 1 === K.amount ? 'right' : 'left' };
  });

  totals.rows.forEach((e, i) => {
    const r = ws.getRow(HEADER_ROW + 1 + i);
    r.getCell(1).value = i + 1;
    if (personal) r.getCell(2).value = personal.refs[i];
    r.getCell(K.date).value = fullDate(e.date);
    r.getCell(K.place).value = e.place;
    r.getCell(K.supplier).value = e.supplier;
    r.getCell(K.cat).value = categoryText(e);
    if (e.km != null) r.getCell(K.km).value = e.km;
    r.getCell(K.amount).value = e.amountCents / 100;
    r.getCell(K.amount).numFmt = EURO_FMT;
    r.getCell(K.amount).font = { bold: true, color: { argb: argb(c.text) } };
    r.getCell(K.invoice).value = e.invoice ? 'sì' : 'no';
    if (!personal) r.getCell(K.payer).value = payerText(e);
    r.getCell(K.notes).value = e.notes;
    // righe separate da filetti neutri, niente righe a strisce
    for (let col = 1; col <= headers.length; col++) r.getCell(col).border = { bottom: rule(c.line) };
    r.getCell(1).font = { color: { argb: argb(c.muted) } };
    if (personal) r.getCell(2).font = { color: { argb: argb(c.muted) } };
    if (e.invoice) r.getCell(K.invoice).font = { color: { argb: argb(c.accentText) } };
    r.getCell(K.amount).alignment = { horizontal: 'right' };
    r.getCell(K.km).alignment = { horizontal: 'right' };
  });

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + Math.max(1, totals.rows.length);
  const range = (col: string) => `${col}${first}:${col}${last}`;
  const t = last + 2;
  // etichetta nella colonna dei km, valore in quella dell'importo
  const L = letter(K.km);
  const A = letter(K.amount);
  const put = (row: number, label: string, formula: string, result: number, big = false) => {
    const color = big ? c.accentText : c.text;
    const border = { top: rule(big ? c.accent : c.line, big ? 'medium' : 'thin'), bottom: rule(big ? c.accent : c.line, big ? 'medium' : 'thin') };
    for (const col of [L, A]) ws.getCell(`${col}${row}`).border = border;
    ws.getCell(`${L}${row}`).value = label;
    ws.getCell(`${L}${row}`).font = { bold: big, size: big ? 12 : 11, color: { argb: argb(color) } };
    ws.getCell(`${A}${row}`).value = { formula, result: result / 100 };
    ws.getCell(`${A}${row}`).numFmt = EURO_FMT;
    ws.getCell(`${A}${row}`).font = { bold: true, size: big ? 12 : 11, color: { argb: argb(color) } };
  };
  if (personal) {
    put(t, PERSONAL.total, `SUM(${range(A)})`, totals.totalCents);
    put(t + 1, PERSONAL.reimburse, `${A}${t}`, totals.toReimburseCents, true);
  } else {
    put(t, TOTAL_LABELS.total, `SUM(${range('G')})`, totals.totalCents);
    put(t + 1, TOTAL_LABELS.paidByCompany, `SUMIF(${range('I')},"Carta aziendale",${range('G')})`, totals.paidByCompanyCents);
    put(t + 2, TOTAL_LABELS.advanced, `SUMIF(${range('I')},"Carta personale",${range('G')})`, totals.advancedPersonallyCents);
    put(t + 3, reimburseLabel(recipient), recipient.kind === 'cliente' ? `G${t}` : `G${t + 2}`, totals.toReimburseCents, true);
  }

  // Le etichette dei totali sono lunghe: la colonna dei km le ospita senza tagliarle
  const widths = personal ? [5, 6, 12, 20, 24, 20, 32, 14, 9, 24] : [5, 12, 20, 24, 20, 32, 14, 9, 16, 24];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Carattere uniforme su tutte le celle scritte.
  if (fontName) ws.eachRow((row) => row.eachCell((cell) => { cell.font = { ...cell.font, name: fontName }; }));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
