// Archivio IndexedDB: tutto resta nel telefono.
import { openDB, type IDBPDatabase } from 'idb';
import { buildSeed, type SeedData } from './seed';
import type { Card, Expense, KnownSupplier, Photo, Recipient, Route, Settings } from './types';

export const DB_NAME = 'note-spese';
const SETTINGS_KEY = 'main';

export const STORES = ['expenses', 'photos', 'recipients', 'cards', 'routes', 'settings', 'knownSuppliers'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBPDatabase> | null = null;

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function open(): Promise<IDBPDatabase> {
  const db = await openDB(DB_NAME, 1, {
    upgrade(d) {
      for (const name of ['expenses', 'photos', 'recipients', 'cards', 'routes']) d.createObjectStore(name, { keyPath: 'id' });
      d.createObjectStore('settings'); // una sola voce, chiave «main»
      d.createObjectStore('knownSuppliers', { keyPath: 'name' });
    },
  });
  // Dati finti solo alla prima apertura: la presenza delle impostazioni è il segnale.
  if ((await db.get('settings', SETTINGS_KEY)) === undefined) {
    const s = buildSeed();
    const tx = db.transaction([...STORES], 'readwrite');
    if ((await tx.objectStore('settings').get(SETTINGS_KEY)) === undefined) {
      await writeAll(tx, s);
    }
    await tx.done;
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* la memoria persistente è facoltativa */
    }
  }
  return db;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeAll(tx: any, s: SeedData): Promise<void> {
  for (const r of s.recipients) await tx.objectStore('recipients').put(r);
  for (const c of s.cards) await tx.objectStore('cards').put(c);
  for (const r of s.routes) await tx.objectStore('routes').put(r);
  for (const e of s.expenses) await tx.objectStore('expenses').put(e);
  for (const k of s.knownSuppliers) await tx.objectStore('knownSuppliers').put(k);
  await tx.objectStore('settings').put(s.settings, SETTINGS_KEY);
}

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

// Solo per i test: chiude e dimentica la connessione.
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
}

// --- spese ---
export async function listExpenses(): Promise<Expense[]> {
  return (await getDb()).getAll('expenses');
}
export async function getExpense(id: string): Promise<Expense | undefined> {
  return (await getDb()).get('expenses', id);
}
export async function putExpense(e: Expense): Promise<void> {
  await (await getDb()).put('expenses', e);
}
export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  const e: Expense | undefined = await db.get('expenses', id);
  await db.delete('expenses', id);
  if (e?.photoId) await db.delete('photos', e.photoId);
}

// --- foto ---
export async function putPhoto(p: Photo): Promise<void> {
  await (await getDb()).put('photos', p);
}
export async function getPhoto(id: string): Promise<Photo | undefined> {
  return (await getDb()).get('photos', id);
}
export async function deletePhoto(id: string): Promise<void> {
  await (await getDb()).delete('photos', id);
}

// --- destinatari, carte, tratte ---
export async function listRecipients(): Promise<Recipient[]> {
  return (await getDb()).getAll('recipients');
}
export async function putRecipient(r: Recipient): Promise<void> {
  await (await getDb()).put('recipients', r);
}
export async function listCards(): Promise<Card[]> {
  return (await getDb()).getAll('cards');
}
export async function putCard(c: Card): Promise<void> {
  await (await getDb()).put('cards', c);
}
export async function deleteCard(id: string): Promise<void> {
  await (await getDb()).delete('cards', id);
}
export async function listRoutes(): Promise<Route[]> {
  return (await getDb()).getAll('routes');
}
export async function putRoute(r: Route): Promise<void> {
  await (await getDb()).put('routes', r);
}
export async function deleteRoute(id: string): Promise<void> {
  await (await getDb()).delete('routes', id);
}

// --- impostazioni ---
export async function getSettings(): Promise<Settings> {
  return (await getDb()).get('settings', SETTINGS_KEY) as Promise<Settings>;
}
export async function putSettings(s: Settings): Promise<void> {
  await (await getDb()).put('settings', s, SETTINGS_KEY);
}

// --- fornitori noti ---
export async function listKnownSuppliers(): Promise<KnownSupplier[]> {
  return (await getDb()).getAll('knownSuppliers');
}
export async function putKnownSupplier(k: KnownSupplier): Promise<void> {
  await (await getDb()).put('knownSuppliers', { ...k, name: k.name.trim().toUpperCase() });
}

// --- tutto l'archivio (backup) ---
export interface DumpData {
  expenses: Expense[];
  photos: Photo[];
  recipients: Recipient[];
  cards: Card[];
  routes: Route[];
  settings: Settings;
  knownSuppliers: KnownSupplier[];
}

export async function readEverything(): Promise<DumpData> {
  const db = await getDb();
  return {
    expenses: await db.getAll('expenses'),
    photos: await db.getAll('photos'),
    recipients: await db.getAll('recipients'),
    cards: await db.getAll('cards'),
    routes: await db.getAll('routes'),
    settings: (await db.get('settings', SETTINGS_KEY)) as Settings,
    knownSuppliers: await db.getAll('knownSuppliers'),
  };
}

// Sostituisce tutto l'archivio con i dati dati.
export async function replaceEverything(d: DumpData): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...STORES], 'readwrite');
  for (const name of STORES) await tx.objectStore(name).clear();
  await writeAll(tx, { ...d, settings: d.settings });
  for (const p of d.photos) await tx.objectStore('photos').put(p);
  await tx.done;
}
