// Nota spese in PDF A4, nello stesso linguaggio dell'app: sempre la variante chiara del tema, logo e nome in alto,
// «Nota spese» leggero e grande, etichette in maiuscoletto spaziato, filetti al posto dei riquadri, importi a destra
// in grassetto, totali con «Da rimborsare» in accentText, piè di pagina con «pagina N di M» e, in coda, tutti i
// giustificativi numerati come le righe. Carattere: Nunito Sans incorporato (tema `avenir`) o Helvetica (`system`).
import type { jsPDF } from 'jspdf';
import { formatEuro } from '../money';
import { fullDate, monthLabel, shortDate } from '../labels';
import { flatten, hexToRgb } from '../theme';
import { categoryText, payerText, reimburseLabel, TOTAL_LABELS, type ExportInput } from './rows';

type Rgb = [number, number, number];
type Weight = 'light' | 'regular' | 'bold';

// Il tipo (PNG o JPEG) si legge dal tipo MIME del Blob; il contenuto si codifica a mano
// perché FileReader non esiste fuori dal browser.
async function blobToDataUrl(blob: Blob): Promise<{ url: string; format: 'PNG' | 'JPEG' }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const isPng = blob.type === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50);
  const mime = isPng ? 'image/png' : 'image/jpeg';
  return { url: `data:${mime};base64,${btoa(bin)}`, format: isPng ? 'PNG' : 'JPEG' };
}

// Nomi con cui i caratteri si registrano in jsPDF: tre famiglie, perché jsPDF conosce solo normale e grassetto.
export const PDF_FONT = { light: 'NunitoSansLight', regular: 'NunitoSans' } as const;

export async function buildPdf(input: ExportInput): Promise<Blob> {
  // Caricamento al bisogno: jsPDF e i caratteri pesano e non servono all'avvio.
  const [{ jsPDF: JsPdf }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { headerName, recipient, month, totals, photos, theme, logo } = input;
  const embed = theme.font === 'avenir';
  const doc: jsPDF = new JsPdf({ unit: 'mm', format: 'a4' });
  if (embed) {
    const { NUNITO_SANS } = await import('./pdfFonts');
    doc.addFileToVFS('NunitoSans-Light.ttf', NUNITO_SANS.light);
    doc.addFont('NunitoSans-Light.ttf', PDF_FONT.light, 'normal');
    doc.addFileToVFS('NunitoSans-Regular.ttf', NUNITO_SANS.regular);
    doc.addFont('NunitoSans-Regular.ttf', PDF_FONT.regular, 'normal');
    doc.addFileToVFS('NunitoSans-SemiBold.ttf', NUNITO_SANS.semibold);
    doc.addFont('NunitoSans-SemiBold.ttf', PDF_FONT.regular, 'bold');
  }
  const family = (w: Weight): { name: string; style: 'normal' | 'bold' } => {
    if (!embed) return { name: 'helvetica', style: w === 'bold' ? 'bold' : 'normal' };
    return w === 'light' ? { name: PDF_FONT.light, style: 'normal' } : { name: PDF_FONT.regular, style: w === 'bold' ? 'bold' : 'normal' };
  };
  const font = (w: Weight, size: number) => {
    const f = family(w);
    doc.setFont(f.name, f.style);
    doc.setFontSize(size);
  };

  // Il PDF si stampa: sempre la variante chiara; le trasparenze si appoggiano sul fondo.
  const v = theme.light;
  const paper = '#ffffff';
  const col = {
    text: hexToRgb(flatten(v.text, paper)) as Rgb,
    muted: hexToRgb(flatten(v.textMuted, paper)) as Rgb,
    line: hexToRgb(flatten(v.line, paper)) as Rgb,
    lineAccent: hexToRgb(flatten(v.lineAccent, paper)) as Rgb,
    accent: hexToRgb(flatten(v.accent, paper)) as Rgb,
    accentText: hexToRgb(flatten(v.accentText, paper)) as Rgb,
  };

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - 2 * margin;

  // Maiuscoletto spaziato: `charSpace` allarga ogni lettera; per allineare a destra serve la larghezza vera.
  const spacing = 0.35;
  const spacedWidth = (text: string, size: number, w: Weight) => {
    font(w, size);
    return doc.getTextWidth(text) + spacing * text.length;
  };
  const caps = (text: string, x: number, y: number, size: number, color: Rgb, opts: { weight?: Weight; align?: 'left' | 'right' } = {}) => {
    const w = opts.weight ?? 'bold';
    font(w, size);
    doc.setTextColor(...color);
    const t = text.toUpperCase();
    const px = opts.align === 'right' ? x - spacedWidth(t, size, w) + spacing : x;
    doc.text(t, px, y, { charSpace: spacing });
  };

  // --- Intestazione: logo e nome azienda a sinistra, filetto sotto ---
  const header = (top: number): number => {
    let x = margin;
    const h = 11;
    if (logo) {
      const k = Math.min(h / logo.height, 40 / logo.width);
      doc.addImage(logo.dataUrl, logo.format, x, top, logo.width * k, logo.height * k);
      x += logo.width * k + 4;
    }
    if (theme.companyName) caps(theme.companyName, x, top + h / 2 + 1.2, 8.5, col.text);
    doc.setDrawColor(...col.line);
    doc.setLineWidth(0.15);
    doc.line(margin, top + h + 4, pageW - margin, top + h + 4);
    return top + h + 4;
  };

  // --- Prima pagina: titolo e dati ---
  const headerBottom = header(12);
  font('light', 26);
  doc.setTextColor(...col.text);
  doc.text('Nota spese', margin, headerBottom + 17);
  const metaY = headerBottom + 28;
  const meta: [string, string][] = [['Consulente', headerName], ['Destinatario', recipient.name], ['Mese', monthLabel(month)]];
  const metaX = [margin, margin + 58, margin + 128];
  meta.forEach(([k, val], i) => {
    caps(k, metaX[i], metaY, 6.5, col.muted);
    font('regular', 10);
    doc.setTextColor(...col.text);
    doc.text(val, metaX[i], metaY + 5.2, { maxWidth: i === 2 ? contentW - 128 : 54 });
  });

  // --- Tabella delle spese ---
  const heads = ['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato con'];
  const rightCols = new Set([5, 6]);
  autoTable(doc, {
    startY: metaY + 13,
    margin: { left: margin, right: margin, top: 20, bottom: 20 },
    theme: 'plain',
    head: [heads],
    body: totals.rows.map((e, i) => [
      String(i + 1),
      shortDate(e.date),
      e.place,
      e.supplier,
      categoryText(e),
      e.km != null ? String(e.km) : '',
      formatEuro(e.amountCents),
      e.invoice ? 'sì' : 'no',
      payerText(e),
    ]),
    styles: {
      font: family('light').name, fontStyle: family('light').style, fontSize: 8.5, cellPadding: { top: 2.6, bottom: 2.6, left: 0, right: 2 },
      textColor: col.text, lineWidth: 0, valign: 'middle',
    },
    headStyles: { cellPadding: { top: 0, bottom: 3, left: 0, right: 2 }, minCellHeight: 7, lineWidth: { bottom: 0.4 }, lineColor: col.accent },
    bodyStyles: { lineWidth: { bottom: 0.12 }, lineColor: col.line },
    columnStyles: {
      0: { cellWidth: 8, textColor: col.muted },
      1: { cellWidth: 14 },
      2: { cellWidth: 28 },
      4: { cellWidth: 25 },
      5: { halign: 'right', cellWidth: 11 },
      6: { halign: 'right', cellWidth: 23, cellPadding: { top: 2.6, bottom: 2.6, left: 0, right: 5 }, font: family('bold').name, fontStyle: family('bold').style },
      7: { cellWidth: 14 },
      8: { cellWidth: 26 },
    },
    didParseCell(d) {
      if (d.section === 'head') d.cell.text = []; // le etichette si disegnano a mano, spaziate
      if (d.section === 'body' && d.column.index === 7 && d.cell.raw === 'sì') d.cell.styles.textColor = col.accentText;
      if (d.section === 'body' && d.column.index === 7 && d.cell.raw === 'no') d.cell.styles.textColor = col.muted;
    },
    didDrawCell(d) {
      if (d.section !== 'head') return;
      const right = rightCols.has(d.column.index);
      const x = right ? d.cell.x + d.cell.width - (d.column.index === 6 ? 5 : 2) : d.cell.x;
      caps(heads[d.column.index], x, d.cell.y + d.cell.height - 4, 6.2, col.muted, { align: right ? 'right' : 'left' });
    },
  });

  // --- Totali: blocco proprio, a destra, con «Da rimborsare» in accentText ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y: number = ((doc as any).lastAutoTable?.finalY ?? 60) + 10;
  const rowsT: [string, number, boolean][] = [
    [TOTAL_LABELS.total, totals.totalCents, false],
    [TOTAL_LABELS.paidByCompany, totals.paidByCompanyCents, false],
    [TOTAL_LABELS.advanced, totals.advancedPersonallyCents, false],
    [reimburseLabel(recipient), totals.toReimburseCents, true],
  ];
  if (y + rowsT.length * 8 + 6 > pageH - 20) {
    doc.addPage();
    y = 24;
  }
  const bx = pageW - margin - 96;
  const bw = 96;
  doc.setDrawColor(...col.lineAccent);
  doc.setLineWidth(0.3);
  doc.line(bx, y, bx + bw, y);
  rowsT.forEach(([label, cents, big], i) => {
    const ry = y + 6.2 + i * 8 + (big ? 1 : 0);
    font(big ? 'regular' : 'light', big ? 11 : 9);
    doc.setTextColor(...(big ? col.accentText : col.text));
    doc.text(label, bx, ry);
    font('bold', big ? 11.5 : 9);
    doc.text(formatEuro(cents), bx + bw, ry, { align: 'right' });
    doc.setDrawColor(...(big ? col.lineAccent : col.line));
    doc.setLineWidth(big ? 0.3 : 0.12);
    doc.line(bx, ry + 2.6 + (big ? 0.4 : 0), bx + bw, ry + 2.6 + (big ? 0.4 : 0));
  });

  // --- Giustificativi: due foto per pagina, numerate come le righe della tabella, con la stessa intestazione ---
  const slotH = 120;
  let slot = 0;
  for (let i = 0; i < totals.rows.length; i++) {
    const e = totals.rows[i];
    const photo = photos.get(e.id);
    if (!photo) continue;
    if (slot % 2 === 0) {
      doc.addPage();
      const hb = header(12);
      caps(`Giustificativi · ${recipient.name} · ${monthLabel(month)}`, margin, hb + 9, 7, col.muted);
    }
    const top = 48 + (slot % 2) * slotH;
    // intestazione della foto: numero in accento, poi i dati della spesa, filetto d'accento
    font('bold', 11);
    doc.setTextColor(...col.accentText);
    doc.text(String(i + 1), margin, top);
    font('regular', 10);
    doc.setTextColor(...col.text);
    doc.text(`${e.supplier || categoryText(e)} · ${fullDate(e.date)}`, margin + 9, top);
    font('bold', 10);
    doc.text(formatEuro(e.amountCents), pageW - margin, top, { align: 'right' });
    doc.setDrawColor(...col.lineAccent);
    doc.setLineWidth(0.3);
    doc.line(margin, top + 2.5, pageW - margin, top + 2.5);

    const { url, format } = await blobToDataUrl(photo);
    const props = doc.getImageProperties(url);
    const maxW = contentW;
    const maxH = slotH - 20;
    const k = Math.min(maxW / props.width, maxH / props.height);
    doc.addImage(url, format, margin, top + 6, props.width * k, props.height * k);
    slot++;
  }

  // --- Piè di pagina su ogni pagina: azienda e «pagina N di M» ---
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...col.line);
    doc.setLineWidth(0.15);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    caps(theme.companyName || 'Nota spese', margin, pageH - 9, 6.5, col.muted);
    font('light', 8);
    doc.setTextColor(...col.muted);
    doc.text(`pagina ${p} di ${pages}`, pageW - margin, pageH - 9, { align: 'right' });
  }

  return doc.output('blob');
}
