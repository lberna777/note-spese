// @vitest-environment node
// Due dispositivi simulati (due archivi fake-indexeddb separati, due istanze dei moduli) e un server finto in memoria
// che si comporta come docs/sync.md: autenticazione con hash del token, seq crescente, paginazione, cancellazione.
import 'fake-indexeddb/auto'; // definisce le classi globali (IDBRequest, …)
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncHttpError, SyncNetworkError, type PullResult, type SyncClient, type WireEnvelope } from './client';
import { fromBase64Url } from './crypto';

class FakeServer implements SyncClient {
  vaults = new Map<string, { hash: string; seq: number; env: Map<string, { seq: number; body: string }> }>();
  online = true;
  pullCalls = 0;
  pushCalls = 0;
  pageLimit = 100;

  private async hash(token: string): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Buffer.from(d).toString('hex');
  }
  private check() {
    if (!this.online) throw new SyncNetworkError();
  }
  private async auth(vault: string, token: string, create: boolean) {
    let v = this.vaults.get(vault);
    if (!v) {
      if (!create) throw new SyncHttpError(404);
      v = { hash: await this.hash(token), seq: 0, env: new Map() };
      this.vaults.set(vault, v);
    }
    if (v.hash !== (await this.hash(token))) throw new SyncHttpError(401);
    return v;
  }
  async push(vault: string, token: string, items: WireEnvelope[]) {
    this.check();
    this.pushCalls++;
    if (items.length > 50) throw new SyncHttpError(413);
    const v = await this.auth(vault, token, true);
    for (const it of items) v.env.set(it.oid, { seq: ++v.seq, body: it.body });
    return { seq: v.seq };
  }
  async pull(vault: string, token: string, since: number, limit = 100): Promise<PullResult> {
    this.check();
    this.pullCalls++;
    const v = await this.auth(vault, token, false);
    const all = [...v.env.entries()].map(([oid, e]) => ({ oid, ...e })).filter((e) => e.seq > since).sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, Math.min(limit, this.pageLimit));
    return { items: page, next: all.length > page.length ? page[page.length - 1].seq : null };
  }
  async delete(vault: string, token: string) {
    this.check();
    await this.auth(vault, token, false);
    this.vaults.delete(vault);
  }
}

type Db = typeof import('../db');
type Eng = typeof import('./engine');
interface Device {
  db: Db;
  engine: ReturnType<Eng['createSyncEngine']>;
  remoteChanges: number;
}

// Ogni dispositivo ha la sua fabbrica IndexedDB e la sua copia dei moduli (stato interno separato).
async function makeDevice(server: SyncClient, extra: Partial<Parameters<Eng['createSyncEngine']>[0]> = {}, cleanSamples = true): Promise<Device> {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  vi.resetModules();
  const db = await import('../db');
  const eng = await import('./engine');
  await db.getDb(); // apre (e semina) mentre la fabbrica di questo dispositivo è quella globale
  if (cleanSamples) await db.deleteSampleData();
  const engine = eng.createSyncEngine({ client: server, ...extra });
  const device: Device = { db, engine, remoteChanges: 0 };
  engine.onRemoteChange(() => device.remoteChanges++);
  return device;
}

const baseExpense = (id: string, over: Record<string, unknown> = {}) => ({
  id, date: '2026-10-05', recipientId: 'r1', place: 'Milano', supplier: 'Prova', category: 'altro' as const, amountCents: 1000,
  invoice: false, payer: 'azienda' as const, routeId: null, roundTrip: false, km: null, photoId: null, notes: '', readState: 'manuale' as const, ...over,
});
const recipient = (id: string, name = 'Cliente di prova') => ({ id, name, kind: 'cliente' as const, defaultPlace: 'Milano', active: true });
const bytes = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));

async function pairTwo(server: FakeServer, extra: Parameters<typeof makeDevice>[1] = {}) {
  const a = await makeDevice(server, extra);
  const b = await makeDevice(server, extra);
  return { a, b };
}
async function connect(a: Device, b: Device) {
  const code = await a.engine.createPairing('Telefono di A');
  await a.engine.syncNow();
  const name = await b.engine.pair(code, 'Computer di B');
  await b.engine.syncNow();
  return name;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sincronizzazione tra due dispositivi', () => {
  it('si collegano e si scambiano spese con foto; le impostazioni si uniscono', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    const photo = new Blob([new Uint8Array([1, 2, 3, 250, 251, 252])], { type: 'image/jpeg' });
    await a.db.putRecipient(recipient('r1'));
    await a.db.putPhoto({ id: 'ph1', blob: photo });
    await a.db.putExpense(baseExpense('e1', { photoId: 'ph1' }));
    await a.db.putSettings({ ...(await a.db.getSettings()), centsPerKm: 77, headerName: 'Nome di A' });
    await b.db.putExpense(baseExpense('e2', { amountCents: 2500 }));

    expect(await connect(a, b)).toBe('Telefono di A');
    await a.engine.syncNow(); // A riceve ciò che B ha messo in coda

    for (const d of [a, b]) {
      expect((await d.db.listExpenses()).map((e) => e.id).sort()).toEqual(['e1', 'e2']);
      expect((await d.db.listRecipients()).map((r) => r.id)).toEqual(['r1']);
      expect((await d.db.getSettings()).headerName).toBe('Nome di A');
    }
    expect(await bytes((await b.db.getPhoto('ph1'))!.blob)).toEqual(await bytes(photo));
    expect((await b.db.getPhoto('ph1'))!.blob.type).toBe('image/jpeg');
    expect(b.remoteChanges).toBeGreaterThan(0);
    expect(a.engine.getStatus()).toMatchObject({ paired: true, state: 'idle', pending: 0 });
    expect(a.engine.getStatus().lastSyncAt).not.toBeNull();
    expect(await b.db.listOutbox()).toEqual([]);

    // sul server non c'è niente in chiaro
    const everything = JSON.stringify([...server.vaults.values()].map((v) => [...v.env.values()]));
    expect(everything).not.toContain('Nome di A');
    expect(everything).not.toContain('Cliente di prova');
    const [vault] = [...server.vaults.keys()];
    expect(fromBase64Url(vault)).toHaveLength(16);
  });

  it('sulla stessa spesa vince la modifica più recente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putRecipient(recipient('r1'));
    await a.db.putExpense(baseExpense('e1'));
    await connect(a, b);

    vi.setSystemTime(2_000_000); // B modifica prima…
    await b.db.putExpense({ ...(await b.db.getExpense('e1'))!, amountCents: 111, notes: 'di B' });
    vi.setSystemTime(3_000_000); // …A modifica dopo
    await a.db.putExpense({ ...(await a.db.getExpense('e1'))!, amountCents: 222, notes: 'di A' });

    await b.engine.syncNow(); // B spedisce la sua (vecchia)
    await a.engine.syncNow(); // A riceve quella di B, ma la sua è più recente: la rimette in coda
    expect((await a.db.getExpense('e1'))!.amountCents).toBe(222);
    // un record remoto più vecchio di quello locale non lo sostituisce e lo rimette in coda
    const stale = { ...(await a.db.exportRecord('expenses', 'e1'))!, updatedAt: 5 };
    expect(await a.db.listOutbox()).toEqual([]);
    expect(await a.db.applyRemoteRecord(stale)).toBe('requeued');
    expect((await a.db.listOutbox()).map((o) => o.key)).toEqual(['expenses/e1']);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.db.getExpense('e1')).toMatchObject({ amountCents: 222, notes: 'di A' });
    expect(await a.db.getExpense('e1')).toMatchObject({ amountCents: 222, notes: 'di A' });
  });

  it('una cancellazione più recente vince su una modifica; una modifica più recente vince sulla cancellazione', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putExpense(baseExpense('e1'));
    await a.db.putExpense(baseExpense('e2'));
    await connect(a, b);

    vi.setSystemTime(2_000_000);
    await b.db.putExpense({ ...(await b.db.getExpense('e1'))!, notes: 'modificata' });
    await b.db.putExpense({ ...(await b.db.getExpense('e2'))!, notes: 'modificata dopo' });
    vi.setSystemTime(1_500_000);
    await a.db.deleteExpense('e1'); // cancellazione più VECCHIA della modifica di B (orologio indietro)
    vi.setSystemTime(3_000_000);
    await a.db.deleteExpense('e2'); // cancellazione più recente

    for (let i = 0; i < 2; i++) {
      await a.engine.syncNow();
      await b.engine.syncNow();
    }
    // e1: la modifica di B (2_000_000) batte la cancellazione di A (1_500_000)
    expect((await a.db.getExpense('e1'))?.notes).toBe('modificata');
    expect((await b.db.getExpense('e1'))?.notes).toBe('modificata');
    // e2: la cancellazione di A (3_000_000) batte la modifica di B
    expect(await a.db.getExpense('e2')).toBeUndefined();
    expect(await b.db.getExpense('e2')).toBeUndefined();
  });

  it('cancellare un destinatario sparisce anche dall’altro dispositivo, con spese e foto', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putRecipient(recipient('r1'));
    await a.db.putRecipient(recipient('r2', 'Altro cliente'));
    await a.db.putPhoto({ id: 'ph1', blob: new Blob(['abc'], { type: 'image/jpeg' }) });
    await a.db.putExpense(baseExpense('e1', { photoId: 'ph1' }));
    await a.db.putExpense(baseExpense('e2', { recipientId: 'r2' }));
    await connect(a, b);
    expect(await b.db.getPhoto('ph1')).toBeDefined();

    await a.db.deleteRecipient('r1');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect((await b.db.listRecipients()).map((r) => r.id)).toEqual(['r2']);
    expect((await b.db.listExpenses()).map((e) => e.id)).toEqual(['e2']);
    expect(await b.db.getPhoto('ph1')).toBeUndefined();
  });

  it('la lapide di una spesa elimina la foto anche se la lapide della foto non arriva', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putPhoto({ id: 'ph1', blob: new Blob(['abc'], { type: 'image/jpeg' }) });
    await a.db.putExpense(baseExpense('e1', { photoId: 'ph1' }));
    await connect(a, b);
    // l'altro dispositivo riceve solo la lapide della spesa
    await a.db.deleteExpense('e1');
    const rec = (await a.db.exportRecord('expenses', 'e1'))!;
    expect(rec.deleted).toBe(true);
    await b.db.applyRemoteRecord(rec);
    expect(await b.db.getPhoto('ph1')).toBeUndefined();
  });

  it('senza rete le modifiche restano in coda e partono appena torna', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await connect(a, b);

    server.online = false;
    await b.db.putExpense(baseExpense('off-1'));
    await b.db.putExpense(baseExpense('off-2'));
    await b.engine.syncNow();
    expect(b.engine.getStatus()).toMatchObject({ state: 'offline', pending: 2 });
    expect((await b.db.listExpenses()).map((e) => e.id).sort()).toEqual(['off-1', 'off-2']); // l'app funziona

    server.online = true;
    await b.engine.syncNow();
    expect(b.engine.getStatus()).toMatchObject({ state: 'idle', pending: 0 });
    await a.engine.syncNow();
    expect((await a.db.listExpenses()).map((e) => e.id).sort()).toEqual(['off-1', 'off-2']);
  });

  it('un dispositivo scollegato non mette più in coda e non sincronizza', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await connect(a, b);
    await b.engine.unpair();
    expect(b.engine.getStatus()).toMatchObject({ paired: false, pending: 0 });
    await b.db.putExpense(baseExpense('solo-b'));
    expect(await b.db.listOutbox()).toEqual([]);
    const pushes = server.pushCalls;
    await b.engine.syncNow();
    expect(server.pushCalls).toBe(pushes);
    await a.engine.syncNow();
    expect(await a.db.getExpense('solo-b')).toBeUndefined();
    expect(await b.db.getSyncState()).toBeUndefined();
  });

  it('«Elimina i dati dal server» cancella la casella e scollega', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putExpense(baseExpense('e1'));
    await connect(a, b);
    expect(server.vaults.size).toBe(1);
    await b.engine.deleteRemote();
    expect(server.vaults.size).toBe(0);
    expect(b.engine.getStatus().paired).toBe(false);
    expect(await b.db.getExpense('e1')).toBeDefined(); // i dati restano sul dispositivo
  });

  it('con molte buste il pull è paginato e il push va a blocchi da 50', async () => {
    const server = new FakeServer();
    server.pageLimit = 30;
    const { a, b } = await pairTwo(server);
    for (let i = 0; i < 120; i++) await a.db.putExpense(baseExpense(`m-${i}`));
    await connect(a, b);
    expect((await b.db.listExpenses()).length).toBe(120);
    expect(server.pushCalls).toBeGreaterThanOrEqual(3);
    expect(server.pullCalls).toBeGreaterThan(4);
    expect((await b.db.getSyncState())!.lastSeq).toBeGreaterThanOrEqual(120);
  });

  it('un ciclo alla volta', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await connect(a, b);
    const before = server.pullCalls;
    await Promise.all([a.engine.syncNow(), a.engine.syncNow(), a.engine.syncNow()]);
    expect(server.pullCalls - before).toBe(1);
  });
});

describe('primo collegamento', () => {
  it('rifiuta di collegare se ci sono ancora i dati di prova', async () => {
    const server = new FakeServer();
    const a = await makeDevice(server);
    const b = await makeDevice(server, {}, false); // ha ancora i dati di prova
    const code = await a.engine.createPairing('A');
    await expect(b.engine.pair(code)).rejects.toMatchObject({ code: 'sample-data' });
    expect(await b.db.getSyncState()).toBeUndefined();
    const c = await makeDevice(server, {}, false);
    await expect(c.engine.createPairing('C')).rejects.toMatchObject({ code: 'sample-data' });
  });

  it('un codice non valido o un dispositivo già collegato sono errori espliciti', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await expect(b.engine.pair('nsync1:abc')).rejects.toMatchObject({ code: 'invalid-code' });
    await connect(a, b);
    await expect(b.engine.pair(await a.engine.createPairing())).rejects.toMatchObject({ code: 'already-paired' });
    // un dispositivo già collegato che mostra il codice mostra quello della sua casella
    expect(await a.engine.createPairing('altro nome')).toBe(await a.engine.createPairing());
  });

  it('il codice scritto a mano collega come il QR', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putExpense(baseExpense('e1'));
    await a.engine.createPairing('A');
    const st = (await a.db.getSyncState())!;
    const { composeManualCode } = await import('./crypto');
    await a.engine.syncNow();
    await b.engine.pair(composeManualCode(st.vaultId, st.secret).toLowerCase().replace(/ /g, '-'));
    await b.engine.syncNow();
    expect((await b.db.getExpense('e1'))?.id).toBe('e1');
  });

  it('con un codice sbagliato il server rifiuta e lo stato è «error»', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putExpense(baseExpense('e1'));
    await a.engine.createPairing('A');
    await a.engine.syncNow();
    const { composePairingCode, generateSecret } = await import('./crypto');
    const st = (await a.db.getSyncState())!;
    await b.engine.pair(composePairingCode(st.vaultId, generateSecret(), 'finto'));
    await b.engine.syncNow();
    expect(b.engine.getStatus().state).toBe('error');
    expect(await b.db.getExpense('e1')).toBeUndefined();
  });

  it('senza server configurato il motore non fa niente', async () => {
    const eng = await import('./engine');
    const e = eng.createSyncEngine({});
    expect(e.configured).toBe(false);
    await e.syncNow();
    e.start();
    await expect(e.createPairing()).rejects.toMatchObject({ code: 'not-configured' });
  });
});

describe('foto grandi', () => {
  it('se la busta supera il limite la foto si riduce prima di cifrarla', async () => {
    const server = new FakeServer();
    const shrink = vi.fn(async (blob: Blob, step: number) => (step === 0 ? new Blob([new Uint8Array(400)], { type: 'image/jpeg' }) : blob));
    const { a, b } = await pairTwo(server, { maxEnvelopeBytes: 2000, shrinkPhoto: shrink });
    const big = new Uint8Array(5000);
    crypto.getRandomValues(big.subarray(0, 4096));
    await a.db.putPhoto({ id: 'big', blob: new Blob([big], { type: 'image/jpeg' }) });
    await a.db.putPhoto({ id: 'small', blob: new Blob([new Uint8Array(100)], { type: 'image/jpeg' }) });
    await connect(a, b);
    expect(shrink).toHaveBeenCalledTimes(1);
    expect((await b.db.getPhoto('big'))!.blob.size).toBe(400);
    expect((await b.db.getPhoto('small'))!.blob.size).toBe(100);
    expect((await a.db.getPhoto('big'))!.blob.size).toBe(5000); // l'originale resta dov'è
  });

  it('se anche ridotta non ci sta, resta in coda e lo stato lo dice', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server, { maxEnvelopeBytes: 1000, shrinkPhoto: async (x) => x });
    await a.db.putPhoto({ id: 'huge', blob: new Blob([new Uint8Array(5000)], { type: 'image/jpeg' }) });
    await a.db.putExpense(baseExpense('e1'));
    await connect(a, b);
    expect(a.engine.getStatus()).toMatchObject({ skipped: 1, pending: 1 });
    expect((await b.db.getExpense('e1'))?.id).toBe('e1');
    expect(await b.db.getPhoto('huge')).toBeUndefined();
  });
});

describe('buste ostili', () => {
  it('una busta manomessa sul server viene saltata senza bloccare le altre', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await a.db.putExpense(baseExpense('e1'));
    await a.db.putExpense(baseExpense('e2'));
    await a.engine.createPairing('A');
    await a.engine.syncNow();
    const v = [...server.vaults.values()][0];
    const first = [...v.env.values()][0];
    const body = fromBase64Url(first.body);
    body[body.length - 1] ^= 1;
    first.body = Buffer.from(body).toString('base64url');
    const { composePairingCode } = await import('./crypto');
    const st = (await a.db.getSyncState())!;
    await b.engine.pair(composePairingCode(st.vaultId, st.secret));
    await b.engine.syncNow();
    expect(b.engine.getStatus().state).toBe('idle');
    expect((await b.db.listExpenses()).length).toBeGreaterThanOrEqual(1);
    expect((await b.db.listExpenses()).length).toBeLessThan(2 + 1);
  });
});

describe('pianificazione', () => {
  it('2 secondi dopo una modifica parte la sincronizzazione; più modifiche ravvicinate ne fanno una sola', async () => {
    const server = new FakeServer();
    const { a, b } = await pairTwo(server);
    await connect(a, b);
    a.engine.start();
    await vi.waitFor(() => expect(a.engine.getStatus().state).toBe('idle'));
    await a.engine.syncNow();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const before = server.pushCalls;
    await a.db.putExpense(baseExpense('t1'));
    await a.db.putExpense(baseExpense('t2'));
    await vi.advanceTimersByTimeAsync(1900);
    expect(server.pushCalls).toBe(before);
    await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();
    await a.engine.syncNow();
    expect(server.pushCalls).toBe(before + 1);
    a.engine.stop();
  });
});
