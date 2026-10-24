// Totali di un mese per destinatario e riepilogo degli anticipi del consulente.
import type { Expense, Recipient } from './types';

export interface MonthTotals {
  rows: Expense[]; // ordinate per data
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
  const rows = expenses
    .filter((e) => e.recipientId === recipient.id && inMonth(e, month))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
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
