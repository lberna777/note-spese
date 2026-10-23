import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, deleteExpense, DB_NAME, getExpense, getSettings, listCards, listExpenses, listRecipients, putExpense } from './db';
import { buildSeed } from './seed';

afterEach(async () => {
  await closeDb();
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
});

describe('archivio', () => {
  it('carica i dati finti una sola volta', async () => {
    const n = buildSeed().expenses.length;
    expect((await listExpenses()).length).toBe(n);
    expect(await listRecipients()).toHaveLength(3);
    expect(await listCards()).toHaveLength(2);
    expect((await getSettings()).headerName).toBe('Mario Rossi');
    // seconda apertura (stessa base dati): niente doppioni, né dopo aver eliminato una spesa
    await deleteExpense('seed-01');
    await closeDb();
    expect((await listExpenses()).length).toBe(n - 1);
  });

  it('crea, legge, modifica ed elimina una spesa', async () => {
    const base = (await listExpenses())[0];
    const e = { ...base, id: 'nuova', supplier: 'Prova', amountCents: 999 };
    await putExpense(e);
    expect((await getExpense('nuova'))?.amountCents).toBe(999);
    await putExpense({ ...e, amountCents: 1500 });
    expect((await getExpense('nuova'))?.amountCents).toBe(1500);
    await deleteExpense('nuova');
    expect(await getExpense('nuova')).toBeUndefined();
  });

  it('i dati finti stanno nel mese corrente', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const local = buildSeed().expenses.every((e) => e.date.startsWith(`${new Date().getFullYear()}-`));
    expect(local).toBe(true);
    expect(month.length).toBe(7);
  });
});
