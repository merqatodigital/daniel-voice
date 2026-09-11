import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

/**
 * Supabase (and most hosted Postgres) reject plaintext connections. The
 * migration tool enables SSL explicitly in drizzle.config.ts; the runtime
 * pool needs the same treatment. Respect an explicit `sslmode` already in
 * the URL, but otherwise enable SSL for any remote host so `DATABASE_URL`
 * works out of the box. Local postgres keeps running without SSL.
 */
function poolOptions(url: string): PoolConfig {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  const local =
    host === '' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0.0.0.0';
  const sslAlreadySet = /[?&]sslmode=/i.test(url);
  return sslAlreadySet || local
    ? { connectionString: url }
    : { connectionString: url, ssl: { rejectUnauthorized: false } };
}

export function dbReady(): boolean {
  return !!connectionString;
}

function getDb(): ReturnType<typeof drizzle> {
  if (!connectionString) {
    return null as any;
  }
  if (!dbInstance) {
    pool = new Pool(poolOptions(connectionString));
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    const instance = getDb();
    if (!instance) {
      throw new Error('Database not configured. Set DATABASE_URL or POSTGRES_URL.');
    }
    return (instance as any)[prop];
  },
});
