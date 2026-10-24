// Etichette in italiano condivise da interfaccia ed esportazioni.
import type { Theme } from './theme';
import type { Category, Payer, RecipientKind } from './types';

export const CATEGORY_LABELS: Record<Category, string> = {
  treno: 'Treno',
  taxi: 'Taxi',
  pasto: 'Pasto',
  auto: 'Auto',
  alloggio: 'Alloggio',
  parcheggio: 'Parcheggio e pedaggio',
  altro: 'Altro',
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

// Tipo di destinatario: «Cliente» oppure il nome della propria azienda preso dal tema.
export function kindLabel(kind: RecipientKind, theme: Pick<Theme, 'shortName' | 'companyName'>): string {
  if (kind === 'cliente') return 'Cliente';
  return theme.shortName || theme.companyName || 'La tua azienda';
}

export const PAYER_LABELS: Record<Payer, string> = { azienda: 'Carta aziendale', personale: 'Carta personale' };

// Forma breve per elenchi e tabelle.
export const PAYER_SHORT: Record<Payer, string> = { azienda: 'Aziendale', personale: 'Personale' };

export const APPEARANCE_LABELS = { auto: 'Automatico', light: 'Chiaro', dark: 'Scuro' } as const;

const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

// '2026-10' -> 'ottobre 2026'
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

// '2026-10-05' -> '05/10'
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// '2026-10-05' -> '05/10/2026'
export function fullDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return currentMonth(new Date(y, m - 1 + delta, 1));
}

export function todayIso(now: Date = new Date()): string {
  return `${currentMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;
}
