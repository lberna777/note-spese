// Nota spese in PDF A4: intestazione, tabella, totali, foto dei giustificativi.
import { formatEuro } from '../money';
import { fullDate, monthLabel, shortDate } from '../labels';
import { categoryText, methodText, payerText, reimburseLabel, type ExportInput } from './rows';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function buildPdf(input: ExportInput): Promise<Blob> {
  // Caricamento al bisogno: jsPDF pesa e non serve all'avvio.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { headerName, recipient, month, totals, cards, photos } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Nota spese', margin, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Consulente: ${headerName}`, margin, 23);
  doc.text(`Destinatario: ${recipient.name}`, margin, 28);
  doc.text(`Mese: ${monthLabel(month)}`, margin, 33);

  autoTable(doc, {
    startY: 38,
    margin: { left: margin, right: margin },
    head: [['N.', 'Data', 'Località', 'Fornitore', 'Tipologia', 'Km', 'Importo', 'Fattura', 'Pagato da']],
    body: totals.rows.map((e, i) => [
      String(i + 1),
      shortDate(e.date),
      e.place,
      e.supplier,
      categoryText(e),
      e.km != null ? String(e.km) : '',
      formatEuro(e.amountCents),
      e.invoice ? 'sì' : 'no',
      `${payerText(e)} (${methodText(e, cards)})`,
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [31, 58, 95] },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 13 }, 5: { halign: 'right', cellWidth: 11 }, 6: { halign: 'right', cellWidth: 22 }, 7: { cellWidth: 13 } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTable: number = (doc as any).lastAutoTable?.finalY ?? 40;
  autoTable(doc, {
    startY: afterTable + 6,
    margin: { left: pageW - margin - 90, right: margin },
    theme: 'grid',
    body: [
      ['Totale complessivo', formatEuro(totals.totalCents)],
      ['Pagato dall\'azienda', formatEuro(totals.paidByCompanyCents)],
      ['Anticipato dal consulente', formatEuro(totals.advancedPersonallyCents)],
      [{ content: reimburseLabel(recipient), styles: { fontStyle: 'bold' } }, { content: formatEuro(totals.toReimburseCents), styles: { fontStyle: 'bold' } }],
    ],
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { halign: 'right', cellWidth: 35 } },
  });

  // Giustificativi: due foto per pagina, numerate come le righe della tabella.
  const slotH = 130;
  let slot = 0;
  for (let i = 0; i < totals.rows.length; i++) {
    const e = totals.rows[i];
    const photo = photos.get(e.id);
    if (!photo) continue;
    if (slot % 2 === 0) {
      doc.addPage();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Giustificativi - ${recipient.name} - ${monthLabel(month)}`, margin, 14);
    }
    const top = 20 + (slot % 2) * slotH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${i + 1}. ${e.supplier} - ${fullDate(e.date)} - ${formatEuro(e.amountCents)}`, margin, top);
    const url = await blobToDataUrl(photo);
    const props = doc.getImageProperties(url);
    const maxW = pageW - 2 * margin;
    const maxH = slotH - 14;
    const k = Math.min(maxW / props.width, maxH / props.height);
    doc.addImage(url, 'JPEG', margin, top + 3, props.width * k, props.height * k);
    slot++;
  }

  return doc.output('blob');
}
