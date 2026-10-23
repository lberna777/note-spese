import { describe, expect, it } from 'vitest';
import { kindLabel } from './labels';

describe('kindLabel', () => {
  it('cliente resta «Cliente»', () => {
    expect(kindLabel('cliente', { shortName: 'Studio Aurora', companyName: 'Studio Aurora S.r.l.' })).toBe('Cliente');
  });
  it('l’azienda prende il nome breve del tema, poi il nome completo, poi un testo neutro', () => {
    expect(kindLabel('azienda', { shortName: 'Studio Aurora', companyName: 'Studio Aurora S.r.l.' })).toBe('Studio Aurora');
    expect(kindLabel('azienda', { shortName: '', companyName: 'Studio Aurora S.r.l.' })).toBe('Studio Aurora S.r.l.');
    expect(kindLabel('azienda', { shortName: '', companyName: '' })).toBe('La tua azienda');
  });
});
