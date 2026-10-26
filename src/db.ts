// Archivio IndexedDB: tutto resta nel telefono. Dalla versione 3 ogni record ha `updatedAt` e le
// cancellazioni lasciano una lapide (`deleted: true`), così la sincronizzazione (src/sync) può
// propagarle. Le letture escludono le lapidi: per l'interfaccia l'archivio è quello di prima.
import { openDB, type IDBPDatabase } from 'idb';
import { buildSeed, seedIds, type SeedData } from './seed';
import { DEFAULT_THEME, validateTheme, type Theme } from './theme';
import type { Expense, KnownSupplier, Photo, Recipient, Route, Settings } from './types';

export const DB_NAME = 'note-spese';
export const DB_VERSION = 3;
const SETTINGS_KEY = 'main';
const THEME_KEY = 'theme';
// Parte di impostazioni che resta nel dispositivo (aspetto e promemoria di backup): non si sincronizza.
const LOCAL_KEY = 'local';
// Segnale nell'archivio: dopo «Cancella tutto» i dati finti non si ricaricano più.
const NO_SEED_KEY = 'noSeed';
const SYNC_KEY = 'state';

// Le lapidi si tengono 90 giorni (docs/sync.md, «Algoritmo sul dispositivo», punto 4).
export const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// Store dei dati dell'utente (lo store `settings` contiene anche le voci locali).
export const STORES = ['expenses', 'photos', 'recipients', 'routes', 'settings', 'knownSuppliers'] as const;
export type StoreName = (typeof STORES)[number];

// Collezioni che viaggiano nelle buste. Le impostazioni condivise e il tema sono la collezione `settings`.
export const SYNC_COLLECTIONS = ['expenses', 'photos', 'recipients', 'routes', 'knownSuppliers', 'settings'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];
const RECORD_COLLECTIONS = ['expenses', 'photos', 'recipients', 'routes', 'knownSuppliers'] as const;
type RecordCollection = (typeof RECORD_COLLECTIONS)[number];

let dbPromise: Promise<IDBPDatabase> | null = null;
let onBlocked: (() => void) | undefined;
let onLocalChange: (() => void) | undefined;

// L'interfaccia si registra per sapere se l'apertura dell'archivio è bloccata da un'altra scheda.
export function setBlockedListener(fn: (() => void) | undefined): void {
  onBlocked = fn;
}

// Il motore di sincronizzazione si registra per sapere quando una scrittura ha messo qualcosa in coda.
export function setLocalChangeListener(fn: (() => void) | undefined): void {
  onLocalChange = fn;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// --- tipi interni ---
interface Tombstone {
  updatedAt: number;
  deleted: true;
}
// Impostazioni condivise e tema: l'involucro porta `updatedAt` senza toccare il contenuto.
interface SettingsEntry<T> {
  value?: T;
  updatedAt: number;
  deleted?: true;
}
type SharedSettings = Pick<Settings, 'centsPerKm' | 'headerName'>;
interface LocalSettings {
  appearance: NonNullable<Settings['appearance']>;
  lastBackupAt: string | null;
}

function keyOf(collection: RecordCollection, rec: { id?: string; name?: string }): string {
  return (collection === 'knownSuppliers' ? rec.name : rec.id) as string;
}
function isTomb(x: unknown): x is Tombstone {
  return !!x && (x as Tombstone).deleted === true;
}

async function open(): Promise<IDBPDatabase> {
  const db = await openDB(DB_NAME, DB_VERSION, {
    async upgrade(d, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        for (const name of ['expenses', 'photos', 'recipients', 'routes']) d.createObjectStore(name, { keyPath: 'id' });
        d.createObjectStore('settings'); // voci: «main», «theme», «local», «noSeed»
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
      if (oldVersion < 3) {
        d.createObjectStore('outbox', { keyPath: 'key' }); // coda d'uscita: chiave `collection/id`
        d.createObjectStore('sync'); // stato di sincronizzazione, voce `state`
      }
      if (oldVersion >= 1 && oldVersion < 3) {
        // v2 → v3: `updatedAt` a tutti i record (adesso) e impostazioni divise in parte condivisa e parte locale.
        const now = Date.now();
        for (const name of RECORD_COLLECTIONS) {
          let cursor = await tx.objectStore(name).openCursor();
          while (cursor) {
            await cursor.update({ ...cursor.value, updatedAt: now });
            cursor = await cursor.continue();
          }
        }
        const settings = tx.objectStore('settings');
        const main = (await settings.get(SETTINGS_KEY)) as (Partial<Settings> & { updatedAt?: number; value?: unknown }) | undefined;
        if (main && main.updatedAt === undefined) {
          await settings.put({ appearance: main.appearance ?? 'auto', lastBackupAt: main.lastBackupAt ?? null } satisfies LocalSettings, LOCAL_KEY);
          await settings.put(
            { value: { centsPerKm: main.centsPerKm ?? 50, headerName: main.headerName ?? '' }, updatedAt: now } satisfies SettingsEntry<SharedSettings>,
            SETTINGS_KEY,
          );
        }
        const theme = await settings.get(THEME_KEY);
        if (theme !== undefined) await settings.put({ value: theme, updatedAt: now } satisfies SettingsEntry<unknown>, THEME_KEY);
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
  // Dopo «Cancella tutto» c'è anche il segnale `noSeed`: l'app riparte vuota e resta vuota.
  if ((await db.get('settings', SETTINGS_KEY)) === undefined && (await db.get('settings', NO_SEED_KEY)) === undefined) {
    const tx = db.transaction([...STORES, 'outbox', 'sync'], 'readwrite');
    if ((await tx.objectStore('settings').get(SETTINGS_KEY)) === undefined && (await tx.objectStore('settings').get(NO_SEED_KEY)) === undefined) {
      // updatedAt = 0: i dati di prova non vincono mai su dati veri di un altro dispositivo.
      await writeAll(await makeWriter(tx), tx, buildSeed(), 0);
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

// --- scrittura: unico punto in cui si aggiorna `updatedAt` e si riempie la coda d'uscita ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

interface Writer {
  readonly paired: boolean;
  readonly queued: boolean;
  put(collection: RecordCollection, rec: object, at?: number): Promise<void>;
  remove(collection: RecordCollection, id: string, at?: number): Promise<boolean>;
  putSetting(id: typeof SETTINGS_KEY | typeof THEME_KEY, value: unknown, at?: number): Promise<void>;
  removeSetting(id: typeof THEME_KEY, at?: number): Promise<boolean>;
  queue(collection: SyncCollection, id: string): Promise<void>;
}

// `updatedAt` = adesso, ma mai minore o uguale a quello già presente (orologi sfasati): così una
// modifica locale è sempre più recente della versione che sostituisce.
function stamp(existing: { updatedAt?: number } | undefined, at?: number): number {
  return at ?? Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);
}

async function makeWriter(tx: AnyTx): Promise<Writer> {
  const paired = (await tx.objectStore('sync').get(SYNC_KEY)) !== undefined;
  let queued = false;
  const w: Writer = {
    paired,
    get queued() {
      return queued;
    },
    async queue(collection, id) {
      if (!paired) return; // dispositivo non collegato: niente coda
      const key = `${collection}/${id}`;
      const prev = await tx.objectStore('outbox').get(key);
      await tx.objectStore('outbox').put({ key, collection, id, rev: (prev?.rev ?? 0) + 1 });
      queued = true;
    },
    async put(collection, rec, at) {
      const store = tx.objectStore(collection);
      const key = keyOf(collection, rec);
      const next = { ...rec, updatedAt: stamp(await store.get(key), at) } as Record<string, unknown>;
      delete next.deleted;
      await store.put(next);
      await w.queue(collection, key);
    },
    async remove(collection, id, at) {
      const store = tx.objectStore(collection);
      const existing = await store.get(id);
      if (existing === undefined || isTomb(existing)) return false;
      const field = collection === 'knownSuppliers' ? 'name' : 'id';
      await store.put({ [field]: id, updatedAt: stamp(existing, at), deleted: true });
      await w.queue(collection, id);
      return true;
    },
    async putSetting(id, value, at) {
      const store = tx.objectStore('settings');
      await store.put({ value, updatedAt: stamp(await store.get(id), at) } satisfies SettingsEntry<unknown>, id);
      await w.queue('settings', id);
    },
    async removeSetting(id, at) {
      const store = tx.objectStore('settings');
      const existing = await store.get(id);
      if (existing === undefined || isTomb(existing)) return false;
      await store.put({ updatedAt: stamp(existing, at), deleted: true } satisfies SettingsEntry<unknown>, id);
      await w.queue('settings', id);
      return true;
    },
  };
  return w;
}

function splitSettings(s: Settings): { shared: SharedSettings; local: LocalSettings } {
  return {
    shared: { centsPerKm: s.centsPerKm, headerName: s.headerName },
    local: { appearance: s.appearance ?? 'auto', lastBackupAt: s.lastBackupAt ?? null },
  };
}

async function writeAll(w: Writer, tx: AnyTx, s: SeedData & { theme?: Theme | null }, at?: number): Promise<void> {
  for (const r of s.recipients) await w.put('recipients', r, at);
  for (const r of s.routes) await w.put('routes', r, at);
  for (const e of s.expenses) await w.put('expenses', e, at);
  for (const k of s.knownSuppliers) await w.put('knownSuppliers', k, at);
  const { shared, local } = splitSettings(s.settings);
  await w.putSetting(SETTINGS_KEY, shared, at);
  if (s.theme) await w.putSetting(THEME_KEY, s.theme, at);
  await tx.objectStore('settings').put(local, LOCAL_KEY); // parte locale: mai in coda
}

async function writeTx<T>(stores: readonly string[], fn: (w: Writer, tx: AnyTx) => Promise<T>): Promise<T> {
  const db = await getDb();
  const tx = db.transaction([...new Set([...stores, 'outbox', 'sync'])], 'readwrite');
  try {
    const w = await makeWriter(tx);
    const result = await fn(w, tx);
    await tx.done;
    if (w.queued) onLocalChange?.();
    return result;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      /* già conclusa */
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
}

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = open().then((db) => {
      // Pulizia delle lapidi vecchie, senza far aspettare l'apertura.
      void purgeTombstonesIn(db).catch(() => undefined);
      return db;
    });
  }
  return dbPromise;
}

// Solo per i test: chiude e dimentica la connessione.
export async function closeDb(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
}

async function liveAll<T>(store: RecordCollection): Promise<T[]> {
  const all = (await (await getDb()).getAll(store)) as (T | Tombstone)[];
  return all.filter((x): x is T => !isTomb(x));
}
async function liveGet<T>(store: RecordCollection, key: string): Promise<T | undefined> {
  const x = (await (await getDb()).get(store, key)) as T | Tombstone | undefined;
  return x === undefined || isTomb(x) ? undefined : x;
}

// --- spese ---
export async function listExpenses(): Promise<Expense[]> {
  return liveAll<Expense>('expenses');
}
export async function getExpense(id: string): Promise<Expense | undefined> {
  return liveGet<Expense>('expenses', id);
}
export async function putExpense(e: Expense): Promise<void> {
  await writeTx(['expenses'], (w) => w.put('expenses', e));
}
export async function deleteExpense(id: string): Promise<void> {
  await writeTx(['expenses', 'photos'], async (w, tx) => {
    const e = (await tx.objectStore('expenses').get(id)) as Expense | Tombstone | undefined;
    await w.remove('expenses', id);
    if (e && !isTomb(e) && e.photoId) await w.remove('photos', e.photoId);
  });
}

// --- foto ---
export async function putPhoto(p: Photo): Promise<void> {
  await writeTx(['photos'], (w) => w.put('photos', p));
}
export async function getPhoto(id: string): Promise<Photo | undefined> {
  return liveGet<Photo>('photos', id);
}
export async function deletePhoto(id: string): Promise<void> {
  await writeTx(['photos'], (w) => w.remove('photos', id).then(() => undefined));
}

// --- destinatari, tratte ---
export async function listRecipients(): Promise<Recipient[]> {
  return liveAll<Recipient>('recipients');
}
export async function putRecipient(r: Recipient): Promise<void> {
  await writeTx(['recipients'], (w) => w.put('recipients', r));
}
// Elimina un destinatario insieme alle sue spese e ai loro scontrini. Restituisce quante spese ha tolto.
export async function deleteRecipient(id: string): Promise<number> {
  return writeTx(['recipients', 'expenses', 'photos'], async (w, tx) => {
    const expenses = ((await tx.objectStore('expenses').getAll()) as (Expense | Tombstone)[]).filter((e): e is Expense => !isTomb(e));
    const own = expenses.filter((e) => e.recipientId === id);
    for (const e of own) {
      await w.remove('expenses', e.id);
      if (e.photoId) await w.remove('photos', e.photoId);
    }
    await w.remove('recipients', id);
    return own.length;
  });
}
export async function listRoutes(): Promise<Route[]> {
  return liveAll<Route>('routes');
}
export async function putRoute(r: Route): Promise<void> {
  await writeTx(['routes'], (w) => w.put('routes', r));
}
// Elimina una tratta. Le spese in auto che la usavano restano (km e importo sono già salvati) ma senza tratta collegata.
// Restituisce quante spese ha scollegato.
export async function deleteRoute(id: string): Promise<number> {
  return writeTx(['routes', 'expenses'], async (w, tx) => {
    const expenses = ((await tx.objectStore('expenses').getAll()) as (Expense | Tombstone)[]).filter((e): e is Expense => !isTomb(e));
    const used = expenses.filter((e) => e.routeId === id);
    for (const e of used) await w.put('expenses', { ...e, routeId: null });
    await w.remove('routes', id);
    return used.length;
  });
}

// --- impostazioni ---
// Quelle condivise (`settings/main`: tariffa al km, nome) si sincronizzano; aspetto e data dell'ultimo
// backup restano del dispositivo. Per chi legge, `Settings` è sempre l'unione delle due.
export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const main = (await db.get('settings', SETTINGS_KEY)) as SettingsEntry<SharedSettings> | undefined;
  const local = (await db.get('settings', LOCAL_KEY)) as LocalSettings | undefined;
  const shared = main && !main.deleted && main.value ? main.value : { centsPerKm: EMPTY_SETTINGS.centsPerKm, headerName: '' };
  return { ...shared, lastBackupAt: local?.lastBackupAt ?? null, appearance: local?.appearance ?? 'auto' };
}
export async function putSettings(s: Settings): Promise<void> {
  const { shared, local } = splitSettings(s);
  await writeTx(['settings'], async (w, tx) => {
    const store = tx.objectStore('settings');
    const current = (await store.get(SETTINGS_KEY)) as SettingsEntry<SharedSettings> | undefined;
    const same = current && !current.deleted && current.value && current.value.centsPerKm === shared.centsPerKm && current.value.headerName === shared.headerName;
    if (!same) await w.putSetting(SETTINGS_KEY, shared); // solo se cambia la parte condivisa
    await store.put(local, LOCAL_KEY);
  });
}

// Svuota i dati personali salvati nelle impostazioni (oggi: il nome). Il resto delle impostazioni non cambia.
export async function clearPersonalData(): Promise<void> {
  await putSettings({ ...(await getSettings()), headerName: '' });
}

// --- tema grafico (si sincronizza come record `settings/theme`) ---
export async function getTheme(): Promise<Theme> {
  const entry = (await (await getDb()).get('settings', THEME_KEY)) as SettingsEntry<unknown> | undefined;
  if (entry === undefined || entry.deleted || entry.value === undefined) return DEFAULT_THEME;
  try {
    return validateTheme(entry.value);
  } catch {
    return DEFAULT_THEME;
  }
}
export async function putTheme(t: Theme): Promise<void> {
  await writeTx(['settings'], (w) => w.putSetting(THEME_KEY, t));
}
export async function deleteTheme(): Promise<void> {
  await writeTx(['settings'], (w) => w.removeSetting(THEME_KEY).then(() => undefined));
}

// --- fornitori noti ---
export async function listKnownSuppliers(): Promise<KnownSupplier[]> {
  return liveAll<KnownSupplier>('knownSuppliers');
}
export async function putKnownSupplier(k: KnownSupplier): Promise<void> {
  await writeTx(['knownSuppliers'], (w) => w.put('knownSuppliers', { ...k, name: k.name.trim().toUpperCase() }));
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
  const [expenses, photos, recipients, routes, knownSuppliers, settings, theme] = await Promise.all([
    liveAll<Expense>('expenses'), liveAll<Photo>('photos'), liveAll<Recipient>('recipients'), liveAll<Route>('routes'),
    liveAll<KnownSupplier>('knownSuppliers'), getSettings(),
    (async () => {
      const e = (await (await getDb()).get('settings', THEME_KEY)) as SettingsEntry<Theme> | undefined;
      return e && !e.deleted && e.value ? e.value : null;
    })(),
  ]);
  return { expenses, photos, recipients, routes, settings, knownSuppliers, theme };
}

// Sostituisce tutto l'archivio con i dati dati. Con il dispositivo collegato non si svuotano gli
// store: ciò che il backup non contiene diventa una lapide, e ciò che contiene viene rimesso in coda.
export async function replaceEverything(d: DumpData): Promise<void> {
  await writeTx(STORES, async (w, tx) => {
    if (!w.paired) {
      for (const name of STORES) await tx.objectStore(name).clear();
    } else {
      const keep: Record<RecordCollection, Set<string>> = {
        expenses: new Set(d.expenses.map((x) => x.id)),
        photos: new Set(d.photos.map((x) => x.id)),
        recipients: new Set(d.recipients.map((x) => x.id)),
        routes: new Set(d.routes.map((x) => x.id)),
        knownSuppliers: new Set(d.knownSuppliers.map((x) => x.name)),
      };
      for (const name of RECORD_COLLECTIONS) {
        const field = name === 'knownSuppliers' ? 'name' : 'id';
        for (const rec of (await tx.objectStore(name).getAll()) as Record<string, string>[]) {
          if (!isTomb(rec) && !keep[name].has(rec[field])) await w.remove(name, rec[field]);
        }
      }
      if (!d.theme) await w.removeSetting(THEME_KEY);
    }
    await writeAll(w, tx, { ...d, settings: d.settings });
    for (const p of d.photos) await w.put('photos', p);
  });
}

// Impostazioni di un'app vuota: nessun dato personale, rimborso al valore di partenza.
export const EMPTY_SETTINGS: Settings = { centsPerKm: 50, headerName: '', lastBackupAt: null, appearance: 'auto' };

// «Cancella tutto»: spese, foto, destinatari, tratte, fornitori noti, impostazioni e tema. L'app riparte vuota,
// senza dati finti: il segnale `noSeed` impedisce di ricaricarli alla prossima apertura.
// Con il dispositivo collegato la cancellazione è una modifica come le altre: ogni record diventa una lapide
// in coda, e la cancellazione arriva anche agli altri dispositivi (il collegamento resta).
export async function wipeEverything(): Promise<void> {
  await writeTx(STORES, async (w, tx) => {
    if (!w.paired) {
      for (const name of STORES) await tx.objectStore(name).clear();
    } else {
      for (const name of RECORD_COLLECTIONS) {
        const field = name === 'knownSuppliers' ? 'name' : 'id';
        for (const rec of (await tx.objectStore(name).getAll()) as Record<string, string>[]) {
          if (!isTomb(rec)) await w.remove(name, rec[field]);
        }
      }
      await w.removeSetting(THEME_KEY);
    }
    const { shared, local } = splitSettings(EMPTY_SETTINGS);
    await w.putSetting(SETTINGS_KEY, shared);
    await tx.objectStore('settings').put(local, LOCAL_KEY);
    await tx.objectStore('settings').put(true, NO_SEED_KEY);
  });
}

// «Cancella i dati di prova»: toglie solo spese, destinatari e tratte del seed (riconoscibili dagli id), tenendo
// tema e impostazioni. Un destinatario o una tratta del seed ancora usati da spese tue restano.
export async function deleteSampleData(): Promise<{ expenses: number; recipients: number; routes: number }> {
  const ids = seedIds();
  return writeTx(['expenses', 'photos', 'recipients', 'routes'], async (w, tx) => {
    const all = ((await tx.objectStore('expenses').getAll()) as (Expense | Tombstone)[]).filter((e): e is Expense => !isTomb(e));
    let expenses = 0;
    for (const e of all.filter((x) => ids.expenses.has(x.id))) {
      await w.remove('expenses', e.id);
      if (e.photoId) await w.remove('photos', e.photoId);
      expenses++;
    }
    const rest = all.filter((x) => !ids.expenses.has(x.id));
    let recipients = 0;
    for (const id of ids.recipients) {
      if (rest.some((e) => e.recipientId === id)) continue;
      if (await w.remove('recipients', id)) recipients++;
    }
    let routes = 0;
    for (const id of ids.routes) {
      if (rest.some((e) => e.routeId === id)) continue;
      if (await w.remove('routes', id)) routes++;
    }
    return { expenses, recipients, routes };
  });
}

// ---------------------------------------------------------------------------------------------
// Interfaccia per il motore di sincronizzazione (src/sync/engine.ts)
// ---------------------------------------------------------------------------------------------

export interface SyncState {
  vaultId: Uint8Array;
  secret: Uint8Array;
  lastSeq: number;
  lastSyncAt: number | null;
  deviceName: string;
}
export interface OutboxEntry {
  key: string; // `collection/id`
  collection: SyncCollection;
  id: string;
  rev: number; // cresce a ogni nuova modifica: serve a non perdere modifiche arrivate durante l'invio
}
// Un record come viaggia nella busta (la foto qui ha ancora il suo Blob: la converte il motore).
export interface SyncRecord {
  collection: SyncCollection;
  id: string;
  updatedAt: number;
  deleted: boolean;
  value?: unknown;
}

export async function getSyncState(): Promise<SyncState | undefined> {
  return (await (await getDb()).get('sync', SYNC_KEY)) as SyncState | undefined;
}
export async function putSyncState(s: SyncState): Promise<void> {
  await (await getDb()).put('sync', s, SYNC_KEY);
}
// «Scollega»: dimentica chiavi e coda. I dati restano dove sono.
export async function clearSyncState(): Promise<void> {
  const tx = (await getDb()).transaction(['sync', 'outbox'], 'readwrite');
  await tx.objectStore('sync').clear();
  await tx.objectStore('outbox').clear();
  await tx.done;
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  return (await (await getDb()).getAll('outbox')) as OutboxEntry[];
}
export async function countOutbox(): Promise<number> {
  return (await getDb()).count('outbox');
}
// Toglie dalla coda le voci confermate dal server, ma solo se nel frattempo non sono state modificate.
export async function ackOutbox(sent: { key: string; rev: number }[]): Promise<void> {
  const tx = (await getDb()).transaction('outbox', 'readwrite');
  for (const s of sent) {
    const cur = (await tx.store.get(s.key)) as OutboxEntry | undefined;
    if (cur && cur.rev === s.rev) await tx.store.delete(s.key);
  }
  await tx.done;
}

export async function exportRecord(collection: SyncCollection, id: string): Promise<SyncRecord | undefined> {
  const db = await getDb();
  const raw = (await db.get(collection, id)) as
    | (Record<string, unknown> & { updatedAt?: number; deleted?: boolean })
    | undefined;
  if (raw === undefined) return undefined;
  const updatedAt = raw.updatedAt ?? 0;
  if (raw.deleted) return { collection, id, updatedAt, deleted: true };
  if (collection === 'settings') return { collection, id, updatedAt, deleted: false, value: raw.value };
  const { updatedAt: _u, ...value } = raw;
  return { collection, id, updatedAt, deleted: false, value };
}

// Mette in coda tutti i record (lapidi comprese): primo collegamento.
export async function queueEverything(): Promise<number> {
  return writeTx(STORES, async (w, tx) => {
    let n = 0;
    for (const name of RECORD_COLLECTIONS) {
      for (const key of (await tx.objectStore(name).getAllKeys()) as string[]) {
        await w.queue(name, key);
        n++;
      }
    }
    for (const id of [SETTINGS_KEY, THEME_KEY]) {
      if ((await tx.objectStore('settings').get(id)) !== undefined) {
        await w.queue('settings', id);
        n++;
      }
    }
    return n;
  });
}

// Applica un record arrivato dal server (senza cambiarne `updatedAt` e senza metterlo in coda).
// - locale assente o più vecchio: si applica (le lapidi eliminano anche la foto della spesa);
// - locale più recente: resta e torna in coda d'uscita;
// - pari: non si fa niente.
export async function applyRemoteRecord(rec: SyncRecord): Promise<'applied' | 'requeued' | 'kept'> {
  const { collection, id } = rec;
  return writeTx([collection === 'settings' ? 'settings' : collection, 'photos'], async (w, tx) => {
    const store = tx.objectStore(collection);
    const local = (await store.get(id)) as { updatedAt?: number; value?: unknown; photoId?: string | null; deleted?: boolean } | undefined;
    const localAt = local ? (local.updatedAt ?? 0) : -1;
    if (localAt > rec.updatedAt) {
      await w.queue(collection, id);
      return 'requeued';
    }
    if (localAt === rec.updatedAt) return 'kept';
    const field = collection === 'knownSuppliers' ? 'name' : 'id';
    if (collection === 'settings') {
      await store.put(rec.deleted ? { updatedAt: rec.updatedAt, deleted: true } : { value: rec.value, updatedAt: rec.updatedAt }, id);
    } else if (rec.deleted) {
      await store.put({ [field]: id, updatedAt: rec.updatedAt, deleted: true });
      if (collection === 'expenses' && local && !local.deleted && local.photoId) {
        const photos = tx.objectStore('photos');
        const photo = (await photos.get(local.photoId)) as { updatedAt?: number; deleted?: boolean } | undefined;
        if (photo && !photo.deleted) await photos.put({ id: local.photoId, updatedAt: Math.max(rec.updatedAt, (photo.updatedAt ?? 0) + 1), deleted: true });
      }
    } else {
      const { updatedAt: _u, deleted: _d, ...value } = (rec.value ?? {}) as Record<string, unknown>;
      await store.put({ ...value, [field]: id, updatedAt: rec.updatedAt });
    }
    return 'applied';
  });
}

// Ci sono ancora i dati di prova (spese, destinatari o tratte con gli id del seed)?
export async function hasSampleData(): Promise<boolean> {
  const ids = seedIds();
  const [e, r, t] = await Promise.all([listExpenses(), listRecipients(), listRoutes()]);
  return e.some((x) => ids.expenses.has(x.id)) || r.some((x) => ids.recipients.has(x.id)) || t.some((x) => ids.routes.has(x.id));
}

// Elimina le lapidi più vecchie di 90 giorni (tranne quelle ancora in coda d'uscita). Restituisce quante.
export async function purgeTombstones(now: number = Date.now()): Promise<number> {
  return purgeTombstonesIn(await getDb(), now);
}
async function purgeTombstonesIn(db: IDBPDatabase, now: number = Date.now()): Promise<number> {
  const limit = now - TOMBSTONE_MAX_AGE_MS;
  const tx = db.transaction([...RECORD_COLLECTIONS, 'settings', 'outbox'], 'readwrite');
  let n = 0;
  const pending = new Set(((await tx.objectStore('outbox').getAllKeys()) as string[]));
  for (const name of [...RECORD_COLLECTIONS, 'settings'] as const) {
    let cursor = await tx.objectStore(name).openCursor();
    while (cursor) {
      const v = cursor.value as { deleted?: boolean; updatedAt?: number } | unknown;
      if (v && typeof v === 'object' && (v as { deleted?: boolean }).deleted === true && ((v as { updatedAt?: number }).updatedAt ?? 0) < limit) {
        if (!pending.has(`${name}/${String(cursor.key)}`)) {
          await cursor.delete();
          n++;
        }
      }
      cursor = await cursor.continue();
    }
  }
  await tx.done;
  return n;
}
