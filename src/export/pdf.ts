// Nota spese in PDF A4, nello stile del tema: fascia d'intestazione, tabella, totali, piè di pagina
// con numerazione e, in coda, tutti i giustificativi (foto) numerati come le righe.
import { formatEuro } from '../money';
import { fullDate, monthLabel, shortDate } from '../labels';
import { hexToRgb, type Theme } from '../theme';
import { categoryText, payerText, reimburseLabel, TOTAL_LABELS, type ExportInput } from './rows';

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => hexToRgb(hex);

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

function headingFont(theme: Theme): 'times' | 'helvetica' {
  return theme.fonts.heading === 'serif' ? 'times' : 'helvetica';
}

export async function buildPdf(input: ExportInput): Promise<Blob> {
  // Caricamento al bisogno: jsPDF pesa e non serve all'avvio.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { headerName, recipient, month, totals, photos, theme, logo } = input;
  const c = theme.colors;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const hFont = headingFont(theme);
  const branded = !!(theme.companyName || logo);

  // --- Fascia d'intestazione (solo se il tema ha un marchio) ---
  let y = 16;
  if (branded) {
    const bandH = 26;
    doc.setFillColor(...rgb(c.primary));
    doc.rect(0, 0, pageW, bandH, 'F');
    doc.setFillColor(...rgb(c.accent));
    doc.rect(0, bandH, pageW, 1.2, 'F');
    let x = margin;
    if (logo) {
      const k = Math.min(18 / logo.height, 50 / logo.width);
      const w = logo.width * k;
      const h = logo.height * k;
      doc.addImage(logo.dataUrl, logo.format, x, (bandH - h) / 2, w, h);
      x += w + 5;
    }
    if (theme.companyName) {
      doc.setTextColor(255, 255, 255);
      doc.setFont(hFont, 'bold');
      doc.setFontSize(14);
      doc.text(theme.companyName, x, bandH / 2 + 2);
    }
    y = bandH + 12;
  }

  // --- Titolo e dati ---
  doc.setTextColor(...rgb(c.primary));
  doc.setFont(hFont, 'bold');
  doc.setFontSize(20);
  doc.text('Nota spese', margin, y);
  doc.setDrawColor(...rgb(c.accent));
  doc.setLineWidth(0.6);
  doc.line(margin, y + 2.5, margin + 32, y + 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const meta: [string, string][] = [['Consulente', headerName], ['Destinatario', recipient.name], ['Mese', monthLabel(month)]];
  meta.forEach(([k, v], i) => {
    const ly = y + 10 + i * 5;
    doc.setTextColor(...rgb(c.textMuted));
    doc.text(`${k}:`, margin, ly);
    doc.setTextColor(...rgb(c.text));
    doc.text(v, margin + 26, ly);
  });

  // --- Tabella delle spese ---
  autoTable(doc, {
    startY: y + 10 + meta.length * 5 + 1,
    margin: { left: margin, right: margin, bottom: 20 },
    head: [['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato con']],
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
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5, textColor: rgb(c.text), lineColor: rgb(c.surface) },
    headStyles: { fillColor: rgb(c.primary), textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: rgb(c.surface) },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 13 }, 5: { halign: 'right', cellWidth: 11 }, 6: { halign: 'right', cellWidth: 22 }, 7: { cellWidth: 13 } },
  });

  // --- Riquadro dei totali, bordato in accent ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let afterTable: number = (doc as any).lastAutoTable?.finalY ?? 40;
  if (afterTable + 6 + 36 > pageH - 20) {
    doc.addPage();
    afterTable = margin - 6;
  }
  const bold = { fontStyle: 'bold' as const };
  autoTable(doc, {
    startY: afterTable + 6,
    margin: { left: pageW - margin - 100, right: margin, bottom: 20 },
    theme: 'grid',
    body: [
      [TOTAL_LABELS.total, formatEuro(totals.totalCents)],
      [TOTAL_LABELS.paidByCompany, formatEuro(totals.paidByCompanyCents)],
      [TOTAL_LABELS.advanced, formatEuro(totals.advancedPersonallyCents)],
      [
        { content: reimburseLabel(recipient), styles: { ...bold, fillColor: rgb(c.surface), textColor: rgb(c.primary) } },
        { content: formatEuro(totals.toReimburseCents), styles: { ...bold, fillColor: rgb(c.surface), textColor: rgb(c.primary) } },
      ],
    ],
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2, textColor: rgb(c.text), lineColor: rgb(c.accent), lineWidth: 0.3 },
    columnStyles: { 0: { cellWidth: 65 }, 1: { halign: 'right', cellWidth: 35 } },
  });

  // --- Giustificativi: due foto per pagina, numerate come le righe della tabella ---
  const slotH = 130;
  let slot = 0;
  for (let i = 0; i < totals.rows.length; i++) {
    const e = totals.rows[i];
    const photo = photos.get(e.id);
    if (!photo) continue;
    if (slot % 2 === 0) {
      doc.addPage();
      doc.setFillColor(...rgb(c.primary));
      doc.rect(0, 0, pageW, 12, 'F');
      doc.setFillColor(...rgb(c.accent));
      doc.rect(0, 12, pageW, 0.8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(hFont, 'bold');
      doc.setFontSize(11);
      doc.text(`Giustificativi - ${recipient.name} - ${monthLabel(month)}`, margin, 8);
    }
    const top = 22 + (slot % 2) * slotH;
    // intestazione della foto: riquadro col numero, poi i dati della spesa, filetto in accent
    doc.setFillColor(...rgb(c.primary));
    doc.rect(margin, top - 5.5, 8, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(String(i + 1), margin + 4, top - 0.6, { align: 'center' });
    doc.setTextColor(...rgb(c.text));
    doc.text(`${e.supplier || categoryText(e)} - ${fullDate(e.date)} - ${formatEuro(e.amountCents)}`, margin + 11, top - 0.6);
    doc.setDrawColor(...rgb(c.accent));
    doc.setLineWidth(0.4);
    doc.line(margin, top + 2, pageW - margin, top + 2);

    const { url, format } = await blobToDataUrl(photo);
    const props = doc.getImageProperties(url);
    const maxW = pageW - 2 * margin;
    const maxH = slotH - 18;
    const k = Math.min(maxW / props.width, maxH / props.height);
    doc.addImage(url, format, margin, top + 5, props.width * k, props.height * k);
    slot++;
  }

  // --- Piè di pagina su ogni pagina: azienda e «pagina N di M» ---
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...rgb(c.accent));
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...rgb(c.textMuted));
    doc.text(theme.companyName || 'Nota spese', margin, pageH - 7.5);
    doc.text(`pagina ${p} di ${pages}`, pageW - margin, pageH - 7.5, { align: 'right' });
  }

  return doc.output('blob');
}
