import { db } from '@/db';
import { settings } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function checkDb(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let keySet = false;
  let modelSet = false;

  try {
    dbOk = await checkDb();
    if (dbOk) {
      const [s] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
      keySet = !!s?.openrouterKey;
      modelSet = !!s?.openrouterModel;
    }
  } catch {}

  return Response.json(
    {
      ok: dbOk && keySet && modelSet,
      db: dbOk,
      openrouter: { available: keySet, keySet, balanceOK: keySet && modelSet },
      tts: { system: true },
      hasLLM: keySet && modelSet,
      hints: {
        showConnectKey: !keySet,
        showAddCredit: false,
        showPickModel: keySet && !modelSet,
        aiAvailable: keySet && modelSet,
      },
      latencyMs: Date.now() - started,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
