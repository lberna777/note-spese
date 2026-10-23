// Dati comuni a PDF ed Excel.
import { CATEGORY_LABELS, PAYER_LABELS } from '../labels';
import type { MonthTotals } from '../totals';
import type { Card, Expense, Recipient } from '../types';

export interface ExportInput {
  headerName: string;
  recipient: Recipient;
  month: string; // AAAA-MM
  totals: MonthTotals;
  cards: Card[];
  photos: Map<string, Blob>; // id della spesa -> foto JPEG
}

export function categoryText(e: Expense): string {
  return CATEGORY_LABELS[e.category];
}

// «Azienda» / «Personale»: valore puro, usato anche dalle formule SUMIF dell'Excel
export function payerText(e: Expense): string {
  return PAYER_LABELS[e.payer];
}

export function methodText(e: Expense, cards: Card[]): string {
  if (!e.cardId) return 'contanti';
  const c = cards.find((x) => x.id === e.cardId);
  return c ? `carta ****${c.last4}` : 'carta';
}

export function reimburseLabel(r: Recipient): string {
  return r.kind === 'cliente' ? 'Da rimborsare' : 'Da rimborsare al consulente';
}

export function exportFilename(r: Recipient, month: string, ext: 'pdf' | 'xlsx'): string {
  const slug = r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `nota-spese-${slug}-${month}.${ext}`;
}
