import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Applica le migrazioni al D1 locale prima dei test.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
