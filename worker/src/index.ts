// Server di sincronizzazione cifrata: conserva buste opache, non vede mai dati in chiaro.
// Nessun registro di contenuti, token o indirizzi IP: qui non c'è alcun console.log.

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}

// Limiti (docs/sync.md)
const MAX_ITEMS = 50;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024; // corpo grezzo della richiesta
const MAX_PUSH_BYTES = 4 * 1024 * 1024; // somma delle buste di una push
const MAX_ENVELOPE_BYTES = 1.6 * 1024 * 1024;
const MAX_VAULT_BYTES = 500 * 1024 * 1024;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MAX_PULL_BYTES = 4 * 1024 * 1024; // tetto indicativo di una risposta di pull

const VAULT_RE = /^[A-Za-z0-9_-]{22}$/; // 16 byte in base64url
const OID_RE = /^[A-Za-z0-9_-]{43}$/; // 32 byte in base64url
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 byte in base64url
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const LOCALHOST_RE = /^http:\/\/localhost(:\d+)?$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- CORS ----------

function isAllowedOrigin(origin: string, env: Env): boolean {
  if (LOCALHOST_RE.test(origin)) return true; // sviluppo
  return env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    h["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
  });
}

// ---------- Codifiche ----------

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// D1 restituisce i BLOB come array di numeri (o ArrayBuffer, a seconda dell'ambiente).
function blobToBytes(v: unknown): Uint8Array {
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  throw new Error("Unexpected blob type");
}

// ---------- Autenticazione ----------

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

// Estrae il token dall'intestazione e ne restituisce lo SHA-256.
async function tokenHash(request: Request): Promise<Uint8Array> {
  const header = request.headers.get("Authorization");
  if (!header) throw new HttpError(401, "Missing token");
  const m = /^Bearer (\S+)$/.exec(header);
  if (!m || !TOKEN_RE.test(m[1])) throw new HttpError(401, "Invalid token format");
  return sha256(base64urlToBytes(m[1]));
}

function sameHash(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

async function readVaultHash(env: Env, vault: string): Promise<Uint8Array | null> {
  const row = await env.DB.prepare("SELECT auth_hash FROM vaults WHERE vault = ?")
    .bind(vault)
    .first<{ auth_hash: unknown }>();
  return row ? blobToBytes(row.auth_hash) : null;
}

// ---------- Gestori ----------

interface PushItem {
  oid: string;
  bytes: Uint8Array;
}

async function parsePush(request: Request): Promise<PushItem[]> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) throw new HttpError(413, "Request too large");
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) throw new HttpError(413, "Request too large");

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) throw new HttpError(400, "Field items must be an array");
  if (items.length > MAX_ITEMS) throw new HttpError(413, "Too many items (max 50)");

  // Se lo stesso oid compare più volte vale l'ultimo.
  const byOid = new Map<string, PushItem>();
  let total = 0;
  for (const it of items) {
    const oid = (it as { oid?: unknown } | null)?.oid;
    const body = (it as { body?: unknown } | null)?.body;
    if (typeof oid !== "string" || !OID_RE.test(oid)) throw new HttpError(400, "Invalid oid");
    if (typeof body !== "string" || !BASE64_RE.test(body)) throw new HttpError(400, "Invalid body");
    // Controllo prima di decodificare, per non lavorare su dati enormi.
    if (body.length > Math.ceil(MAX_ENVELOPE_BYTES / 3) * 4) {
      throw new HttpError(413, "Envelope too large");
    }
    const bytes = base64ToBytes(body);
    if (bytes.length > MAX_ENVELOPE_BYTES) throw new HttpError(413, "Envelope too large");
    if (bytes.length === 0) throw new HttpError(400, "Empty body");
    total += bytes.length;
    if (total > MAX_PUSH_BYTES) throw new HttpError(413, "Request too large");
    byOid.set(oid, { oid, bytes });
  }
  return [...byOid.values()];
}

async function handlePush(request: Request, env: Env, vault: string): Promise<{ seq: number }> {
  const hash = await tokenHash(request);
  const items = await parsePush(request);

  // Prima push: crea la casella con l'hash del token. Se qualcuno la crea nel
  // frattempo, INSERT OR IGNORE non la sovrascrive e il confronto sotto decide.
  let stored = await readVaultHash(env, vault);
  if (!stored) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO vaults (vault, auth_hash, created, seq) VALUES (?, ?, ?, 0)",
    )
      .bind(vault, hash.buffer, Date.now())
      .run();
    stored = await readVaultHash(env, vault);
  }
  if (!stored || !sameHash(stored, hash)) throw new HttpError(403, "Invalid token");

  // Spazio usato al netto delle buste che questa push sostituisce.
  const used = await env.DB.prepare("SELECT COALESCE(SUM(size), 0) AS used FROM envelopes WHERE vault = ?")
    .bind(vault)
    .first<{ used: number }>();
  let replaced = 0;
  if (items.length > 0) {
    const marks = items.map(() => "?").join(",");
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(size), 0) AS replaced FROM envelopes WHERE vault = ? AND oid IN (${marks})`,
    )
      .bind(vault, ...items.map((i) => i.oid))
      .first<{ replaced: number }>();
    replaced = r?.replaced ?? 0;
  }
  const added = items.reduce((n, i) => n + i.bytes.length, 0);
  if ((used?.used ?? 0) - replaced + added > MAX_VAULT_BYTES) {
    throw new HttpError(429, "Vault quota exceeded");
  }

  // Transazione unica: riserva N numeri di sequenza e scrive le buste.
  // Il subselect vede l'aggiornamento di vaults fatto dallo statement precedente.
  const n = items.length;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("UPDATE vaults SET seq = seq + ? WHERE vault = ?").bind(n, vault),
    ...items.map((it, i) =>
      env.DB.prepare(
        "INSERT OR REPLACE INTO envelopes (vault, oid, seq, body, size) " +
          "VALUES (?, ?, (SELECT seq FROM vaults WHERE vault = ?) - ? + ?, ?, ?)",
      ).bind(vault, it.oid, vault, n, i + 1, it.bytes.buffer, it.bytes.length),
    ),
    env.DB.prepare("SELECT seq FROM vaults WHERE vault = ?").bind(vault),
  ];
  const results = await env.DB.batch(statements);
  const last = results[results.length - 1].results[0] as { seq: number } | undefined;
  return { seq: last?.seq ?? 0 };
}

function parseUint(value: string | null, def: number, name: string): number {
  if (value === null || value === "") return def;
  if (!/^\d{1,15}$/.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return Number(value);
}

async function authExisting(request: Request, env: Env, vault: string): Promise<void> {
  const hash = await tokenHash(request);
  const stored = await readVaultHash(env, vault);
  if (!stored) throw new HttpError(404, "Vault not found");
  if (!sameHash(stored, hash)) throw new HttpError(403, "Invalid token");
}

async function handlePull(request: Request, env: Env, vault: string) {
  await authExisting(request, env, vault);
  const url = new URL(request.url);
  const since = parseUint(url.searchParams.get("since"), 0, "since");
  const limit = Math.min(Math.max(parseUint(url.searchParams.get("limit"), DEFAULT_LIMIT, "limit"), 1), MAX_LIMIT);

  // Prima solo i metadati (una riga in più per sapere se ce ne sono altre),
  // poi i corpi di quelle che stanno nel tetto di dimensione della risposta.
  const meta = await env.DB.prepare(
    "SELECT oid, seq, size FROM envelopes WHERE vault = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
  )
    .bind(vault, since, limit + 1)
    .all<{ oid: string; seq: number; size: number }>();
  const rows = meta.results;

  const picked: typeof rows = [];
  let bytes = 0;
  for (const r of rows.slice(0, limit)) {
    if (picked.length > 0 && bytes + r.size > MAX_PULL_BYTES) break;
    picked.push(r);
    bytes += r.size;
  }
  if (picked.length === 0) return { items: [], next: null };

  const lastSeq = picked[picked.length - 1].seq;
  const bodies = await env.DB.prepare(
    "SELECT oid, seq, body FROM envelopes WHERE vault = ? AND seq > ? AND seq <= ? ORDER BY seq ASC",
  )
    .bind(vault, since, lastSeq)
    .all<{ oid: string; seq: number; body: unknown }>();

  return {
    items: bodies.results.map((r) => ({ oid: r.oid, seq: r.seq, body: bytesToBase64(blobToBytes(r.body)) })),
    next: rows.length > picked.length ? lastSeq : null,
  };
}

async function handleDelete(request: Request, env: Env, vault: string): Promise<void> {
  await authExisting(request, env, vault);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM envelopes WHERE vault = ?").bind(vault),
    env.DB.prepare("DELETE FROM vaults WHERE vault = ?").bind(vault),
  ]);
}

// ---------- Ingresso ----------

const ROUTE_RE = /^\/v1\/vaults\/([^/]+)(\/push|\/pull)?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    let cors: Record<string, string> = { Vary: "Origin" };
    try {
      if (origin) {
        if (!isAllowedOrigin(origin, env)) throw new HttpError(403, "Origin not allowed");
        cors = corsHeaders(origin);
      }
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      const m = ROUTE_RE.exec(new URL(request.url).pathname);
      if (!m) throw new HttpError(404, "Not found");
      const [, vault, action] = m;
      if (!VAULT_RE.test(vault)) throw new HttpError(400, "Invalid vault id");

      if (action === "/push") {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        return json(await handlePush(request, env, vault), 200, cors);
      }
      if (action === "/pull") {
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        return json(await handlePull(request, env, vault), 200, cors);
      }
      if (request.method !== "DELETE") throw new HttpError(405, "Method not allowed");
      await handleDelete(request, env, vault);
      return new Response(null, { status: 204, headers: cors });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      // Errore imprevisto: nessun dettaglio nei registri né nella risposta.
      return json({ error: "Internal error" }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
