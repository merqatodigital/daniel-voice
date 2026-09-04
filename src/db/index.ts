import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Managed Postgres (Neon, Vercel Postgres, Supabase) is TLS-only and its pooled
 * URL doesn't always carry sslmode. Trust the CA bundle, not `rejectUnauthorized:
 * false` — connection strings here are secrets, not user input.
 */
function sslFor(url: string) {
  const force = /^(1|true|yes)$/i.test(process.env.DATABASE_SSL ?? "");
  if (force) return { rejectUnauthorized: true } as const;
  if (/[?&]sslmode=(require|no-verify-full|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: url.includes("sslmode=require") ? false : true } as const;
  }
  return undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({ connectionString: databaseUrl, ssl: sslFor(databaseUrl), max: 3 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
