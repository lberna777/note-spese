import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const BASE = "https://sync.test";
const ORIGIN = "https://lberna777.github.io";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function rand(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// Ogni test usa una casella nuova: l'archivio D1 non si azzera tra un test e l'altro.
function newBox() {
  return { vault: b64url(rand(16)), token: b64url(rand(32)) };
}
const oid = () => b64url(rand(32));
const bodyOf = (text: string) => b64(new TextEncoder().encode(text));
const decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

function call(method: string, path: string, opts: { token?: string; json?: unknown; raw?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.origin) headers.Origin = opts.origin;
  let body: string | undefined;
  if (opts.raw !== undefined) body = opts.raw;
  else if (opts.json !== undefined) body = JSON.stringify(opts.json);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return exports.default.fetch(new Request(BASE + path, { method, headers, body }));
}
const push = (box: { vault: string; token: string }, items: { oid: string; body: string }[], token = box.token) =>
  call("POST", `/v1/vaults/${box.vault}/push`, { token, json: { items } });
const pull = (box: { vault: string; token: string }, qs = "", token = box.token) =>
  call("GET", `/v1/vaults/${box.vault}/pull${qs}`, { token });

describe("autenticazione e creazione della casella", () => {
  it("la prima push crea la casella salvando solo lo SHA-256 del token", async () => {
    const box = newBox();
    const res = await push(box, [{ oid: oid(), body: bodyOf("a") }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ seq: 1 });

    const row = await env.DB.prepare("SELECT auth_hash FROM vaults WHERE vault = ?")
      .bind(box.vault)
      .first<{ auth_hash: number[] | ArrayBuffer }>();
    const stored = new Uint8Array(row!.auth_hash as ArrayBuffer | number[]);
    const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(atob(box.token.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) => c.charCodeAt(0))));
    expect(Array.from(stored)).toEqual(Array.from(expected));
  });

  it("token sbagliato: 403; token mancante: 401", async () => {
    const box = newBox();
    await push(box, [{ oid: oid(), body: bodyOf("a") }]);
    const wrong = await push(box, [{ oid: oid(), body: bodyOf("b") }], b64url(rand(32)));
    expect(wrong.status).toBe(403);
    expect(((await wrong.json()) as { error: string }).error).toBeTruthy();
    expect((await pull(box, "", b64url(rand(32)))).status).toBe(403);

    const missing = await call("POST", `/v1/vaults/${box.vault}/push`, { json: { items: [] } });
    expect(missing.status).toBe(401);
    expect((await call("GET", `/v1/vaults/${box.vault}/pull`)).status).toBe(401);
    expect((await call("DELETE", `/v1/vaults/${box.vault}`)).status).toBe(401);
  });

  it("pull e DELETE su casella inesistente: 404", async () => {
    const box = newBox();
    expect((await pull(box)).status).toBe(404);
    expect((await call("DELETE", `/v1/vaults/${box.vault}`, { token: box.token })).status).toBe(404);
  });
});

describe("pull", () => {
  it("restituisce in ordine, con paginazione e next", async () => {
    const box = newBox();
    const oids = [oid(), oid(), oid(), oid(), oid()];
    const res = await push(box, oids.map((o, i) => ({ oid: o, body: bodyOf(`busta-${i}`) })));
    expect(await res.json()).toEqual({ seq: 5 });

    const p1 = (await (await pull(box, "?since=0&limit=2")).json()) as { items: { oid: string; seq: number; body: string }[]; next: number | null };
    expect(p1.items.map((i) => i.oid)).toEqual(oids.slice(0, 2));
    expect(p1.items.map((i) => i.seq)).toEqual([1, 2]);
    expect(decode(p1.items[1].body)).toBe("busta-1");
    expect(p1.next).toBe(2);

    const p2 = (await (await pull(box, `?since=${p1.next}&limit=2`)).json()) as typeof p1;
    expect(p2.items.map((i) => i.seq)).toEqual([3, 4]);
    expect(p2.next).toBe(4);

    const p3 = (await (await pull(box, `?since=${p2.next}&limit=2`)).json()) as typeof p1;
    expect(p3.items.map((i) => i.seq)).toEqual([5]);
    expect(p3.next).toBeNull();

    const empty = (await (await pull(box, "?since=5")).json()) as typeof p1;
    expect(empty).toEqual({ items: [], next: null });
  });

  it("limit predefinito 100, massimo 200; parametri non validi: 400", async () => {
    const box = newBox();
    for (let k = 0; k < 5; k++) {
      await push(box, Array.from({ length: 50 }, () => ({ oid: oid(), body: bodyOf("x") })));
    }
    const def = (await (await pull(box)).json()) as { items: unknown[]; next: number | null };
    expect(def.items).toHaveLength(100);
    expect(def.next).toBe(100);
    const big = (await (await pull(box, "?limit=1000")).json()) as { items: unknown[]; next: number | null };
    expect(big.items).toHaveLength(200);
    expect(big.next).toBe(200);
    expect((await pull(box, "?since=abc")).status).toBe(400);
    expect((await pull(box, "?limit=-1")).status).toBe(400);
  });

  it("sostituire un oid dà un seq nuovo e lascia una sola riga", async () => {
    const box = newBox();
    const o = oid();
    await push(box, [{ oid: o, body: bodyOf("v1") }, { oid: oid(), body: bodyOf("altra") }]);
    const res = await push(box, [{ oid: o, body: bodyOf("v2") }]);
    expect(await res.json()).toEqual({ seq: 3 });

    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM envelopes WHERE vault = ? AND oid = ?").bind(box.vault, o).first<{ n: number }>();
    expect(rows!.n).toBe(1);
    const all = (await (await pull(box)).json()) as { items: { oid: string; seq: number; body: string }[] };
    expect(all.items).toHaveLength(2);
    const mine = all.items.find((i) => i.oid === o)!;
    expect(mine.seq).toBe(3);
    expect(decode(mine.body)).toBe("v2");
  });
});

describe("limiti", () => {
  it("più di 50 elementi: 413", async () => {
    const box = newBox();
    const res = await push(box, Array.from({ length: 51 }, () => ({ oid: oid(), body: bodyOf("x") })));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/many items/i);
  });

  it("busta oltre 1,6 MB: 413; busta vicina al limite: accettata", async () => {
    const box = newBox();
    const tooBig = await push(box, [{ oid: oid(), body: b64(new Uint8Array(1.6 * 1024 * 1024 + 1)) }]);
    expect(tooBig.status).toBe(413);
    const ok = await push(box, [{ oid: oid(), body: b64(new Uint8Array(1.5 * 1024 * 1024)) }]);
    expect(ok.status).toBe(200);
  });

  it("oltre 4 MB totali: 413", async () => {
    const box = newBox();
    const big = () => ({ oid: oid(), body: b64(new Uint8Array(1.5 * 1024 * 1024)) });
    const res = await push(box, [big(), big(), big()]);
    expect(res.status).toBe(413);
  });

  it("casella oltre 500 MB: 429", async () => {
    const box = newBox();
    await push(box, [{ oid: oid(), body: bodyOf("a") }]);
    await env.DB.prepare("INSERT INTO envelopes (vault, oid, seq, body, size) VALUES (?, ?, 99, x'00', ?)")
      .bind(box.vault, oid(), 500 * 1024 * 1024)
      .run();
    const res = await push(box, [{ oid: oid(), body: bodyOf("b") }]);
    expect(res.status).toBe(429);
  });

  it("corpo non valido: 400", async () => {
    const box = newBox();
    expect((await call("POST", `/v1/vaults/${box.vault}/push`, { token: box.token, raw: "{non json" })).status).toBe(400);
    expect((await call("POST", `/v1/vaults/${box.vault}/push`, { token: box.token, json: { items: "no" } })).status).toBe(400);
    expect((await push(box, [{ oid: oid(), body: "***" }])).status).toBe(400);
  });
});

describe("DELETE", () => {
  it("elimina casella e buste, risposta 204", async () => {
    const box = newBox();
    await push(box, [{ oid: oid(), body: bodyOf("a") }, { oid: oid(), body: bodyOf("b") }]);
    const res = await call("DELETE", `/v1/vaults/${box.vault}`, { token: box.token });
    expect(res.status).toBe(204);
    const v = await env.DB.prepare("SELECT COUNT(*) AS n FROM vaults WHERE vault = ?").bind(box.vault).first<{ n: number }>();
    const e = await env.DB.prepare("SELECT COUNT(*) AS n FROM envelopes WHERE vault = ?").bind(box.vault).first<{ n: number }>();
    expect([v!.n, e!.n]).toEqual([0, 0]);
    expect((await pull(box)).status).toBe(404);
  });

  it("con token sbagliato non elimina nulla", async () => {
    const box = newBox();
    await push(box, [{ oid: oid(), body: bodyOf("a") }]);
    expect((await call("DELETE", `/v1/vaults/${box.vault}`, { token: b64url(rand(32)) })).status).toBe(403);
    expect((await pull(box)).status).toBe(200);
  });
});

describe("CORS", () => {
  it("preflight con origine consentita", async () => {
    const res = await call("OPTIONS", "/v1/vaults/x/push", { origin: ORIGIN });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
  });

  it("localhost in sviluppo è consentito, anche con porta", async () => {
    const res = await call("OPTIONS", "/v1/vaults/x/push", { origin: "http://localhost:5173" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("origine non consentita: rifiutata, senza intestazioni CORS", async () => {
    for (const origin of ["https://example.com", "https://lberna777.github.io.evil.test", "http://localhost.evil.test"]) {
      const pre = await call("OPTIONS", "/v1/vaults/x/push", { origin });
      expect(pre.status).toBe(403);
      expect(pre.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const box = newBox();
      const res = await call("POST", `/v1/vaults/${box.vault}/push`, { origin, token: box.token, json: { items: [] } });
      expect(res.status).toBe(403);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("le risposte normali portano l'origine consentita", async () => {
    const box = newBox();
    const res = await call("POST", `/v1/vaults/${box.vault}/push`, { origin: ORIGIN, token: box.token, json: { items: [] } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});

describe("identificativi non validi", () => {
  it("vault non valido: 400", async () => {
    const token = b64url(rand(32));
    for (const v of ["corto", "a".repeat(23), "!".repeat(22), b64url(rand(32))]) {
      const res = await call("GET", `/v1/vaults/${v}/pull`, { token });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBeTruthy();
    }
  });

  it("oid non valido: 400", async () => {
    const box = newBox();
    for (const bad of ["corto", "a".repeat(44), "+".repeat(43)]) {
      expect((await push(box, [{ oid: bad, body: bodyOf("x") }])).status).toBe(400);
    }
  });

  it("route sconosciuta: 404", async () => {
    expect((await call("GET", "/altro")).status).toBe(404);
  });
});
