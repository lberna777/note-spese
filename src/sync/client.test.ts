import { describe, expect, it } from 'vitest';
import { b64ToB64url, b64urlToB64, createHttpClient } from './client';

// Formato sul filo concordato con il server (worker/src/index.ts).
describe('client HTTP della sincronizzazione', () => {
  it('push manda { items } con le buste in base64 standard e il token nel Bearer', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ seq: 7 }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = createHttpClient('https://sync.example/', fetchFn);
    const r = await c.push('V'.repeat(22), 'T'.repeat(43), [{ oid: 'O'.repeat(43), body: 'ab-_cd' }]);
    expect(r.seq).toBe(7);
    expect(calls[0].url).toBe(`https://sync.example/v1/vaults/${'V'.repeat(22)}/push`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${'T'.repeat(43)}`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ items: [{ oid: 'O'.repeat(43), body: 'ab+/cd==' }] });
  });

  it('pull riporta le buste in base64url', async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ items: [{ oid: 'x', seq: 3, body: 'ab+/cd==' }], next: null }), { status: 200 })) as unknown as typeof fetch;
    const r = await createHttpClient('https://sync.example', fetchFn).pull('v', 't', 0);
    expect(r.items[0].body).toBe('ab-_cd');
    expect(r.next).toBeNull();
  });

  it('le due codifiche sono una l’inversa dell’altra', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'ab-_cd', 'AAAA-_-_']) expect(b64ToB64url(b64urlToB64(s))).toBe(s);
  });
});
