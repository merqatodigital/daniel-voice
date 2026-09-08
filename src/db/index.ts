import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as url from "url";

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error("DATABASE_URL is required");
}

// Supabase connection strings include sslmode=require and often require
// rejectUnauthorized=0 on Node. Parse and force SSL for any postgres:// url.
const parsed = url.parse(rawUrl);
const ssl = parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: rawUrl,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
