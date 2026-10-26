// Crittografia della sincronizzazione (docs/sync.md, «Chiavi» e «Buste»): solo Web Crypto.
// Il server vede soltanto identificativi opachi e buste cifrate.

export const VAULT_ID_BYTES = 16;
export const SECRET_BYTES = 32;
export const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const CODE_PREFIX = 'nsync1:';
const INFO_ENC = 'note-spese/enc/v1';
const INFO_AUTH = 'note-spese/auth/v1';
const INFO_ID = 'note-spese/id/v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

// Web Crypto vuole BufferSource su ArrayBuffer: i Uint8Array si passano così.
type Bytes = Uint8Array<ArrayBuffer>;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto non disponibile (serve una connessione sicura).');
  return s;
}

export function randomBytes(n: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// --- base64url (senza riempimento) ---
export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new Error('Testo base64url non valido.');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- generazione ---
export function generateVaultId(): Bytes {
  return randomBytes(VAULT_ID_BYTES);
}
export function generateSecret(): Bytes {
  return randomBytes(SECRET_BYTES);
}

// --- chiavi derivate con HKDF-SHA-256 (sale vuoto, info come in sync.md) ---
export interface SyncKeys {
  encKey: CryptoKey; // AES-GCM 256
  authToken: string; // 32 byte in base64url, da mandare in `Authorization: Bearer`
  idKey: CryptoKey; // HMAC-SHA-256
}

export async function deriveKeys(secret: Uint8Array): Promise<SyncKeys> {
  const s = subtle();
  const base = await s.importKey('raw', secret as Bytes, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const params = (info: string): HkdfParams => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) });
  const encKey = await s.deriveKey(params(INFO_ENC), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const auth = await s.deriveBits(params(INFO_AUTH), base, 256);
  const idKey = await s.deriveKey(params(INFO_ID), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return { encKey, authToken: toBase64Url(new Uint8Array(auth)), idKey };
}

// `opaqueId` = base64url(HMAC(idKey, collection + "/" + id)).
export async function opaqueId(idKey: CryptoKey, collection: string, id: string): Promise<string> {
  const mac = await subtle().sign('HMAC', idKey, enc.encode(`${collection}/${id}`));
  return toBase64Url(new Uint8Array(mac));
}

// --- busta ---
// Formato binario: [versione: 1 byte][IV: 12 byte][testo cifrato AES-GCM con tag]. Dato associato:
// i 16 byte di `vaultId` seguiti dai byte UTF-8 dell'`opaqueId` (testo base64url), così una busta
// non si può spostare in un'altra casella né sotto un altro identificativo.
function associatedData(vaultId: Uint8Array, oid: string): Bytes {
  return concat(vaultId, enc.encode(oid));
}

export async function sealEnvelope(encKey: CryptoKey, vaultId: Uint8Array, oid: string, payload: unknown): Promise<Bytes> {
  const iv = randomBytes(IV_BYTES);
  const plain = enc.encode(JSON.stringify(payload));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: associatedData(vaultId, oid) }, encKey, plain);
  return concat(new Uint8Array([ENVELOPE_VERSION]), iv, new Uint8Array(ct));
}

// Lancia un errore se la busta è manomessa, di versione ignota o con dato associato diverso.
export async function openEnvelope<T = unknown>(encKey: CryptoKey, vaultId: Uint8Array, oid: string, envelope: Uint8Array): Promise<T> {
  if (envelope.length < 1 + IV_BYTES + 16) throw new Error('Busta troppo corta.');
  if (envelope[0] !== ENVELOPE_VERSION) throw new Error('Versione della busta non supportata.');
  const iv = envelope.slice(1, 1 + IV_BYTES);
  const ct = envelope.slice(1 + IV_BYTES);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: associatedData(vaultId, oid) }, encKey, ct);
  } catch {
    throw new Error('Busta non valida: manomessa o non destinata a questa casella.');
  }
  return JSON.parse(dec.decode(plain)) as T;
}

// --- codifica del testo scritto a mano: base32 Crockford ---
// Alfabeto 0-9 A-Z senza I, L, O, U. Chi scrive a mano può confondere O con 0 e I/L con 1: in lettura
// vengono trattati come 0 e 1 (regola di Crockford). Maiuscole/minuscole, spazi e trattini sono ignorati.
// In coda c'è un carattere di controllo (somma pesata dei simboli modulo 32) che scopre quasi tutti
// gli errori di battitura. 48 byte → 77 caratteri + 1 di controllo = 78, mostrati a gruppi di 5.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function toCrockford(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out;
}

function crockfordValues(text: string): number[] {
  const values: number[] = [];
  for (const ch of text.toUpperCase().replace(/[\s-]+/g, '')) {
    const c = ch === 'O' ? '0' : ch === 'I' || ch === 'L' ? '1' : ch;
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error(`Carattere non valido nel codice: «${ch}».`);
    values.push(v);
  }
  return values;
}

export function fromCrockford(text: string, byteLength: number): Bytes {
  const values = crockfordValues(text);
  const out = new Uint8Array(byteLength);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (const v of values) {
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      if (o < byteLength) out[o++] = (acc >> (bits - 8)) & 255;
      bits -= 8;
      acc &= (1 << bits) - 1;
    }
  }
  if (o < byteLength) throw new Error('Il codice è troppo corto.');
  return out;
}

function checkChar(values: number[]): string {
  let sum = 0;
  values.forEach((v, i) => (sum += v * (i + 1)));
  return ALPHABET[sum % 32];
}

// --- codice di collegamento ---
export interface PairingInfo {
  vaultId: Bytes;
  secret: Bytes;
  deviceName: string;
}

// Codice del QR: `nsync1:` + base64url(vaultId ‖ secret) + `#` + nome del dispositivo (percent-encoded, facoltativo).
export function composePairingCode(vaultId: Uint8Array, secret: Uint8Array, deviceName = ''): string {
  const name = deviceName.trim();
  return CODE_PREFIX + toBase64Url(concat(vaultId, secret)) + (name ? `#${encodeURIComponent(name)}` : '');
}

// Codice da scrivere a mano: Crockford + carattere di controllo, a gruppi di 5 separati da spazio.
export function composeManualCode(vaultId: Uint8Array, secret: Uint8Array): string {
  const raw = toCrockford(concat(vaultId, secret));
  const full = raw + checkChar(crockfordValues(raw));
  return full.match(/.{1,5}/g)!.join(' ');
}

// Legge sia il codice del QR sia quello scritto a mano (quest'ultimo non porta il nome del dispositivo).
export function parsePairingCode(input: string): PairingInfo {
  const text = input.trim();
  const total = VAULT_ID_BYTES + SECRET_BYTES;
  if (text.slice(0, CODE_PREFIX.length).toLowerCase() === CODE_PREFIX) {
    const rest = text.slice(CODE_PREFIX.length);
    const hash = rest.indexOf('#');
    const body = hash < 0 ? rest : rest.slice(0, hash);
    let deviceName = '';
    if (hash >= 0) {
      try {
        deviceName = decodeURIComponent(rest.slice(hash + 1));
      } catch {
        deviceName = '';
      }
    }
    let bytes: Bytes;
    try {
      bytes = fromBase64Url(body);
    } catch {
      throw new Error('Codice di collegamento non valido.');
    }
    if (bytes.length !== total) throw new Error('Codice di collegamento non valido.');
    return { vaultId: bytes.slice(0, VAULT_ID_BYTES), secret: bytes.slice(VAULT_ID_BYTES), deviceName };
  }
  if (text.includes(':')) throw new Error('Codice di collegamento non riconosciuto.');
  const values = crockfordValues(text);
  const dataChars = Math.ceil((total * 8) / 5);
  if (values.length !== dataChars + 1) throw new Error('Il codice ha una lunghezza sbagliata: controlla di averlo copiato tutto.');
  if (ALPHABET[values[dataChars]] !== checkChar(values.slice(0, dataChars))) throw new Error('Il codice contiene un errore di battitura.');
  const bytes = fromCrockford(values.slice(0, dataChars).map((v) => ALPHABET[v]).join(''), total);
  return { vaultId: bytes.slice(0, VAULT_ID_BYTES), secret: bytes.slice(VAULT_ID_BYTES), deviceName: '' };
}
