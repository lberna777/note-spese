// Importi in centesimi interi: formattazione, lettura di quanto digitato, calcolo dei km.
import type { Route } from './types';

// 123450 -> «1.234,50 €» (separatore delle migliaia anche sotto le cinque cifre)
export function formatEuro(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped},${rest} €`;
}

// Importo senza simbolo, per i campi di testo: 1250 -> «12,50»
export function formatDecimal(cents: number): string {
  return formatEuro(cents).replace(' €', '');
}

// «12,5» «12.50» «1.234,50» «1,234.50» «€ 12» -> centesimi; null se non è un importo.
export function parseAmount(input: string): number | null {
  let s = input.replace(/[€\s]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart = s;
  let decPart = '';
  const sepIdx = Math.max(lastComma, lastDot);
  if (sepIdx >= 0) {
    const after = s.slice(sepIdx + 1);
    const sep = s[sepIdx];
    const sameCount = s.split(sep).length - 1;
    const bothKinds = lastComma >= 0 && lastDot >= 0;
    // Un solo separatore ripetuto, o seguito da 3 cifre, è delle migliaia («1.234»).
    const thousands = !bothKinds && (sameCount > 1 || after.length === 3);
    if (!thousands) {
      if (after.length === 0 || after.length > 2) return null;
      intPart = s.slice(0, sepIdx);
      decPart = after;
    }
  }
  if (!/^(\d+|\d{1,3}([.,]\d{3})+)$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, '');
  if (intPart === '') intPart = '0';
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0') || '0');
  return Number.isFinite(cents) ? cents : null;
}

// km totali di una tratta (andata e ritorno = doppio)
export function autoKm(route: Route, roundTrip: boolean): number {
  return route.km * (roundTrip ? 2 : 1);
}

// importo in centesimi: km * centesimi al km (anche con decimali, es. 58.91)
export function autoAmountCents(km: number, centsPerKm: number): number {
  return Math.round(km * centsPerKm);
}

// tariffa in €/km con 4 decimali: 58.91 -> «0,5891»
export function formatRatePerKm(centsPerKm: number): string {
  return (centsPerKm / 100).toFixed(4).replace('.', ',');
}

// «0,5891» o «0.5891» -> centesimi al km (58.91); null se non valido
export function parseRatePerKm(input: string): number | null {
  const n = Number(input.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || input.trim() === '') return null;
  return Math.round(n * 10000) / 100;
}
