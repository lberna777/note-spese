import { describe, expect, it } from 'vitest';
import { suggestPayer } from './payer';
import { shouldShowIosHint } from './ios';
import type { Expense } from './types';

function e(id: string, date: string, recipientId: string, payer: 'azienda' | 'personale'): Expense {
  return {
    id, date, recipientId, place: '', supplier: '', category: 'altro', amountCents: 100, invoice: false,
    payer, routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale',
  };
}

describe('pagamento proposto', () => {
  it('senza spese per quel destinatario: carta aziendale', () => {
    expect(suggestPayer([], 'a')).toBe('azienda');
    expect(suggestPayer([e('1', '2026-10-01', 'b', 'personale')], 'a')).toBe('azienda');
  });
  it('altrimenti l’ultimo usato per lo stesso destinatario (data più recente)', () => {
    const all = [
      e('1', '2026-10-09', 'a', 'personale'),
      e('2', '2026-10-02', 'a', 'azienda'),
      e('3', '2026-10-20', 'b', 'azienda'),
    ];
    expect(suggestPayer(all, 'a')).toBe('personale');
    expect(suggestPayer(all, 'b')).toBe('azienda');
  });
  it('a parità di data vale l’ultima in elenco', () => {
    const all = [e('1', '2026-10-09', 'a', 'azienda'), e('2', '2026-10-09', 'a', 'personale')];
    expect(suggestPayer(all, 'a')).toBe('personale');
  });
});

describe('suggerimento per iPhone', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  it('compare su iOS fuori dalla modalità standalone', () => {
    expect(shouldShowIosHint({ userAgent: iphone })).toBe(true);
    expect(shouldShowIosHint({ userAgent: iphone, standalone: false, displayStandalone: false })).toBe(true);
  });
  it('non compare se già installata (navigator.standalone o display-mode)', () => {
    expect(shouldShowIosHint({ userAgent: iphone, standalone: true })).toBe(false);
    expect(shouldShowIosHint({ userAgent: iphone, displayStandalone: true })).toBe(false);
  });
  it('iPadOS (si presenta come Mac tattile) sì, un Mac o un Android no', () => {
    expect(shouldShowIosHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(shouldShowIosHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(shouldShowIosHint({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile' })).toBe(false);
  });
});
