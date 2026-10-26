// Motore di sincronizzazione (docs/sync.md, «Algoritmo sul dispositivo»).
// Pull prima di push; ultima modifica vince (`updatedAt`); lapidi che eliminano anche la foto della spesa.
//
// Notifica all'interfaccia: `engine.onRemoteChange(fn)` richiama `fn` dopo ogni ciclo che ha applicato
// dati arrivati dal server (l'interfaccia ricarica i dati con `reload()`); `engine.subscribe(fn)` segue
// invece lo stato (`idle | syncing | offline | error`, coda, ultima sincronizzazione).
import {
  ackOutbox, applyRemoteRecord, clearSyncState, countOutbox, exportRecord, getSyncState, hasSampleData, listOutbox,
  purgeTombstones, putSyncState, queueEverything, setLocalChangeListener, type OutboxEntry, type SyncCollection, type SyncRecord, type SyncState,
} from '../db';
import {
  composePairingCode, deriveKeys, fromBase64Url, opaqueId, openEnvelope, parsePairingCode, sealEnvelope, toBase64Url,
  generateSecret, generateVaultId, type SyncKeys,
} from './crypto';
import { createHttpClient, httpStatusOf, isNetworkError, SYNC_URL, type SyncClient, type WireEnvelope } from './client';

export const MAX_ENVELOPE_BYTES = 1.5 * 1024 * 1024; // busta cifrata
export const PUSH_MAX_ITEMS = 50;
export const PUSH_MAX_BYTES = 4 * 1024 * 1024; // corpo di una richiesta (testo base64url)
export const PULL_LIMIT = 100;
export const DEBOUNCE_MS = 2000;
export const INTERVAL_MS = 5 * 60 * 1000;

export type SyncStateName = 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  paired: boolean;
  state: SyncStateName;
  pending: number; // modifiche in coda d'uscita
  lastSyncAt: number | null;
  deviceName: string;
  error: string | null;
  skipped: number; // record rimasti in coda perché troppo grandi anche ridotti
}

export type SyncErrorCode = 'not-configured' | 'not-paired' | 'already-paired' | 'sample-data' | 'invalid-code' | 'unauthorized' | 'server';
export class SyncError extends Error {
  constructor(public readonly code: SyncErrorCode, message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface EngineOptions {
  client?: SyncClient; // senza client (nessun VITE_SYNC_URL) il motore non fa nulla
  // Riduce una foto: `step` 0, 1, 2… chiede riduzioni sempre più forti. Di base usa il canvas del browser.
  shrinkPhoto?: (blob: Blob, step: number) => Promise<Blob>;
  maxEnvelopeBytes?: number;
}

const SHRINK_STEPS: [number, number][] = [[1280, 0.7], [1024, 0.6], [800, 0.5], [600, 0.45]];
async function defaultShrink(blob: Blob, step: number): Promise<Blob> {
  const { resizePhoto } = await import('../image');
  const [side, quality] = SHRINK_STEPS[Math.min(step, SHRINK_STEPS.length - 1)];
  return resizePhoto(blob, side, quality);
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

interface PhotoWire {
  type: string;
  data: string; // base64url
}

export function createSyncEngine(opts: EngineOptions = {}) {
  const client = opts.client;
  const shrink = opts.shrinkPhoto ?? defaultShrink;
  const maxEnvelope = opts.maxEnvelopeBytes ?? MAX_ENVELOPE_BYTES;

  let status: SyncStatus = { paired: false, state: 'idle', pending: 0, lastSyncAt: null, deviceName: '', error: null, skipped: 0 };
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const remoteListeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let keysCache: { secret: string; keys: SyncKeys } | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;
  let onlineHandler: (() => void) | undefined;
  let started = false;

  function setStatus(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch };
    for (const fn of statusListeners) fn(status);
  }

  async function refresh(): Promise<SyncStatus> {
    const st = await getSyncState();
    setStatus({
      paired: !!st,
      pending: st ? await countOutbox() : 0,
      lastSyncAt: st?.lastSyncAt ?? null,
      deviceName: st?.deviceName ?? '',
    });
    return status;
  }

  async function keysFor(st: SyncState): Promise<SyncKeys> {
    const id = toBase64Url(st.secret);
    if (keysCache?.secret !== id) keysCache = { secret: id, keys: await deriveKeys(st.secret) };
    return keysCache.keys;
  }

  function requireClient(): SyncClient {
    if (!client) throw new SyncError('not-configured', 'La sincronizzazione non è configurata in questa versione dell’app.');
    return client;
  }

  // --- conversione dei record in/da buste ---
  async function toPayload(rec: SyncRecord): Promise<SyncRecord & { value?: unknown }> {
    if (rec.collection === 'photos' && !rec.deleted) {
      const { blob } = rec.value as { id: string; blob: Blob };
      return { ...rec, value: { type: blob.type || 'image/jpeg', data: toBase64Url(await blobToBytes(blob)) } satisfies PhotoWire };
    }
    return rec;
  }
  function fromPayload(p: SyncRecord): SyncRecord {
    if (p.collection === 'photos' && !p.deleted) {
      const w = p.value as PhotoWire;
      return { ...p, value: { id: p.id, blob: new Blob([fromBase64Url(w.data)], { type: w.type }) } };
    }
    return p;
  }

  // Cifra un record; se la busta è troppo grande e il record è una foto, la riduce ancora. null = non spedibile.
  async function seal(st: SyncState, keys: SyncKeys, rec: SyncRecord): Promise<{ oid: string; env: Uint8Array } | null> {
    const oid = await opaqueId(keys.idKey, rec.collection, rec.id);
    let current = rec;
    for (let step = -1; step < SHRINK_STEPS.length; step++) {
      if (step >= 0) {
        if (rec.collection !== 'photos' || rec.deleted) return null;
        const blob = (current.value as { id: string; blob: Blob }).blob;
        current = { ...rec, value: { id: rec.id, blob: await shrink(blob, step) } };
      }
      const payload = await toPayload(current);
      const env = await sealEnvelope(keys.encKey, st.vaultId, oid, {
        collection: payload.collection, id: payload.id, updatedAt: payload.updatedAt, deleted: payload.deleted, value: payload.value,
      });
      if (env.length <= maxEnvelope) return { oid, env };
    }
    return null;
  }

  // Aggiorna lo stato solo se il dispositivo è ancora collegato (uno «Scollega» durante il ciclo vince).
  async function updateState(patch: Partial<SyncState>): Promise<void> {
    const cur = await getSyncState();
    if (cur) await putSyncState({ ...cur, ...patch });
  }

  // --- pull ---
  async function pullAll(st: Readonly<SyncState>, keys: SyncKeys): Promise<boolean> {
    const c = requireClient();
    const vault = toBase64Url(st.vaultId);
    let changed = false;
    let since = st.lastSeq;
    for (;;) {
      let page;
      try {
        page = await c.pull(vault, keys.authToken, since, PULL_LIMIT);
      } catch (err) {
        // Casella mai scritta: il server può rispondere 404, che per noi significa «niente da leggere».
        if (httpStatusOf(err) === 404) return changed;
        throw err;
      }
      for (const item of page.items) {
        try {
          const p = await openEnvelope<SyncRecord>(keys.encKey, st.vaultId, item.oid, fromBase64Url(item.body));
          // La busta deve stare sotto l'identificativo opaco che le corrisponde.
          if (item.oid !== (await opaqueId(keys.idKey, p.collection, p.id))) continue;
          const result = await applyRemoteRecord(fromPayload(p));
          if (result === 'applied') changed = true;
        } catch {
          /* busta manomessa o illeggibile: si salta, senza bloccare le altre */
        }
        since = Math.max(since, item.seq);
      }
      if (page.next === null || page.next === undefined) {
        // Pagina finale: se ha buste, `since` è già il loro ultimo `seq`.
        break;
      }
      since = Math.max(since, page.next);
      await updateState({ lastSeq: since });
    }
    await updateState({ lastSeq: since });
    return changed;
  }

  // --- push ---
  async function pushAll(st: SyncState, keys: SyncKeys): Promise<void> {
    const c = requireClient();
    const vault = toBase64Url(st.vaultId);
    const entries = await listOutbox();
    let skipped = 0;
    let batch: { entry: OutboxEntry; wire: WireEnvelope }[] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      await c.push(vault, keys.authToken, batch.map((b) => b.wire));
      await ackOutbox(batch.map((b) => ({ key: b.entry.key, rev: b.entry.rev })));
      batch = [];
      bytes = 0;
    };
    for (const entry of entries) {
      const rec = await exportRecord(entry.collection as SyncCollection, entry.id);
      if (!rec) {
        await ackOutbox([{ key: entry.key, rev: entry.rev }]); // il record non esiste più (lapide ripulita)
        continue;
      }
      const sealed = await seal(st, keys, rec);
      if (!sealed) {
        skipped++;
        continue;
      }
      const wire = { oid: sealed.oid, body: toBase64Url(sealed.env) };
      if (batch.length >= PUSH_MAX_ITEMS || (batch.length && bytes + wire.body.length > PUSH_MAX_BYTES)) await flush();
      batch.push({ entry, wire });
      bytes += wire.body.length;
    }
    await flush();
    setStatus({ skipped });
  }

  // --- ciclo ---
  async function cycle(): Promise<void> {
    const st0 = await getSyncState();
    if (!st0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await refresh();
      setStatus({ state: 'offline', error: null });
      return;
    }
    setStatus({ state: 'syncing', error: null });
    try {
      const keys = await keysFor(st0);
      const changed = await pullAll(st0, keys);
      await pushAll((await getSyncState()) ?? st0, keys);
      await updateState({ lastSyncAt: Date.now() });
      await purgeTombstones().catch(() => undefined);
      await refresh();
      setStatus({ state: 'idle' });
      if (changed) for (const fn of remoteListeners) fn();
    } catch (err) {
      await refresh().catch(() => undefined);
      if (isNetworkError(err)) setStatus({ state: 'offline', error: null });
      else if (httpStatusOf(err) === 401 || httpStatusOf(err) === 403)
        setStatus({ state: 'error', error: 'Il server non riconosce questo collegamento.' });
      else if (httpStatusOf(err) === 429) setStatus({ state: 'error', error: 'Spazio sul server esaurito o troppe richieste.' });
      else setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Un solo ciclo alla volta: una richiesta mentre ne gira uno aspetta quello e basta.
  function syncNow(): Promise<void> {
    if (!client) return Promise.resolve();
    if (!running) {
      running = cycle().finally(() => {
        running = null;
      });
    }
    return running;
  }

  // --- collegamento ---
  function scheduleSoon(): void {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  }

  async function assertCanPair(): Promise<void> {
    requireClient();
    if (await getSyncState()) throw new SyncError('already-paired', 'Questo dispositivo è già collegato.');
    if (await hasSampleData()) {
      throw new SyncError('sample-data', 'Ci sono ancora i dati di prova: cancellali prima di collegare il dispositivo.');
    }
  }

  async function startPairing(vaultId: Uint8Array, secret: Uint8Array, deviceName: string): Promise<void> {
    await putSyncState({ vaultId, secret, lastSeq: 0, lastSyncAt: null, deviceName });
    await queueEverything(); // primo collegamento: tutti i record in coda, così gli archivi si uniscono
    await refresh();
    void syncNow();
  }

  // Dispositivo che mostra il codice: genera la casella e restituisce il codice per il QR.
  // Se è già collegato restituisce il codice della casella in uso (per aggiungere un altro dispositivo).
  async function createPairing(deviceName = 'Questo dispositivo'): Promise<string> {
    requireClient();
    const existing = await getSyncState();
    if (existing) return composePairingCode(existing.vaultId, existing.secret, existing.deviceName);
    await assertCanPair();
    const vaultId = generateVaultId();
    const secret = generateSecret();
    await startPairing(vaultId, secret, deviceName);
    return composePairingCode(vaultId, secret, deviceName);
  }

  // Dispositivo che legge il codice (QR o scritto a mano). Restituisce il nome del dispositivo del codice, se c'è.
  async function pair(code: string, deviceName = 'Questo dispositivo'): Promise<string> {
    let info;
    try {
      info = parsePairingCode(code);
    } catch (err) {
      throw new SyncError('invalid-code', err instanceof Error ? err.message : 'Codice non valido.');
    }
    await assertCanPair();
    await startPairing(info.vaultId, info.secret, deviceName);
    return info.deviceName;
  }

  // «Scollega»: dimentica chiavi e coda; i dati restano sul dispositivo e sul server.
  async function unpair(): Promise<void> {
    clearTimeout(debounceTimer);
    await running?.catch(() => undefined);
    await clearSyncState();
    keysCache = null;
    setStatus({ state: 'idle', error: null, skipped: 0 });
    await refresh();
  }

  // «Elimina i dati dal server»: cancella la casella e scollega (altrimenti la prossima scrittura la ricreerebbe).
  async function deleteRemote(): Promise<void> {
    const c = requireClient();
    const st = await getSyncState();
    if (!st) throw new SyncError('not-paired', 'Questo dispositivo non è collegato.');
    const keys = await keysFor(st);
    try {
      await c.delete(toBase64Url(st.vaultId), keys.authToken);
    } catch (err) {
      if (httpStatusOf(err) !== 404) throw err;
    }
    await unpair();
  }

  // --- pianificazione: avvio, 2 s dopo una modifica, ritorno della rete, ogni 5 minuti ---
  function start(): void {
    if (started || !client) return;
    started = true;
    setLocalChangeListener(() => {
      void refresh();
      scheduleSoon();
    });
    onlineHandler = () => void syncNow();
    if (typeof window !== 'undefined') window.addEventListener('online', onlineHandler);
    intervalTimer = setInterval(() => void syncNow(), INTERVAL_MS);
    void refresh().then(() => syncNow());
  }

  function stop(): void {
    started = false;
    clearTimeout(debounceTimer);
    clearInterval(intervalTimer);
    setLocalChangeListener(undefined);
    if (onlineHandler && typeof window !== 'undefined') window.removeEventListener('online', onlineHandler);
    onlineHandler = undefined;
  }

  return {
    configured: !!client,
    getStatus: (): SyncStatus => status,
    refresh,
    subscribe(fn: (s: SyncStatus) => void): () => void {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    // Chiamata dopo aver applicato dati remoti: l'interfaccia ricarica i dati.
    onRemoteChange(fn: () => void): () => void {
      remoteListeners.add(fn);
      return () => remoteListeners.delete(fn);
    },
    createPairing,
    pair,
    syncNow,
    unpair,
    deleteRemote,
    start,
    stop,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

// Motore dell'app: senza `VITE_SYNC_URL` non ha client e non fa niente (l'app resta solo locale).
let instance: SyncEngine | null = null;
export function getSyncEngine(): SyncEngine {
  if (!instance) instance = createSyncEngine({ client: SYNC_URL ? createHttpClient(SYNC_URL) : undefined });
  return instance;
}
