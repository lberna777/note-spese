// Modello dei dati (piano.md, «Modello dei dati»). Importi sempre in centesimi interi.

export type Id = string;

export type RecipientKind = 'cliente' | 'azienda';
export type Payer = 'azienda' | 'personale';

export type Category =
  | 'treno'
  | 'taxi'
  | 'pasto'
  | 'auto'
  | 'alloggio'
  | 'parcheggio'
  | 'altro';

export interface Recipient {
  updatedAt?: number; // ms, ultima modifica locale (sincronizzazione)
  id: Id;
  name: string;
  kind: RecipientKind;
  defaultPlace: string;
  active: boolean;
}

export interface Route {
  updatedAt?: number; // ms, ultima modifica locale (sincronizzazione)
  id: Id;
  from: string;
  to: string;
  km: number; // sola andata
}

export interface Settings {
  centsPerKm: number; // può avere decimali: 0,5891 €/km = 58.91
  headerName: string;
  lastBackupAt: string | null; // ISO
  appearance?: 'auto' | 'light' | 'dark'; // assente = «auto» (segue il sistema)
}

export type ReadState = 'letta' | 'corretta' | 'manuale';

export interface Expense {
  updatedAt?: number; // ms, ultima modifica locale (sincronizzazione)
  id: Id;
  date: string; // AAAA-MM-GG
  recipientId: Id;
  place: string;
  supplier: string;
  category: Category;
  amountCents: number;
  invoice: boolean;
  payer: Payer;
  routeId: Id | null; // solo auto
  roundTrip: boolean; // solo auto
  km: number | null;
  photoId: Id | null;
  notes: string;
  readState: ReadState;
}

export interface Photo {
  updatedAt?: number; // ms, ultima modifica locale (sincronizzazione)
  id: Id;
  blob: Blob;
}

export interface KnownSupplier {
  updatedAt?: number; // ms, ultima modifica locale (sincronizzazione)
  name: string; // chiave, normalizzata in maiuscolo
  category: Category;
  place: string;
}

// Risultato della lettura di uno scontrino: ogni campo è facoltativo e ha una confidenza.
export type Confidence = 'alta' | 'bassa';

export interface Field<T> {
  value: T;
  confidence: Confidence;
}

export interface ReceiptDraft {
  date?: Field<string>; // AAAA-MM-GG
  amountCents?: Field<number>;
  supplier?: Field<string>;
  place?: Field<string>;
  category?: Field<Category>;
  invoice?: Field<boolean>;
}

export interface ParseContext {
  recipients: Recipient[];
  knownSuppliers: KnownSupplier[];
}
