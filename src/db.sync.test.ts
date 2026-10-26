import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSyncState, closeDb, DB_NAME, deleteExpense, deletePhoto, deleteRecipient, deleteTheme, getDb, getExpense, getSettings, getTheme,
  hasSampleData, listExpenses, listOutbox, listRecipients, purgeTombstones, putExpense, putPhoto, putRecipient, putSettings, putSyncState,
  putTheme, readEverything, replaceEverything, wipeEverything, deleteSampleData, TOMBSTONE_MAX_AGE_MS,
} from './db';
import { buildSeed } from './seed';
import { DEFAULT_THEME } from './theme';

afterEach(async () => {
  await closeDb();
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
});

const pairNow = () => putSyncState({ vaultId: new Uint8Array(16), secret: new Uint8Array(32), lastSeq: 0, lastSyncAt: null, deviceName: 'prova' });
const base = () => buildSeed().expenses[0];
const keys = async () => (await listOutbox()).map((o) => o.key).sort();

describe('migrazione dell’archivio dalla versione 2 alla 3', () => {
  it('dà updatedAt ai record, divide le impostazioni e avvolge il tema', async () => {
    const before = Date.now();
    const raw = await openDB(DB_NAME, 2, {
      upgrade(d) {
        for (const name of ['expenses', 'photos', 'recipients', 'routes']) d.createObjectStore(name, { keyPath: 'id' });
        d.createObjectStore('settings');
        d.createObjectStore('knownSuppliers', { keyPath: 'name' });
      },
    });
    await raw.put('expenses', { ...base(), id: 'm-1' });
    await raw.put('recipients', { id: 'r-m', name: 'Cliente', kind: 'cliente', defaultPlace: '', active: true });
    await raw.put('knownSuppliers', { name: 'BAR', category: 'pasto', place: '' });
    await raw.put('photos', { id: 'p-m', blob: new Blob(['x']) });
    await raw.put('settings', { centsPerKm: 61, headerName: 'Prova', lastBackupAt: '2026-10-01T00:00:00.000Z', appearance: 'dark' }, 'main');
    await raw.put('settings', { ...DEFAULT_THEME, companyName: 'Studio Aurora S.r.l.' }, 'theme');
    raw.close();

    const db = await getDb();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining(['outbox', 'sync']));
    const e = await getExpense('m-1');
    expect(e?.updatedAt).toBeGreaterThanOrEqual(before);
    for (const store of ['recipients', 'knownSuppliers', 'photos'] as const) {
      for (const r of await db.getAll(store)) expect(r.updatedAt).toBeGreaterThanOrEqual(before);
    }
    // aspetto e promemoria di backup restano locali; il resto è nel record condiviso
    expect(await getSettings()).toEqual({ centsPerKm: 61, headerName: 'Prova', lastBackupAt: '2026-10-01T00:00:00.000Z', appearance: 'dark' });
    const main = await db.get('settings', 'main');
    expect(main.value).toEqual({ centsPerKm: 61, headerName: 'Prova' });
    expect(main.updatedAt).toBeGreaterThanOrEqual(before);
    expect((await getTheme()).companyName).toBe('Studio Aurora S.r.l.');
    expect(await listOutbox()).toEqual([]);
  });
});

describe('lapidi', () => {
  it('cancellare lascia una lapide senza contenuto, e le letture non la vedono', async () => {
    await putExpense({ ...base(), id: 'x1', supplier: 'Segreto' });
    await deleteExpense('x1');
    expect(await getExpense('x1')).toBeUndefined();
    expect((await listExpenses()).some((e) => e.id === 'x1')).toBe(false);
    const raw = await (await getDb()).get('expenses', 'x1');
    expect(raw).toMatchObject({ id: 'x1', deleted: true });
    expect(raw.updatedAt).toBeGreaterThan(0);
    expect(raw).not.toHaveProperty('supplier');
    expect((await readEverything()).expenses.some((e) => e.id === 'x1')).toBe(false);
  });

  it('eliminare la spesa mette la lapide anche alla foto; il destinatario a spese e foto', async () => {
    await putPhoto({ id: 'ph', blob: new Blob(['x']) });
    await putExpense({ ...base(), id: 'x2', photoId: 'ph', recipientId: 'r-lunari' });
    await deleteRecipient('r-lunari');
    expect((await (await getDb()).get('photos', 'ph')).deleted).toBe(true);
    expect((await (await getDb()).get('expenses', 'x2')).deleted).toBe(true);
    expect((await listRecipients()).some((r) => r.id === 'r-lunari')).toBe(false);
    await putRecipient({ id: 'r-lunari', name: 'Di nuovo', kind: 'cliente', defaultPlace: '', active: true });
    expect((await listRecipients()).some((r) => r.id === 'r-lunari')).toBe(true); // la lapide si sostituisce
  });

  it('una modifica è sempre più recente di ciò che sostituisce, anche con l’orologio indietro', async () => {
    await putExpense({ ...base(), id: 'x3' });
    const first = (await getExpense('x3'))!.updatedAt!;
    await (await getDb()).put('expenses', { ...(await getExpense('x3')), updatedAt: first + 10_000_000 });
    await putExpense({ ...(await getExpense('x3'))!, notes: 'nuova' });
    expect((await getExpense('x3'))!.updatedAt).toBeGreaterThan(first + 10_000_000);
  });

  it('le lapidi vecchie di oltre 90 giorni si eliminano, salvo quelle ancora in coda', async () => {
    await pairNow();
    await putExpense({ ...base(), id: 'old-1' });
    await putExpense({ ...base(), id: 'old-2' });
    await deleteExpense('old-1');
    await deleteExpense('old-2');
    const db = await getDb();
    await db.delete('outbox', 'expenses/old-1'); // già spedita
    expect(await purgeTombstones(Date.now())).toBe(0); // troppo recenti
    expect(await purgeTombstones(Date.now() + TOMBSTONE_MAX_AGE_MS + 60_000)).toBe(1);
    expect(await db.get('expenses', 'old-1')).toBeUndefined();
    expect(await db.get('expenses', 'old-2')).toBeDefined(); // ancora in coda
  });
});

describe('coda d’uscita', () => {
  it('dispositivo non collegato: nessuna coda', async () => {
    await putExpense({ ...base(), id: 'q1' });
    await deleteExpense('q1');
    await putTheme({ ...DEFAULT_THEME, companyName: 'X' });
    await putSettings({ ...(await getSettings()), headerName: 'Cambiato' });
    expect(await listOutbox()).toEqual([]);
  });

  it('dispositivo collegato: ogni scrittura e cancellazione entra in coda, una voce per record', async () => {
    await pairNow();
    await putExpense({ ...base(), id: 'q1', photoId: 'ph' });
    await putPhoto({ id: 'ph', blob: new Blob(['x']) });
    await putRecipient({ id: 'r-q', name: 'Q', kind: 'cliente', defaultPlace: '', active: true });
    await putExpense({ ...(await getExpense('q1'))!, notes: 'bis' });
    expect(await keys()).toEqual(['expenses/q1', 'photos/ph', 'recipients/r-q']);
    expect((await listOutbox()).find((o) => o.key === 'expenses/q1')!.rev).toBe(2);
    await deleteExpense('q1');
    expect((await listOutbox()).find((o) => o.key === 'expenses/q1')!.rev).toBe(3);
    await putTheme({ ...DEFAULT_THEME, companyName: 'X' });
    await deleteTheme();
    expect(await keys()).toContain('settings/theme');
    expect((await getTheme())).toEqual(DEFAULT_THEME);
  });

  it('le impostazioni: solo la parte condivisa va in coda, aspetto e backup restano locali', async () => {
    await pairNow();
    await putSettings({ ...(await getSettings()), appearance: 'dark', lastBackupAt: '2026-10-02T00:00:00.000Z' });
    expect(await listOutbox()).toEqual([]);
    expect(await getSettings()).toMatchObject({ appearance: 'dark', lastBackupAt: '2026-10-02T00:00:00.000Z' });
    await putSettings({ ...(await getSettings()), centsPerKm: 70 });
    expect(await keys()).toEqual(['settings/main']);
  });

  it('scollegare svuota la coda', async () => {
    await pairNow();
    await putExpense({ ...base(), id: 'q9' });
    await clearSyncState();
    expect(await listOutbox()).toEqual([]);
    await putExpense({ ...base(), id: 'q10' });
    expect(await listOutbox()).toEqual([]);
  });
});

describe('cancellazioni totali con il dispositivo collegato', () => {
  it('«Cancella tutto» produce lapidi in coda e il segnale per non ricaricare i dati finti', async () => {
    await pairNow();
    await putPhoto({ id: 'ph', blob: new Blob(['x']) });
    const n = buildSeed().expenses.length;
    await wipeEverything();
    expect(await listExpenses()).toEqual([]);
    expect(await listRecipients()).toEqual([]);
    const k = await keys();
    expect(k.filter((x) => x.startsWith('expenses/'))).toHaveLength(n);
    expect(k).toEqual(expect.arrayContaining(['photos/ph', 'settings/main', 'recipients/r-lunari', 'knownSuppliers/TRENITALIA']));
    expect((await getSettings()).headerName).toBe('');
    await closeDb();
    expect(await listExpenses()).toEqual([]); // niente seed alla riapertura
    expect(await (await getDb()).get('sync', 'state')).toBeDefined(); // il collegamento resta
  });

  it('«Cancella i dati di prova» produce lapidi in coda', async () => {
    await pairNow();
    expect(await hasSampleData()).toBe(true);
    await deleteSampleData();
    expect(await hasSampleData()).toBe(false);
    expect((await keys()).filter((x) => x.startsWith('expenses/seed-'))).toHaveLength(buildSeed().expenses.length);
  });

  it('il ripristino di un backup mette lapidi a ciò che manca e in coda ciò che c’è', async () => {
    await pairNow();
    const dump = await readEverything();
    await replaceEverything({ ...dump, expenses: dump.expenses.slice(0, 2), recipients: [], theme: null });
    expect(await listExpenses()).toHaveLength(2);
    expect(await listRecipients()).toEqual([]);
    expect((await keys()).filter((x) => x.startsWith('expenses/'))).toHaveLength(dump.expenses.length);
    expect(await (await getDb()).get('recipients', 'r-lunari')).toMatchObject({ deleted: true });
  });

  it('senza collegamento il ripristino sostituisce tutto, senza lapidi', async () => {
    const dump = await readEverything();
    await replaceEverything({ ...dump, expenses: dump.expenses.slice(0, 2) });
    expect(await (await getDb()).count('expenses')).toBe(2);
    await deletePhoto('niente');
    expect(await listOutbox()).toEqual([]);
  });
});
