import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.warn("DATABASE_URL not set — DB queries will fail at runtime");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: rawUrl,
    ssl: {
      rejectUnauthorized: false,
      servername: "db.bsuscgghuxolprxqvsro.supabase.co",
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
