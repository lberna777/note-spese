import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ParseContext } from '../types';
import {
  findAmounts,
  findDate,
  findInvoice,
  findKeywordCategory,
  findPlace,
  findSupplier,
  findTotal,
  parseAmount,
  parseReceipt,
  titleCase,
  toIsoDate,
} from './parse';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'src', 'receipt', 'fixtures', `${name}.txt`), 'utf8');

// Dati inventati: un fornitore noto.
const ctx: ParseContext = {
  recipients: [],
  knownSuppliers: [{ name: 'PARKING CENTRO', category: 'parcheggio', place: 'Bologna' }],
};
const noKnown: ParseContext = { ...ctx, knownSuppliers: [] };

describe('parseAmount / findAmounts', () => {
  it('legge i formati con virgola, punto e migliaia', () => {
    expect(parseAmount('12,50')).toBe(1250);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('1.234,50')).toBe(123450);
    expect(parseAmount('1,234.50')).toBe(123450);
    expect(parseAmount('0,99')).toBe(99);
  });
  it('corregge O/0 e I/l e gli spazi attorno al separatore', () => {
    expect(parseAmount('1O,5O')).toBe(1050);
    expect(parseAmount('12 , 50')).toBe(1250);
    expect(parseAmount('l2,50')).toBe(1250);
  });
  it('rifiuta ciò che non è un importo', () => {
    expect(parseAmount('12')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('trova più importi in una riga', () => {
    expect(findAmounts('CAFFE 2 x 1,20  2,40')).toEqual([120, 240]);
    expect(findAmounts('P.IVA 01234567890')).toEqual([]);
  });
});

describe('findTotal', () => {
  it('preferisce TOTALE COMPLESSIVO e scarta SUBTOTALE, IVA, RESTO, CONTANTE', () => {
    const t = 'SUBTOTALE 30,00\nTOTALE COMPLESSIVO 27,50\nIVA 10% 2,50\nCONTANTE 50,00\nRESTO 22,50';
    expect(findTotal(t)).toEqual({ value: 2750, confidence: 'alta' });
  });
  it('TOTALE EURO vale più di TOTALE semplice', () => {
    expect(findTotal('TOTALE 5,00\nTOTALE EURO 7,00')?.value).toBe(700);
  });
  it('accetta IMPORTO, TOTAL, DA PAGARE', () => {
    expect(findTotal('IMPORTO EUR 18,50')?.value).toBe(1850);
    expect(findTotal('TOTAL 9,90')?.value).toBe(990);
    expect(findTotal('DA PAGARE 4,00')?.value).toBe(400);
  });
  it('prende l\'ultimo importo della riga', () => {
    expect(findTotal('TOTALE 2 ARTICOLI 3,50 7,00')?.value).toBe(700);
  });
  it('importo andato a capo', () => {
    expect(findTotal('TOTALE EURO\n12,30')?.value).toBe(1230);
  });
  it('senza riga del totale: importo massimo, confidenza bassa', () => {
    expect(findTotal('A 3,00\nB 8,50\nCONTANTI 20,00')).toEqual({ value: 850, confidence: 'bassa' });
  });
  it('nessun importo: niente', () => {
    expect(findTotal('ciao\nmondo')).toBeUndefined();
  });
});

describe('findDate', () => {
  it('accetta /, -, . e anno a due cifre', () => {
    expect(findDate('12/10/2026')?.value).toBe('2026-10-12');
    expect(findDate('12-10-2026')?.value).toBe('2026-10-12');
    expect(findDate('12.10.2026')?.value).toBe('2026-10-12');
    expect(findDate('2.1.26')?.value).toBe('2026-01-02');
  });
  it('con l\'ora vicina', () => {
    expect(findDate('12/10/2026 13:41')?.value).toBe('2026-10-12');
    expect(findDate('ore 19:22 del 15.10.26')?.value).toBe('2026-10-15');
  });
  it('scarta le date impossibili', () => {
    expect(toIsoDate('31', '02', '2026')).toBeNull();
    expect(toIsoDate('10', '13', '2026')).toBeNull();
    expect(findDate('31/02/2026')).toBeUndefined();
    expect(findDate('31/02/2026 e 01/03/2026')).toEqual({ value: '2026-03-01', confidence: 'alta' });
  });
  it('più date valide: la prima, bassa se diverse; alta se coincidono', () => {
    expect(findDate('07/10/2026 e 09/10/2026')).toEqual({ value: '2026-10-07', confidence: 'bassa' });
    expect(findDate('14/10/2026\n14/10/2026')?.confidence).toBe('alta');
  });
  it('tollera O al posto di 0', () => {
    expect(findDate('O9/1O/2O26')?.value).toBe('2026-10-09');
  });
  it('non scambia importi o P.IVA per date', () => {
    expect(findDate('TOTALE 12,50\nP.IVA 01234567890')).toBeUndefined();
  });
});

describe('findSupplier', () => {
  it('salta intestazioni generiche, simboli e righe brevi', () => {
    const t = '***\nAB\nDOCUMENTO COMMERCIALE\ndi vendita o prestazione\nSCONTRINO\nBAR DEL CORSO\nVia X 1';
    expect(findSupplier(t)).toEqual({ value: 'BAR DEL CORSO', confidence: 'bassa' });
  });
  it('preferisce la riga con la forma societaria', () => {
    expect(findSupplier('BAR ROMA\nROSSI FOOD S.R.L.\nVia A 3')?.value).toBe('ROSSI FOOD S.R.L.');
    expect(findSupplier('NEGOZIO\nVERDI SNC')?.value).toBe('VERDI SNC');
  });
  it('non prende l\'indirizzo', () => {
    expect(findSupplier('Via Roma 5\nP.IVA 123\nPIZZERIA DA MARCO')?.value).toBe('PIZZERIA DA MARCO');
    // righe unite dall'OCR: si taglia al totale o al primo importo
    expect(findSupplier('TRENITALIA TOTALE 42,90')?.value).toBe('TRENITALIA');
    expect(findSupplier('BAR ROMA 3,50 EUR')?.value).toBe('BAR ROMA');
  });
});

describe('findPlace', () => {
  it('CAP + comune, capitalizzato', () => {
    expect(findPlace('X\nVia A 1\n40121 BOLOGNA (BO)')).toEqual({ value: 'Bologna', confidence: 'alta' });
    expect(findPlace('Via A 1 - 40026 IMOLA BO')?.value).toBe('Imola');
    expect(findPlace('40100 SAN LAZZARO DI SAVENA')?.value).toBe('San Lazzaro di Savena');
  });
  it('senza CAP: assente', () => {
    expect(findPlace('Via A 1\nBOLOGNA')).toBeUndefined();
  });
  it('titleCase gestisce gli apostrofi', () => {
    expect(titleCase("CASTEL D'AIANO")).toBe("Castel D'Aiano");
  });
});

describe('findInvoice', () => {
  it('FATTURA e FATTURA ELETTRONICA: sì, alta', () => {
    expect(findInvoice('FATTURA n. 12')).toEqual({ value: true, confidence: 'alta' });
    expect(findInvoice('Fattura elettronica')).toEqual({ value: true, confidence: 'alta' });
  });
  it('«non fattura» o «non valido come fattura»: no, alta', () => {
    expect(findInvoice('SCONTRINO NON VALIDO COME FATTURA')).toEqual({ value: false, confidence: 'alta' });
    expect(findInvoice('NON FATTURA')).toEqual({ value: false, confidence: 'alta' });
  });
  it('documento commerciale o scontrino: no, alta; altrimenti no, bassa', () => {
    expect(findInvoice('DOCUMENTO COMMERCIALE')).toEqual({ value: false, confidence: 'alta' });
    expect(findInvoice('SCONTRINO')).toEqual({ value: false, confidence: 'alta' });
    expect(findInvoice('RICEVUTA')).toEqual({ value: false, confidence: 'bassa' });
  });
});

describe('tipologia', () => {
  it.each([
    ['TRENITALIA', 'treno'],
    ['ITALO NTV', 'treno'],
    ['TRENORD biglietto', 'treno'],
    ['RADIOTAXI', 'taxi'],
    ['CAB SERVICE', 'taxi'],
    ['HOTEL ROMA', 'alloggio'],
    ['B&B IL NIDO', 'alloggio'],
    ['AUTOSTRADE PER L\'ITALIA', 'parcheggio'],
    ['TELEPASS', 'parcheggio'],
    ['PIZZERIA NAPOLI', 'pasto'],
    ['CAFFÈ CENTRALE', 'pasto'],
    ['Coperto 2', 'pasto'],
  ])('%s → %s', (text, cat) => {
    expect(findKeywordCategory(text)).toBe(cat);
  });
  it('nessuna parola chiave: assente', () => {
    expect(findKeywordCategory('FARMACIA CENTRALE')).toBeUndefined();
    expect(findKeywordCategory('BARI')).toBeUndefined(); // «BAR» solo come parola intera
  });
  it('fornitore noto: tipologia alta e località del fornitore se non letta', () => {
    const d = parseReceipt('PARKING CENTRO S.R.L.\nTOTALE 5,00', ctx);
    expect(d.category).toEqual({ value: 'parcheggio', confidence: 'alta' });
    expect(d.place).toEqual({ value: 'Bologna', confidence: 'alta' });
  });
  it('fornitore noto: la località letta non viene sostituita', () => {
    const d = parseReceipt('PARKING CENTRO\n40026 IMOLA\nTOTALE 5,00', ctx);
    expect(d.place?.value).toBe('Imola');
  });
  it('parole chiave: confidenza bassa', () => {
    expect(parseReceipt('TAXI 5\nTOTALE 5,00', noKnown).category).toEqual({ value: 'taxi', confidence: 'bassa' });
  });
});

describe('fixture di scontrini finti', () => {
  it('trattoria, documento commerciale', () => {
    const d = parseReceipt(fixture('trattoria-carta'), ctx);
    expect(d).toEqual({
      amountCents: { value: 2750, confidence: 'alta' },
      date: { value: '2026-10-12', confidence: 'alta' },
      supplier: { value: 'TRATTORIA DA GINO S.R.L.', confidence: 'bassa' },
      place: { value: 'Bologna', confidence: 'alta' },
      invoice: { value: false, confidence: 'alta' },
      category: { value: 'pasto', confidence: 'bassa' },
    });
  });
  it('bar con contanti e resto', () => {
    const d = parseReceipt(fixture('bar-contanti'), ctx);
    expect(d.amountCents).toEqual({ value: 270, confidence: 'alta' });
    expect(d.date?.value).toBe('2026-10-03');
    expect(d.supplier?.value).toBe('BAR SPORT DI ROSSI');
    expect(d.place?.value).toBe('Imola');
    expect(d.invoice).toEqual({ value: false, confidence: 'alta' });
    expect(d.category?.value).toBe('pasto');
  });
  it('taxi con ricevuta', () => {
    const d = parseReceipt(fixture('taxi-pos'), ctx);
    expect(d.amountCents).toEqual({ value: 1850, confidence: 'alta' });
    expect(d.date?.value).toBe('2026-10-15');
    expect(d.supplier?.value).toBe('RADIOTAXI BOLOGNA');
    expect(d.place).toBeUndefined();
    expect(d.category?.value).toBe('taxi');
    expect(d.invoice?.confidence).toBe('bassa');
  });
  it('biglietto Trenitalia', () => {
    const d = parseReceipt(fixture('trenitalia'), ctx);
    expect(d.amountCents).toEqual({ value: 2790, confidence: 'alta' });
    expect(d.date).toEqual({ value: '2026-10-14', confidence: 'alta' });
    expect(d.supplier?.value).toBe('TRENITALIA');
    expect(d.category?.value).toBe('treno');
  });
  it('fattura di albergo con P.IVA', () => {
    const d = parseReceipt(fixture('albergo-fattura'), ctx);
    expect(d.amountCents).toEqual({ value: 11500, confidence: 'alta' });
    expect(d.date?.value).toBe('2026-09-22');
    expect(d.supplier?.value).toBe('HOTEL BELLAVISTA S.P.A.');
    expect(d.place?.value).toBe('Milano');
    expect(d.invoice).toEqual({ value: true, confidence: 'alta' });
    expect(d.category?.value).toBe('alloggio');
  });
  it('parcheggio (fornitore sconosciuto, parola chiave)', () => {
    const d = parseReceipt(fixture('parcheggio'), noKnown);
    expect(d.amountCents).toEqual({ value: 1200, confidence: 'alta' });
    expect(d.date).toEqual({ value: '2026-10-07', confidence: 'alta' });
    expect(d.supplier?.value).toBe('PARKING CENTRO S.R.L.S.');
    expect(d.place?.value).toBe('San Lazzaro di Savena');
    expect(d.category).toEqual({ value: 'parcheggio', confidence: 'bassa' });
    expect(d.invoice).toEqual({ value: false, confidence: 'bassa' });
  });
  it('parcheggio con fornitore noto', () => {
    const d = parseReceipt(fixture('parcheggio'), ctx);
    expect(d.category).toEqual({ value: 'parcheggio', confidence: 'alta' });
    expect(d.place?.value).toBe('San Lazzaro di Savena'); // letta, non sostituita
  });
  it('scontrino sporco: O al posto di 0, 1 al posto di I, spazi', () => {
    const d = parseReceipt(fixture('sporco'), ctx);
    expect(d.amountCents).toEqual({ value: 1250, confidence: 'alta' });
    expect(d.date?.value).toBe('2026-10-09');
    expect(d.supplier?.value).toBe('RISTORANTE LA PIAZZETTA SNC');
    expect(d.place?.value).toBe('Bologna');
    expect(d.invoice).toEqual({ value: false, confidence: 'alta' });
    expect(d.category?.value).toBe('pasto');
  });
  it('senza riga TOTALE: importo massimo, bassa', () => {
    const d = parseReceipt(fixture('senza-totale'), ctx);
    expect(d.amountCents).toEqual({ value: 850, confidence: 'bassa' });
    expect(d.date?.value).toBe('2026-10-11');
    expect(d.place?.value).toBe('Bologna');
    expect(d.category?.value).toBe('pasto');
  });
  it('importo con migliaia e data impossibile scartata', () => {
    const d = parseReceipt(fixture('sconosciuta-carta'), ctx);
    expect(d.amountCents).toEqual({ value: 123450, confidence: 'alta' });
    expect(d.date).toEqual({ value: '2026-11-05', confidence: 'alta' });
    expect(d.category).toBeUndefined();
    expect(d.invoice).toEqual({ value: false, confidence: 'alta' });
  });
  it('testo vuoto: solo la fattura (no, bassa)', () => {
    expect(parseReceipt('', ctx)).toEqual({ invoice: { value: false, confidence: 'bassa' } });
  });
});
