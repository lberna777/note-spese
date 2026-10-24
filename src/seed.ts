// Dati finti, tutti inventati, caricati alla prima apertura.
import type { Expense, KnownSupplier, Recipient, Route, Settings } from './types';

export interface SeedData {
  recipients: Recipient[];
  routes: Route[];
  settings: Settings;
  expenses: Expense[];
  knownSuppliers: KnownSupplier[];
}

export const RATE_CENTS_PER_KM = 50;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildSeed(now: Date = new Date()): SeedData {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  const day = (d: number) => `${y}-${pad(m)}-${pad(Math.min(d, lastDay))}`;

  const recipients: Recipient[] = [
    { id: 'r-lunari', name: 'Officine Lunari S.p.A.', kind: 'cliente', defaultPlace: 'Milano', active: true },
    { id: 'r-ardesia', name: 'Gruppo Ardesia S.r.l.', kind: 'cliente', defaultPlace: 'Verona', active: true },
    { id: 'r-azienda', name: 'Studio Aurora S.r.l.', kind: 'azienda', defaultPlace: 'Milano', active: true },
  ];
  const routes: Route[] = [
    { id: 'rt-mi', from: 'Bologna', to: 'Milano', km: 214 },
    { id: 'rt-vr', from: 'Bologna', to: 'Verona', km: 140 },
  ];
  const settings: Settings = {
    centsPerKm: RATE_CENTS_PER_KM,
    headerName: 'Mario Rossi',
    lastBackupAt: null,
    appearance: 'auto',
  };

  let n = 0;
  const exp = (p: Partial<Expense> & Pick<Expense, 'date' | 'recipientId' | 'place' | 'supplier' | 'category' | 'amountCents' | 'invoice' | 'payer'>): Expense => ({
    id: `seed-${String(++n).padStart(2, '0')}`,
    routeId: null,
    roundTrip: false,
    km: null,
    photoId: null,
    notes: '',
    readState: 'manuale',
    ...p,
  });

  const expenses: Expense[] = [
    exp({ date: day(3), recipientId: 'r-lunari', place: 'Milano', supplier: 'Trenitalia', category: 'treno', amountCents: 4290, invoice: true, payer: 'azienda' }),
    exp({ date: day(3), recipientId: 'r-lunari', place: 'Milano', supplier: 'Radiotaxi', category: 'taxi', amountCents: 1850, invoice: false, payer: 'personale' }),
    exp({ date: day(3), recipientId: 'r-lunari', place: 'Milano', supplier: 'Trattoria del Portico', category: 'pasto', amountCents: 1650, invoice: false, payer: 'personale' }),
    exp({ date: day(4), recipientId: 'r-lunari', place: 'Milano', supplier: 'Trenitalia', category: 'treno', amountCents: 4290, invoice: true, payer: 'azienda' }),
    exp({ date: day(10), recipientId: 'r-lunari', place: 'Milano', supplier: 'Viaggio in auto', category: 'auto', amountCents: 21400, invoice: false, payer: 'personale', routeId: 'rt-mi', roundTrip: true, km: 428 }),
    exp({ date: day(6), recipientId: 'r-ardesia', place: 'Verona', supplier: 'Italo', category: 'treno', amountCents: 3190, invoice: true, payer: 'azienda' }),
    exp({ date: day(6), recipientId: 'r-ardesia', place: 'Verona', supplier: 'Radiotaxi', category: 'taxi', amountCents: 1400, invoice: false, payer: 'personale' }),
    exp({ date: day(6), recipientId: 'r-ardesia', place: 'Verona', supplier: 'Ristorante Al Ponte', category: 'pasto', amountCents: 2200, invoice: true, payer: 'personale' }),
    exp({ date: day(13), recipientId: 'r-ardesia', place: 'Verona', supplier: 'Viaggio in auto', category: 'auto', amountCents: 14000, invoice: false, payer: 'personale', routeId: 'rt-vr', roundTrip: true, km: 280 }),
    exp({ date: day(13), recipientId: 'r-ardesia', place: 'Verona', supplier: 'Autosilo Centro', category: 'parcheggio', amountCents: 900, invoice: false, payer: 'personale' }),
    exp({ date: day(8), recipientId: 'r-azienda', place: 'Milano', supplier: 'Hotel Centrale', category: 'alloggio', amountCents: 12800, invoice: true, payer: 'azienda' }),
    exp({ date: day(8), recipientId: 'r-azienda', place: 'Milano', supplier: 'Bar Pasticceria Roma', category: 'pasto', amountCents: 780, invoice: false, payer: 'personale' }),
    exp({ date: day(15), recipientId: 'r-azienda', place: 'Bologna', supplier: 'Cartoleria Il Quaderno', category: 'altro', amountCents: 1245, invoice: true, payer: 'azienda' }),
    exp({ date: day(15), recipientId: 'r-azienda', place: 'Bologna', supplier: 'Radiotaxi', category: 'taxi', amountCents: 1620, invoice: false, payer: 'personale' }),
    exp({ date: day(20), recipientId: 'r-azienda', place: 'Milano', supplier: 'Trenitalia', category: 'treno', amountCents: 4290, invoice: true, payer: 'personale' }),
  ];

  const knownSuppliers: KnownSupplier[] = [
    { name: 'TRENITALIA', category: 'treno', place: '' },
    { name: 'ITALO', category: 'treno', place: '' },
    { name: 'RADIOTAXI', category: 'taxi', place: '' },
    { name: 'TRATTORIA DEL PORTICO', category: 'pasto', place: 'Milano' },
  ];

  return { recipients, routes, settings, expenses, knownSuppliers };
}
