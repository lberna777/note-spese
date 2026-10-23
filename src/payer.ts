// Pagamento proposto per una nuova spesa: l'ultimo usato per lo stesso destinatario,
// altrimenti la carta aziendale. «Ultimo» = data più recente (a parità, l'ultima in elenco).
import type { Expense, Payer } from './types';

export function suggestPayer(expenses: Expense[], recipientId: string): Payer {
  const own = expenses.map((e, i) => ({ e, i })).filter((x) => x.e.recipientId === recipientId);
  if (own.length === 0) return 'azienda';
  own.sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i);
  return own[own.length - 1].e.payer;
}
