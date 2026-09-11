import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  '';

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!connectionString) {
    throw new Error(
      'No database connection string. Set DATABASE_URL, POSTGRES_URL, or POSTGRES_URL_NON_POOLING.'
    );
  }
  if (!dbInstance) {
    pool = new Pool({ connectionString });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return getDb()[prop as keyof typeof dbInstance];
  },
});
