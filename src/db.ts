// Archivio IndexedDB: tutto resta nel telefono.
import { openDB, type IDBPDatabase } from 'idb';
import { buildSeed, type SeedData } from './seed';
import { DEFAULT_THEME, validateTheme, type Theme } from './theme';
import type { Expense, KnownSupplier, Photo, Recipient, Route, Settings } from './types';

export const DB_NAME = 'note-spese';
export const DB_VERSION = 2;
const SETTINGS_KEY = 'main';
const THEME_KEY = 'theme';

export const STORES = ['expenses', 'photos', 'recipients', 'routes', 'settings', 'knownSuppliers'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBPDatabase> | null = null;
let onBlocked: (() => void) | undefined;

// L'interfaccia si registra per sapere se l'apertura dell'archivio è bloccata da un'altra scheda.
export function setBlockedListener(fn: (() => void) | undefined): void {
  onBlocked = fn;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function open(): Promise<IDBPDatabase> {
  const db = await openDB(DB_NAME, DB_VERSION, {
    async upgrade(d, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        for (const name of ['expenses', 'photos', 'recipients', 'routes']) d.createObjectStore(name, { keyPath: 'id' });
        d.createObjectStore('settings'); // voci: «main» (impostazioni) e «theme» (tema grafico)
        d.createObjectStore('knownSuppliers', { keyPath: 'name' });
      } else if (oldVersion < 2) {
        // v1 → v2: via le carte e il loro numero; le spese tengono solo «pagato da».
        if (d.objectStoreNames.contains('cards' as never)) d.deleteObjectStore('cards');
        let cursor = await tx.objectStore('expenses').openCursor();
        while (cursor) {
          const e = { ...cursor.value } as Record<string, unknown>;
          if ('cardId' in e) {
            delete e.cardId;
            await cursor.update(e);
          }
          cursor = await cursor.continue();
        }
      }
    },
    // Un'altra scheda tiene aperta una versione vecchia dell'archivio: l'aggiornamento aspetta
    // che si chiuda. Lo si dice all'interfaccia invece di restare in attesa senza spiegazioni.
    blocked() {
      onBlocked?.();
    },
    // Questa scheda è la versione vecchia: chiude l'archivio e si ricarica con il codice nuovo.
    blocking() {
      dbPromise?.then((d) => d.close()).catch(() => undefined);
      dbPromise = null;
      location.reload();
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
async function writeAll(tx: any, s: SeedData & { theme?: Theme | null }): Promise<void> {
  for (const r of s.recipients) await tx.objectStore('recipients').put(r);
  for (const r of s.routes) await tx.objectStore('routes').put(r);
  for (const e of s.expenses) await tx.objectStore('expenses').put(e);
  for (const k of s.knownSuppliers) await tx.objectStore('knownSuppliers').put(k);
  await tx.objectStore('settings').put(s.settings, SETTINGS_KEY);
  if (s.theme) await tx.objectStore('settings').put(s.theme, THEME_KEY);
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

// --- destinatari, tratte ---
export async function listRecipients(): Promise<Recipient[]> {
  return (await getDb()).getAll('recipients');
}
export async function putRecipient(r: Recipient): Promise<void> {
  await (await getDb()).put('recipients', r);
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
  const s = (await (await getDb()).get('settings', SETTINGS_KEY)) as Settings;
  return { ...s, appearance: s.appearance ?? 'auto' };
}
export async function putSettings(s: Settings): Promise<void> {
  await (await getDb()).put('settings', s, SETTINGS_KEY);
}

// --- tema grafico (solo sul telefono) ---
export async function getTheme(): Promise<Theme> {
  const raw = await (await getDb()).get('settings', THEME_KEY);
  if (raw === undefined) return DEFAULT_THEME;
  try {
    return validateTheme(raw);
  } catch {
    return DEFAULT_THEME;
  }
}
export async function putTheme(t: Theme): Promise<void> {
  await (await getDb()).put('settings', t, THEME_KEY);
}
export async function deleteTheme(): Promise<void> {
  await (await getDb()).delete('settings', THEME_KEY);
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
  routes: Route[];
  settings: Settings;
  knownSuppliers: KnownSupplier[];
  theme: Theme | null; // null = tema predefinito
}

export async function readEverything(): Promise<DumpData> {
  const db = await getDb();
  return {
    expenses: await db.getAll('expenses'),
    photos: await db.getAll('photos'),
    recipients: await db.getAll('recipients'),
    routes: await db.getAll('routes'),
    settings: (await db.get('settings', SETTINGS_KEY)) as Settings,
    knownSuppliers: await db.getAll('knownSuppliers'),
    theme: ((await db.get('settings', THEME_KEY)) as Theme | undefined) ?? null,
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
