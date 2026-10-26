import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, DB_NAME, getDb, getSettings, listExpenses } from './db';

afterEach(async () => {
  await closeDb();
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
});

// Crea una base dati come la scriveva la versione 1: con lo store delle carte e `cardId` nelle spese.
async function createV1() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(d) {
      for (const name of ['expenses', 'photos', 'recipients', 'cards', 'routes']) d.createObjectStore(name, { keyPath: 'id' });
      d.createObjectStore('settings');
      d.createObjectStore('knownSuppliers', { keyPath: 'name' });
    },
  });
  await db.put('cards', { id: 'c1', name: 'Carta di prova', owner: 'azienda', last4: '0000' });
  await db.put('expenses', {
    id: 'v1-a', date: '2026-10-05', recipientId: 'r', place: 'X', supplier: 'Y', category: 'altro', amountCents: 500,
    invoice: false, payer: 'azienda', cardId: 'c1', routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale',
  });
  await db.put('expenses', {
    id: 'v1-b', date: '2026-10-06', recipientId: 'r', place: 'X', supplier: 'Z', category: 'altro', amountCents: 700,
    invoice: false, payer: 'personale', cardId: null, routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale',
  });
  await db.put('settings', { centsPerKm: 50, headerName: 'Prova', lastBackupAt: null }, 'main');
  db.close();
}

describe('migrazione dell’archivio dalla versione 1 alla 2', () => {
  it('elimina lo store delle carte e il cardId, tenendo tutto il resto', async () => {
    await createV1();
    const expenses = await listExpenses();
    expect(expenses.map((e) => e.id).sort()).toEqual(['v1-a', 'v1-b']);
    for (const e of expenses) expect(e).not.toHaveProperty('cardId');
    expect(expenses.find((e) => e.id === 'v1-a')).toMatchObject({ amountCents: 500, payer: 'azienda' });
    expect(expenses.find((e) => e.id === 'v1-b')).toMatchObject({ amountCents: 700, payer: 'personale' });
    const db = await getDb();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).not.toContain('cards');
    // i dati esistenti non vengono rimpiazzati dai dati finti
    expect((await getSettings()).headerName).toBe('Prova');
  });

  it('una nuova installazione nasce già in versione 3, senza carte', async () => {
    const db = await getDb();
    expect(db.version).toBe(3);
    expect(Array.from(db.objectStoreNames)).not.toContain('cards');
  });
});
