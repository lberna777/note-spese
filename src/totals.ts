// Totali di un mese per destinatario e riepilogo degli anticipi del consulente.
import { orderRows } from './order';
import type { Expense, Recipient } from './types';

export interface MonthTotals {
  rows: Expense[]; // nell'ordine scelto, altrimenti per data
  totalCents: number;
  paidByCompanyCents: number;
  advancedPersonallyCents: number;
  // cliente: tutto il totale; azienda: solo quanto anticipato dal consulente
  toReimburseCents: number;
}

export interface AdvanceRow {
  recipient: Recipient;
  advancedCents: number;
}

export function inMonth(e: Expense, month: string): boolean {
  return e.date.startsWith(month);
}

export function monthTotals(
  expenses: Expense[],
  recipient: Recipient,
  month: string,
): MonthTotals {
  const rows = orderRows(expenses.filter((e) => e.recipientId === recipient.id && inMonth(e, month)));
  let totalCents = 0;
  let paidByCompanyCents = 0;
  let advancedPersonallyCents = 0;
  for (const e of rows) {
    totalCents += e.amountCents;
    if (e.payer === 'azienda') paidByCompanyCents += e.amountCents;
    else advancedPersonallyCents += e.amountCents;
  }
  const toReimburseCents = recipient.kind === 'cliente' ? totalCents : advancedPersonallyCents;
  return { rows, totalCents, paidByCompanyCents, advancedPersonallyCents, toReimburseCents };
}

// Estratto per l'azienda della nota di un cliente: solo le spese pagate con la carta personale, nello stesso
// ordine della nota; `refs[i]` è il numero che la riga i ha nella nota per il cliente (per confrontarle).
export interface PersonalExtract extends MonthTotals {
  refs: number[];
}

export function personalExtract(t: MonthTotals): PersonalExtract {
  const rows: Expense[] = [];
  const refs: number[] = [];
  t.rows.forEach((e, i) => {
    if (e.payer !== 'personale') return;
    rows.push(e);
    refs.push(i + 1);
  });
  const total = rows.reduce((s, e) => s + e.amountCents, 0);
  return { rows, refs, totalCents: total, paidByCompanyCents: 0, advancedPersonallyCents: total, toReimburseCents: total };
}

// Nome dell'azienda a cui va l'estratto: il destinatario di tipo «azienda», altrimenti il nome del tema.
export function companyNameOf(recipients: Recipient[], themeCompanyName: string): string {
  const r = recipients.find((x) => x.kind === 'azienda' && x.active) ?? recipients.find((x) => x.kind === 'azienda');
  return r?.name || themeCompanyName || 'Azienda';
}

// Per ogni destinatario quanto il consulente ha anticipato nel mese.
export function advanceSummary(
  expenses: Expense[],
  recipients: Recipient[],
  month: string,
): AdvanceRow[] {
  return recipients.map((recipient) => ({
    recipient,
    advancedCents: monthTotals(expenses, recipient, month).advancedPersonallyCents,
  }));
}

// Separa gli elementi dell'azienda da quelli dei clienti, per mostrarli in blocchi distinti.
export function splitByKind<T>(items: T[], recipientOf: (item: T) => Recipient): { company: T[]; clients: T[] } {
  return {
    company: items.filter((i) => recipientOf(i).kind === 'azienda'),
    clients: items.filter((i) => recipientOf(i).kind !== 'azienda'),
  };
}
