// Dati comuni a PDF ed Excel.
import { CATEGORY_LABELS, PAYER_LABELS } from '../labels';
import type { Theme } from '../theme';
import type { MonthTotals } from '../totals';
import type { Expense, Recipient } from '../types';

// Logo già pronto per PDF ed Excel: solo PNG o JPEG (gli SVG si rasterizzano prima, vedi logo.ts).
export interface RasterLogo {
  dataUrl: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
}

export interface ExportInput {
  headerName: string;
  recipient: Recipient;
  month: string; // AAAA-MM
  totals: MonthTotals;
  photos: Map<string, Blob>; // id della spesa -> foto JPEG
  theme: Theme;
  logo: RasterLogo | null;
}

export function categoryText(e: Expense): string {
  return CATEGORY_LABELS[e.category];
}

// «Carta aziendale» / «Carta personale»: valore puro, usato anche dalle formule SUMIF dell'Excel
export function payerText(e: Expense): string {
  return PAYER_LABELS[e.payer];
}

export const TOTAL_LABELS = {
  total: 'Totale complessivo',
  paidByCompany: 'Pagato con carta aziendale',
  advanced: 'Anticipato con carta personale',
} as const;

export function reimburseLabel(r: Recipient): string {
  return r.kind === 'cliente' ? 'Da rimborsare' : 'Da rimborsare al consulente';
}

export function exportFilename(r: Recipient, month: string, ext: 'pdf' | 'xlsx'): string {
  const slug = r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `nota-spese-${slug}-${month}.${ext}`;
}
