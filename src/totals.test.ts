import { describe, expect, it } from 'vitest';
import { advanceSummary, monthTotals } from './totals';
import type { Expense, Recipient } from './types';

const cliente: Recipient = { id: 'c', name: 'Cliente', kind: 'cliente', defaultPlace: '', active: true };
const company: Recipient = { id: 'n', name: 'Azienda', kind: 'azienda', defaultPlace: '', active: true };

function e(id: string, date: string, recipientId: string, amountCents: number, payer: 'azienda' | 'personale'): Expense {
  return {
    id, date, recipientId, place: '', supplier: '', category: 'altro', amountCents, invoice: false,
    payer, cardId: null, routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale',
  };
}

const all = [
  e('1', '2026-10-09', 'c', 1000, 'azienda'),
  e('2', '2026-10-02', 'c', 500, 'personale'),
  e('3', '2026-10-05', 'n', 700, 'personale'),
  e('4', '2026-10-06', 'n', 300, 'azienda'),
  e('5', '2026-11-01', 'c', 9999, 'personale'), // altro mese
];

describe('monthTotals', () => {
  it('cliente: da rimborsare = totale; righe per data', () => {
    const t = monthTotals(all, cliente, '2026-10');
    expect(t.rows.map((r) => r.id)).toEqual(['2', '1']);
    expect(t.totalCents).toBe(1500);
    expect(t.paidByCompanyCents).toBe(1000);
    expect(t.advancedPersonallyCents).toBe(500);
    expect(t.toReimburseCents).toBe(1500);
  });
  it('azienda: da rimborsare = anticipato dal consulente', () => {
    const t = monthTotals(all, company, '2026-10');
    expect(t.totalCents).toBe(1000);
    expect(t.paidByCompanyCents).toBe(300);
    expect(t.advancedPersonallyCents).toBe(700);
    expect(t.toReimburseCents).toBe(700);
  });
  it('mese vuoto', () => {
    expect(monthTotals(all, cliente, '2026-09').totalCents).toBe(0);
  });
});

describe('advanceSummary', () => {
  it('quanto il consulente ha anticipato per destinatario', () => {
    const s = advanceSummary(all, [cliente, company], '2026-10');
    expect(s.map((r) => r.advancedCents)).toEqual([500, 700]);
  });
});
