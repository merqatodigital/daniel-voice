import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

export function dbReady(): boolean {
  return !!connectionString;
}

function getDb(): ReturnType<typeof drizzle> {
  if (!connectionString) {
    return null as any;
  }
  if (!dbInstance) {
    pool = new Pool({ connectionString });
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
