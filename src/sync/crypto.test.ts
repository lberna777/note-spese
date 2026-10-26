// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  composeManualCode, composePairingCode, deriveKeys, fromBase64Url, generateSecret, generateVaultId, opaqueId, openEnvelope,
  parsePairingCode, sealEnvelope, toBase64Url,
} from './crypto';

describe('base64url', () => {
  it('andata e ritorno, senza riempimento né caratteri +/', () => {
    for (const n of [0, 1, 2, 3, 47, 48, 255]) {
      const b = crypto.getRandomValues(new Uint8Array(n));
      const t = toBase64Url(b);
      expect(t).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(fromBase64Url(t))).toEqual(Array.from(b));
    }
  });
});

describe('chiavi', () => {
  it('vaultId 16 byte e secret 32 byte, diversi a ogni generazione', () => {
    expect(generateVaultId()).toHaveLength(16);
    expect(generateSecret()).toHaveLength(32);
    expect(toBase64Url(generateSecret())).not.toBe(toBase64Url(generateSecret()));
  });

  it('dallo stesso secret escono sempre le stesse chiavi derivate; authToken di 32 byte', async () => {
    const secret = generateSecret();
    const a = await deriveKeys(secret);
    const b = await deriveKeys(secret);
    expect(a.authToken).toBe(b.authToken);
    expect(fromBase64Url(a.authToken)).toHaveLength(32);
    expect(await opaqueId(a.idKey, 'expenses', 'x')).toBe(await opaqueId(b.idKey, 'expenses', 'x'));
    const other = await deriveKeys(generateSecret());
    expect(other.authToken).not.toBe(a.authToken);
  });

  it('stesso input → stesso opaqueId; input o chiave diversi → opaqueId diverso', async () => {
    const k = await deriveKeys(generateSecret());
    const o = await opaqueId(k.idKey, 'expenses', 'abc');
    expect(await opaqueId(k.idKey, 'expenses', 'abc')).toBe(o);
    expect(await opaqueId(k.idKey, 'photos', 'abc')).not.toBe(o);
    expect(await opaqueId(k.idKey, 'expenses', 'abd')).not.toBe(o);
    expect(await opaqueId((await deriveKeys(generateSecret())).idKey, 'expenses', 'abc')).not.toBe(o);
    expect(fromBase64Url(o)).toHaveLength(32);
  });
});

describe('busta', () => {
  const payload = { collection: 'expenses', id: 'e1', updatedAt: 5, deleted: false, value: { note: 'caffè ☕' } };

  it('andata e ritorno; formato: versione 1, IV di 12 byte, testo cifrato', async () => {
    const k = await deriveKeys(generateSecret());
    const vault = generateVaultId();
    const oid = await opaqueId(k.idKey, 'expenses', 'e1');
    const env = await sealEnvelope(k.encKey, vault, oid, payload);
    expect(env[0]).toBe(1);
    expect(env.length).toBeGreaterThan(1 + 12 + 16);
    expect(await openEnvelope(k.encKey, vault, oid, env)).toEqual(payload);
    // IV casuale: stessa busta cifrata due volte, byte diversi
    const again = await sealEnvelope(k.encKey, vault, oid, payload);
    expect(Array.from(again)).not.toEqual(Array.from(env));
  });

  it('una busta manomessa è rifiutata', async () => {
    const k = await deriveKeys(generateSecret());
    const vault = generateVaultId();
    const env = await sealEnvelope(k.encKey, vault, 'oid', payload);
    for (const i of [1, 13, env.length - 1]) {
      const bad = env.slice();
      bad[i] ^= 1;
      await expect(openEnvelope(k.encKey, vault, 'oid', bad)).rejects.toThrow();
    }
    const wrongVersion = env.slice();
    wrongVersion[0] = 2;
    await expect(openEnvelope(k.encKey, vault, 'oid', wrongVersion)).rejects.toThrow();
    await expect(openEnvelope(k.encKey, vault, 'oid', env.slice(0, 10))).rejects.toThrow();
  });

  it('un dato associato diverso (altra casella o altro identificativo) è rifiutato', async () => {
    const k = await deriveKeys(generateSecret());
    const vault = generateVaultId();
    const env = await sealEnvelope(k.encKey, vault, 'oid-1', payload);
    await expect(openEnvelope(k.encKey, vault, 'oid-2', env)).rejects.toThrow();
    await expect(openEnvelope(k.encKey, generateVaultId(), 'oid-1', env)).rejects.toThrow();
    await expect(openEnvelope((await deriveKeys(generateSecret())).encKey, vault, 'oid-1', env)).rejects.toThrow();
  });
});

describe('codice di collegamento', () => {
  const vault = generateVaultId();
  const secret = generateSecret();

  it('QR: nsync1: + base64url di 48 byte (64 caratteri) e nome del dispositivo', () => {
    const code = composePairingCode(vault, secret, 'Telefono di prova #1');
    expect(code.startsWith('nsync1:')).toBe(true);
    expect(code.slice(7, 71)).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const back = parsePairingCode(code);
    expect(Array.from(back.vaultId)).toEqual(Array.from(vault));
    expect(Array.from(back.secret)).toEqual(Array.from(secret));
    expect(back.deviceName).toBe('Telefono di prova #1');
    expect(parsePairingCode(composePairingCode(vault, secret)).deviceName).toBe('');
  });

  it('a mano: base32 Crockford a gruppi di 5, senza distinzione di maiuscole, con spazi e trattini', () => {
    const manual = composeManualCode(vault, secret);
    const groups = manual.split(' ');
    expect(groups.slice(0, -1).every((g) => g.length === 5)).toBe(true);
    expect(manual).toMatch(/^[0-9A-HJKMNP-TV-Z ]+$/);
    for (const variant of [manual, manual.toLowerCase(), manual.replace(/ /g, '-'), `  ${manual.replace(/ /g, '')}  `]) {
      const back = parsePairingCode(variant);
      expect(Array.from(back.vaultId)).toEqual(Array.from(vault));
      expect(Array.from(back.secret)).toEqual(Array.from(secret));
    }
  });

  it('a mano: O, I e L si leggono come 0 e 1', () => {
    const manual = composeManualCode(vault, secret);
    const confused = manual.replace(/0/g, 'o').replace(/1/g, (_, i: number) => (i % 2 ? 'l' : 'I'));
    expect(Array.from(parsePairingCode(confused).secret)).toEqual(Array.from(secret));
  });

  it('rifiuta codici troncati, con errori di battitura o non riconosciuti', () => {
    const manual = composeManualCode(vault, secret);
    expect(() => parsePairingCode(manual.slice(0, -6))).toThrow();
    const chars = manual.replace(/ /g, '');
    const i = 10;
    const swapped = chars.slice(0, i) + (chars[i] === '2' ? '3' : '2') + chars.slice(i + 1);
    expect(() => parsePairingCode(swapped)).toThrow(/battitura/);
    expect(() => parsePairingCode('nsync1:abc')).toThrow();
    expect(() => parsePairingCode('altro:xyz')).toThrow();
    expect(() => parsePairingCode('')).toThrow();
    expect(() => parsePairingCode(`${chars}U`)).toThrow();
  });
});
