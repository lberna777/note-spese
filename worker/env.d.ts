// Binding disponibili ai test (TEST_MIGRATIONS è aggiunto in vitest.config.ts).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ALLOWED_ORIGINS: string;
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers").D1Migration[];
  }
}

// Tipi di `exports.default` (il Worker principale) per i test.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/index");
  }
}
