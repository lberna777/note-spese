import { describe, expect, it } from 'vitest';
import { autoAmountCents, autoKm, formatEuro, formatRatePerKm, parseAmount, parseRatePerKm } from './money';

describe('formatEuro', () => {
  it('formatta all’italiana', () => {
    expect(formatEuro(123450)).toBe('1.234,50 €');
    expect(formatEuro(5)).toBe('0,05 €');
    expect(formatEuro(0)).toBe('0,00 €');
    expect(formatEuro(100000000)).toBe('1.000.000,00 €');
    expect(formatEuro(-250)).toBe('-2,50 €');
  });
});

describe('parseAmount', () => {
  it('legge gli importi digitati', () => {
    expect(parseAmount('12,5')).toBe(1250);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12')).toBe(1200);
    expect(parseAmount('1.234,50')).toBe(123450);
    expect(parseAmount('1,234.50')).toBe(123450);
    expect(parseAmount('1.234')).toBe(123400);
    expect(parseAmount('€ 7,05')).toBe(705);
    expect(parseAmount('0,99')).toBe(99);
  });
  it('rifiuta ciò che non è un importo', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12,345,6')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
});

describe('calcolo auto', () => {
  const route = { id: 'x', from: 'Bologna', to: 'Milano', km: 214 };
  it('andata e ritorno a 50 c/km = 214,00 €', () => {
    const km = autoKm(route, true);
    expect(km).toBe(428);
    expect(formatEuro(autoAmountCents(km, 50))).toBe('214,00 €');
  });
  it('sola andata', () => {
    expect(autoKm(route, false)).toBe(214);
  });
  it('tariffa con decimali', () => {
    expect(autoAmountCents(150, 58.91)).toBe(8837);
  });
});

describe('tariffa al km', () => {
  it('converte da e verso €/km con 4 decimali', () => {
    expect(formatRatePerKm(50)).toBe('0,5000');
    expect(formatRatePerKm(58.91)).toBe('0,5891');
    expect(parseRatePerKm('0,5891')).toBeCloseTo(58.91, 6);
    expect(parseRatePerKm('x')).toBeNull();
  });
});
