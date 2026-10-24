import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPersonalData, closeDb, DB_NAME, deleteRecipient, deleteRoute, deleteSampleData, getPhoto, getSettings, getTheme, getExpense,
  listExpenses, listKnownSuppliers, listRecipients, listRoutes, putExpense, putPhoto, putRecipient, putRoute, putTheme, wipeEverything,
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

const base = () => buildSeed().expenses[0];

describe('eliminare un destinatario', () => {
  it('toglie anche le sue spese e le loro foto, e lascia le altre', async () => {
    await putPhoto({ id: 'ph-1', blob: new Blob(['x'], { type: 'image/jpeg' }) });
    await putExpense({ ...base(), id: 'mia', photoId: 'ph-1', recipientId: 'r-lunari' });
    const before = await listExpenses();
    const own = before.filter((e) => e.recipientId === 'r-lunari').length;
    expect(own).toBeGreaterThan(1);
    expect(await deleteRecipient('r-lunari')).toBe(own);
    const after = await listExpenses();
    expect(after).toHaveLength(before.length - own);
    expect(after.some((e) => e.recipientId === 'r-lunari')).toBe(false);
    expect(await getPhoto('ph-1')).toBeUndefined();
    expect((await listRecipients()).map((r) => r.id)).not.toContain('r-lunari');
    expect((await listRecipients()).map((r) => r.id)).toContain('r-ardesia');
  });

  it('senza spese elimina solo il destinatario', async () => {
    await putRecipient({ id: 'r-nuovo', name: 'Nuovo', kind: 'cliente', defaultPlace: '', active: true });
    const n = (await listExpenses()).length;
    expect(await deleteRecipient('r-nuovo')).toBe(0);
    expect(await listExpenses()).toHaveLength(n);
  });
});

describe('eliminare una tratta', () => {
  it('le spese in auto restano, con km e importo, ma senza tratta', async () => {
    const used = (await listExpenses()).filter((e) => e.routeId === 'rt-mi');
    expect(used.length).toBeGreaterThan(0);
    const n = (await listExpenses()).length;
    expect(await deleteRoute('rt-mi')).toBe(used.length);
    expect(await listExpenses()).toHaveLength(n);
    for (const u of used) {
      const e = await getExpense(u.id);
      expect(e?.routeId).toBeNull();
      expect(e?.km).toBe(u.km);
      expect(e?.amountCents).toBe(u.amountCents);
    }
    expect((await listRoutes()).map((r) => r.id)).toEqual(['rt-vr']);
  });
});

describe('i dati personali', () => {
  it('si svuota il nome e il resto delle impostazioni resta', async () => {
    const before = await getSettings();
    await clearPersonalData();
    const after = await getSettings();
    expect(after.headerName).toBe('');
    expect(after.centsPerKm).toBe(before.centsPerKm);
  });
});

describe('Cancella tutto', () => {
  it('svuota ogni cosa, tema compreso, e dopo la riapertura non ricarica i dati finti', async () => {
    await putTheme({ ...DEFAULT_THEME, companyName: 'Studio Aurora S.r.l.' });
    await putPhoto({ id: 'ph-1', blob: new Blob(['x']) });
    await wipeEverything();
    const check = async () => {
      expect(await listExpenses()).toEqual([]);
      expect(await listRecipients()).toEqual([]);
      expect(await listRoutes()).toEqual([]);
      expect(await listKnownSuppliers()).toEqual([]);
      expect(await getPhoto('ph-1')).toBeUndefined();
      expect((await getSettings()).headerName).toBe('');
      expect(await getTheme()).toEqual(DEFAULT_THEME);
    };
    await check();
    await closeDb(); // riapertura: nessun seed
    await check();
  });

  it('il segnale impedisce il seed anche se le impostazioni mancano', async () => {
    await wipeEverything();
    await closeDb();
    await new Promise<void>((res) => {
      const r = indexedDB.open(DB_NAME);
      r.onsuccess = () => {
        const tx = r.result.transaction('settings', 'readwrite');
        tx.objectStore('settings').delete('main');
        tx.oncomplete = () => { r.result.close(); res(); };
      };
    });
    expect(await listExpenses()).toEqual([]);
  });
});

describe('Cancella i dati di prova', () => {
  it('toglie solo spese, destinatari e tratte del seed e tiene tema e impostazioni', async () => {
    await putTheme({ ...DEFAULT_THEME, companyName: 'Studio Aurora S.r.l.' });
    await putRecipient({ id: 'r-mio', name: 'Mio cliente', kind: 'cliente', defaultPlace: '', active: true });
    await putRoute({ id: 'rt-mia', from: 'A', to: 'B', km: 10 });
    await putExpense({ ...base(), id: 'mia-1', recipientId: 'r-mio', routeId: 'rt-mia' });
    const r = await deleteSampleData();
    expect(r.expenses).toBe(buildSeed().expenses.length);
    expect(r.recipients).toBe(3);
    expect(r.routes).toBe(2);
    expect((await listExpenses()).map((e) => e.id)).toEqual(['mia-1']);
    expect((await listRecipients()).map((x) => x.id)).toEqual(['r-mio']);
    expect((await listRoutes()).map((x) => x.id)).toEqual(['rt-mia']);
    expect((await getTheme()).companyName).toBe('Studio Aurora S.r.l.');
    expect((await getSettings()).headerName).toBe('Mario Rossi');
  });

  it('un destinatario del seed ancora usato da una spesa tua resta', async () => {
    await putExpense({ ...base(), id: 'mia-2', recipientId: 'r-lunari', routeId: 'rt-mi' });
    await deleteSampleData();
    expect((await listRecipients()).map((x) => x.id)).toEqual(['r-lunari']);
    expect((await listRoutes()).map((x) => x.id)).toEqual(['rt-mi']);
  });
});
