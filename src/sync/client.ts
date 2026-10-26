// Client HTTP del server di scambio (docs/sync.md, «Server»). Non conosce le chiavi: lavora con
// identificativi e buste già pronti, tutti in base64url.

// Indirizzo del server, deciso alla build. Senza indirizzo la sincronizzazione non esiste.
export const SYNC_URL: string = ((import.meta.env?.VITE_SYNC_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');

export interface WireEnvelope {
  oid: string; // identificativo opaco
  body: string; // busta cifrata, base64url
}
export interface PulledEnvelope extends WireEnvelope {
  seq: number;
}
export interface PullResult {
  items: PulledEnvelope[];
  next: number | null; // se presente, ci sono altre buste: richiedere da qui
}

export interface SyncClient {
  push(vault: string, token: string, items: WireEnvelope[]): Promise<{ seq: number }>;
  pull(vault: string, token: string, since: number, limit?: number): Promise<PullResult>;
  delete(vault: string, token: string): Promise<void>;
}

// Il server ha risposto con un errore (401, 404, 413, 429, …).
export class SyncHttpError extends Error {
  constructor(public readonly status: number, message?: string) {
    super(message ?? `Il server ha risposto ${status}.`);
    this.name = 'SyncHttpError';
  }
}
// La richiesta non è arrivata (rete assente, server irraggiungibile).
export class SyncNetworkError extends Error {
  constructor(cause?: unknown) {
    super('Server non raggiungibile.');
    this.name = 'SyncNetworkError';
    this.cause = cause;
  }
}

// Riconoscimento per nome e non con `instanceof`: funziona anche tra copie diverse del modulo (nei test).
export function isNetworkError(err: unknown): boolean {
  return err instanceof Error && err.name === 'SyncNetworkError';
}
export function httpStatusOf(err: unknown): number | null {
  return err instanceof Error && err.name === 'SyncHttpError' ? (err as SyncHttpError).status : null;
}

// Sul filo il server usa base64 standard (worker/src/index.ts); dentro l'app si usa base64url.
export function b64urlToB64(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return b + '='.repeat((4 - (b.length % 4)) % 4);
}
export function b64ToB64url(s: string): string {
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createHttpClient(baseUrl: string, fetchFn: typeof fetch = (...a) => fetch(...a)): SyncClient {
  const base = baseUrl.replace(/\/+$/, '');
  async function call(method: string, path: string, token: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new SyncNetworkError(err);
    }
    if (!res.ok) throw new SyncHttpError(res.status);
    return res;
  }
  return {
    async push(vault, token, items) {
      const res = await call('POST', `/v1/vaults/${vault}/push`, token, {
        items: items.map((it) => ({ oid: it.oid, body: b64urlToB64(it.body) })),
      });
      return (await res.json()) as { seq: number };
    },
    async pull(vault, token, since, limit = 100) {
      const res = await call('GET', `/v1/vaults/${vault}/pull?since=${since}&limit=${limit}`, token);
      const j = (await res.json()) as { items?: PulledEnvelope[]; next?: number | null };
      const items = (j.items ?? []).map((it) => ({ ...it, body: b64ToB64url(it.body) }));
      return { items, next: j.next ?? null };
    },
    async delete(vault, token) {
      await call('DELETE', `/v1/vaults/${vault}`, token);
    },
  };
}
