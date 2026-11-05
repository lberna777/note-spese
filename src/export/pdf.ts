// Nota spese in PDF A4 orizzontale (297 × 210 mm, anche i giustificativi), nello stesso linguaggio dell'app: sempre
// la variante chiara del tema, logo e nome in alto, «Nota spese» leggero e grande con i dati sulla stessa riga,
// etichette in maiuscoletto spaziato, filetti al posto dei riquadri, importi a destra in grassetto, totali con
// «Da rimborsare» in accentText, piè di pagina con «pagina N di M» e, in coda, i giustificativi numerati come le
// righe, due per pagina affiancati. Con `input.personal` lo stesso impianto diventa l'estratto per l'azienda delle
// spese del cliente pagate con la carta personale: colonna «Rif.» al posto di «Pagato con», un solo totale. Carattere: Nunito Sans incorporato (tema `avenir`) o Helvetica (`system`).
import type { jsPDF } from 'jspdf';
import { formatEuro } from '../money';
import { fullDate, monthLabel, shortDate } from '../labels';
import { flatten, hexToRgb } from '../theme';
import { categoryText, payerText, PERSONAL, reimburseLabel, TOTAL_LABELS, type ExportInput } from './rows';

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
  const { headerName, recipient, month, totals, photos, theme, logo, personal } = input;
  const embed = theme.font === 'avenir';
  const doc: jsPDF = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'landscape' });
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

  // Testo tagliato con «…» se non sta nella larghezza (solo dove l'intestazione deve restare su una riga).
  const fit = (t: string, maxW: number) => {
    if (doc.getTextWidth(t) <= maxW) return t;
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  };

  // --- Intestazione di ogni pagina: logo e nome azienda a sinistra, a destra un'etichetta facoltativa, filetto sotto ---
  const headTop = 12;
  const header = (right?: { text: string; color: Rgb }): number => {
    let x = margin;
    const h = 11;
    if (logo) {
      const k = Math.min(h / logo.height, 40 / logo.width);
      doc.addImage(logo.dataUrl, logo.format, x, headTop, logo.width * k, logo.height * k);
      x += logo.width * k + 4;
    }
    if (theme.companyName) caps(theme.companyName, x, headTop + h / 2 + 1.2, 8.5, col.text);
    if (right) caps(right.text, pageW - margin, headTop + h / 2 + 1.2, 7.5, right.color, { align: 'right' });
    doc.setDrawColor(...col.line);
    doc.setLineWidth(0.15);
    doc.line(margin, headTop + h + 4, pageW - margin, headTop + h + 4);
    return headTop + h + 4;
  };

  // --- Prima pagina: a chi è rivolta la nota (interna, per il cliente o estratto per l'azienda) in alto a destra;
  // poi titolo e dati su una riga ---
  const badge = personal ? PERSONAL.badge : recipient.kind === 'azienda' ? 'Nota spese interna' : 'Nota spese per il cliente';
  const headerBottom = header({ text: badge, color: col.accentText });
  const titleY = headerBottom + 15;
  font('light', 26);
  doc.setTextColor(...col.text);
  doc.text(personal ? PERSONAL.title : 'Nota spese', margin, titleY);
  const meta: [string, string][] = personal
    ? [['Destinatario', personal.companyName], ['Cliente', recipient.name], ['Consulente', headerName], ['Mese', monthLabel(month)]]
    : [['Consulente', headerName], ['Destinatario', recipient.name], ['Mese', monthLabel(month)]];
  const metaX0 = margin + 78;
  const metaW = (contentW - 78) / meta.length;
  meta.forEach(([k, val], i) => {
    const x = metaX0 + i * metaW;
    caps(k, x, titleY - 6.5, 6.5, col.muted);
    font('regular', 10);
    doc.setTextColor(...col.text);
    doc.text(val, x, titleY, { maxWidth: metaW - 4 });
  });

  // Estratto: una riga che spiega che cosa contiene e che cos'è «Rif.».
  if (personal) {
    font('light', 8.5);
    doc.setTextColor(...col.muted);
    doc.text(PERSONAL.intro(recipient.name), margin, titleY + 8, { maxWidth: contentW });
  }

  // --- Tabella delle spese: tutta la larghezza utile, Località e Fornitore larghe, Km e Fattura strette.
  // Nell'estratto «Pagato con» non serve (è sempre la carta personale): al suo posto «Rif.», il numero nella nota ---
  const heads = personal
    ? ['N.', 'Rif.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura']
    : ['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato con'];
  // somma = 269 mm, la larghezza utile
  const widths = personal ? [8, 12, 16, 58, 85, 30, 12, 30, 18] : [8, 16, 50, 75, 30, 12, 26, 18, 34];
  const off = personal ? 1 : 0; // le colonne da «Data» in poi slittano di una
  const C = { km: 5 + off, amount: 6 + off, invoice: 7 + off };
  const amountPad = 5;
  const rightCols = new Set([C.km, C.amount]);
  autoTable(doc, {
    startY: titleY + (personal ? 14 : 10),
    // sulle pagine successive la tabella riparte sotto l'intestazione, con le etichette delle colonne ripetute
    margin: { left: margin, right: margin, top: headerBottom + 8, bottom: 20 },
    theme: 'plain',
    head: [heads],
    body: totals.rows.map((e, i) => [
      String(i + 1),
      ...(personal ? [String(personal.refs[i])] : []),
      shortDate(e.date),
      e.place,
      e.supplier,
      categoryText(e),
      e.km != null ? String(e.km) : '',
      formatEuro(e.amountCents),
      e.invoice ? 'sì' : 'no',
      ...(personal ? [] : [payerText(e)]),
    ]),
    styles: {
      font: family('light').name, fontStyle: family('light').style, fontSize: 9, cellPadding: { top: 2.6, bottom: 2.6, left: 0, right: 3 },
      textColor: col.text, lineWidth: 0, valign: 'middle',
    },
    headStyles: { cellPadding: { top: 0, bottom: 3, left: 0, right: 3 }, minCellHeight: 7, lineWidth: { bottom: 0.4 }, lineColor: col.accent },
    bodyStyles: { lineWidth: { bottom: 0.12 }, lineColor: col.line },
    columnStyles: {
      ...Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
      0: { cellWidth: widths[0], textColor: col.muted },
      ...(personal ? { 1: { cellWidth: widths[1], textColor: col.muted } } : {}),
      [C.km]: { cellWidth: widths[C.km], halign: 'right' },
      [C.amount]: {
        cellWidth: widths[C.amount], halign: 'right', cellPadding: { top: 2.6, bottom: 2.6, left: 0, right: amountPad },
        font: family('bold').name, fontStyle: family('bold').style,
      },
    },
    didParseCell(d) {
      if (d.section === 'head') d.cell.text = []; // le etichette si disegnano a mano, spaziate
      if (d.section === 'body' && d.column.index === C.invoice && d.cell.raw === 'sì') d.cell.styles.textColor = col.accentText;
      if (d.section === 'body' && d.column.index === C.invoice && d.cell.raw === 'no') d.cell.styles.textColor = col.muted;
    },
    didDrawCell(d) {
      if (d.section !== 'head') return;
      const right = rightCols.has(d.column.index);
      const x = right ? d.cell.x + d.cell.width - (d.column.index === C.amount ? amountPad : 3) : d.cell.x;
      caps(heads[d.column.index], x, d.cell.y + d.cell.height - 4, 6.2, col.muted, { align: right ? 'right' : 'left' });
    },
    didDrawPage(d) {
      if (d.pageNumber > 1) header();
    },
  });

  // --- Totali: blocco proprio, allineato a destra sotto la tabella, con «Da rimborsare» in accentText ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y: number = ((doc as any).lastAutoTable?.finalY ?? 60) + 10;
  const rowsT: [string, number, boolean][] = personal
    ? [
        [PERSONAL.total, totals.totalCents, false],
        [PERSONAL.reimburse, totals.toReimburseCents, true],
      ]
    : [
        [TOTAL_LABELS.total, totals.totalCents, false],
        [TOTAL_LABELS.paidByCompany, totals.paidByCompanyCents, false],
        [TOTAL_LABELS.advanced, totals.advancedPersonallyCents, false],
        [reimburseLabel(recipient), totals.toReimburseCents, true],
      ];
  if (y + rowsT.length * 8 + 6 > pageH - 20) {
    doc.addPage();
    y = header() + 10;
  }
  const bw = 100;
  const bx = pageW - margin - bw;
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

  // --- Giustificativi in coda, numerati come le righe: due verticali affiancati per pagina; da solo quello
  // orizzontale, e quello verticale che resta senza compagno ---
  const proofs: { n: number; e: (typeof totals.rows)[number]; url: string; format: 'PNG' | 'JPEG'; w: number; h: number }[] = [];
  for (let i = 0; i < totals.rows.length; i++) {
    const e = totals.rows[i];
    const photo = photos.get(e.id);
    if (!photo) continue;
    const { url, format } = await blobToDataUrl(photo);
    const props = doc.getImageProperties(url);
    proofs.push({ n: i + 1, e, url, format, w: props.width, h: props.height });
  }
  const upright = (p: (typeof proofs)[number]) => p.h >= p.w;
  const groups: (typeof proofs)[] = [];
  for (let k = 0; k < proofs.length; k++) {
    const a = proofs[k];
    const b = proofs[k + 1];
    if (upright(a) && b && upright(b)) {
      groups.push([a, b]);
      k++;
    } else groups.push([a]);
  }

  const gap = 12;
  for (const group of groups) {
    doc.addPage();
    const hb = header();
    caps(`Giustificativi · ${personal ? `${PERSONAL.title} · ` : ''}${recipient.name} · ${monthLabel(month)}`, margin, hb + 9, 7, col.muted);
    const top = hb + 19;
    const imgTop = top + 6;
    const imgBottom = pageH - 20;
    const slotW = group.length === 2 ? (contentW - gap) / 2 : contentW;
    group.forEach((p, j) => {
      const x = margin + j * (slotW + gap);
      // intestazione della foto: numero in accento, poi i dati della spesa, importo a destra, filetto d'accento
      font('bold', 11);
      doc.setTextColor(...col.accentText);
      doc.text(String(p.n), x, top);
      font('bold', 10);
      const amount = formatEuro(p.e.amountCents);
      const amountW = doc.getTextWidth(amount);
      doc.setTextColor(...col.text);
      doc.text(amount, x + slotW, top, { align: 'right' });
      font('regular', 10);
      doc.text(fit(`${p.e.supplier || categoryText(p.e)} · ${fullDate(p.e.date)}`, slotW - 9 - amountW - 4), x + 9, top);
      doc.setDrawColor(...col.lineAccent);
      doc.setLineWidth(0.3);
      doc.line(x, top + 2.5, x + slotW, top + 2.5);

      // foto centrata nel suo spazio, con un filetto sottile: gli scontrini scansionati hanno il fondo bianco come la carta
      const k = Math.min(slotW / p.w, (imgBottom - imgTop) / p.h);
      const iw = p.w * k;
      const ih = p.h * k;
      const ix = x + (slotW - iw) / 2;
      doc.addImage(p.url, p.format, ix, imgTop, iw, ih);
      doc.setDrawColor(...col.line);
      doc.setLineWidth(0.12);
      doc.rect(ix, imgTop, iw, ih);
    });
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
