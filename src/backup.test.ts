// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBackup, importBackup, parseBackup } from './backup';
import { closeDb, DB_NAME, getTheme, listExpenses, putTheme, readEverything } from './db';
import { DEFAULT_THEME } from './theme';

afterEach(async () => {
  await closeDb();
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
});

const v1 = {
  format: 'note-spese-backup',
  version: 1,
  exportedAt: '2026-10-01T10:00:00.000Z',
  expenses: [
    {
      id: 'b1', date: '2026-10-02', recipientId: 'r1', place: 'Milano', supplier: 'Prova', category: 'pasto', amountCents: 1200,
      invoice: false, payer: 'personale', cardId: 'c-vecchia', routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale',
    },
  ],
  photos: [],
  recipients: [{ id: 'r1', name: 'Cliente di prova', kind: 'cliente', defaultPlace: 'Milano', active: true }],
  cards: [{ id: 'c-vecchia', name: 'Carta', owner: 'personale', last4: '0000' }],
  routes: [],
  settings: { centsPerKm: 50, headerName: 'Prova', lastBackupAt: null },
  knownSuppliers: [],
};

describe('backup', () => {
  it('importa un backup di versione 1 scartando carte e cardId', async () => {
    const d = parseBackup(JSON.stringify(v1));
    expect(d).not.toHaveProperty('cards');
    expect(d.expenses[0]).not.toHaveProperty('cardId');
    expect(d.expenses[0]).toMatchObject({ id: 'b1', payer: 'personale', amountCents: 1200 });
    expect(d.theme).toBeNull();

    await importBackup(new Blob([JSON.stringify(v1)]), () => true);
    const stored = await listExpenses();
    expect(stored.map((e) => e.id)).toEqual(['b1']);
    expect(stored[0]).not.toHaveProperty('cardId');
    expect(await getTheme()).toEqual(DEFAULT_THEME);
  });

  it('esporta in versione 2 senza carte e con il tema; il ripristino lo rimette', async () => {
    await listExpenses(); // apre l'archivio con i dati finti
    const theme = { ...DEFAULT_THEME, companyName: 'Studio Aurora S.r.l.' };
    await putTheme(theme);
    const text = await (await buildBackup()).text();
    const f = JSON.parse(text);
    expect(f.version).toBe(2);
    expect(f).not.toHaveProperty('cards');
    expect(f.theme.companyName).toBe('Studio Aurora S.r.l.');
    expect(f.expenses.every((e: object) => !('cardId' in e))).toBe(true);

    // ripristino su un archivio dove il tema è stato tolto
    const before = (await readEverything()).expenses.length;
    await importBackup(new Blob([text]), () => true);
    expect((await listExpenses()).length).toBe(before);
    expect((await getTheme()).companyName).toBe('Studio Aurora S.r.l.');
  });

  it('rifiuta versioni sconosciute e temi non validi', () => {
    expect(() => parseBackup(JSON.stringify({ ...v1, version: 3 }))).toThrow('non è un backup');
    expect(() => parseBackup(JSON.stringify({ ...v1, version: 2, theme: { format: 'altro' } }))).toThrow('tema non valido');
  });
});
