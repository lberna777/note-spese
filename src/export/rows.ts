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
  // Assente = nota spese normale. Con `personal` è l'estratto per l'azienda delle spese di un cliente pagate con
  // la carta personale: `totals` contiene solo quelle righe e `refs` i loro numeri nella nota per il cliente.
  personal?: { companyName: string; refs: number[] };
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

// Testi dell'estratto «carta personale» per l'azienda (PDF, Excel e schermate).
export const PERSONAL = {
  title: 'Carta personale',
  badge: 'Estratto per l’azienda',
  section: 'Per l’azienda · carta personale',
  total: 'Totale con carta personale',
  reimburse: 'Da rimborsare al consulente',
  none: 'Nessuna spesa con la carta personale in questo mese: l’estratto per l’azienda non serve.',
  intro: (client: string) =>
    `Spese della nota per ${client} pagate con la carta personale del consulente, che l’azienda gli rimborsa. «Rif.» è il numero della riga nella nota spese per il cliente.`,
} as const;

// Il file dell'estratto ha lo stesso nome della nota con «-carta-personale» in fondo: nella cartella stanno vicini.
export function exportFilename(r: Recipient, month: string, ext: 'pdf' | 'xlsx', personal = false): string {
  const slug = r.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `nota-spese-${slug}-${month}${personal ? '-carta-personale' : ''}.${ext}`;
}
