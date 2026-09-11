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

async function checkOpenRouter(
  apiKey: string | undefined,
  model: string | undefined,
): Promise<{ available: boolean; keySet: boolean; balanceOK: boolean; modelOk: boolean }> {
  if (!apiKey) return { available: false, keySet: false, balanceOK: false, modelOk: false };
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'google/gemma-3-27b-it:free',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });
    return {
      available: true,
      keySet: true,
      balanceOK: res.ok,
      modelOk: res.status !== 404,
    };
  } catch {
    return { available: false, keySet: true, balanceOK: false, modelOk: false };
  }
}

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let openrouter = { available: false, keySet: false, balanceOK: false, modelOk: false };

  try {
    dbOk = await checkDb();
    const [s] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (s?.openrouterKey) {
      openrouter = await checkOpenRouter(s.openrouterKey, s.openrouterModel);
    }
  } catch {
    // No DB — still check OpenRouter if possible
  }

  return Response.json(
    {
      ok: dbOk && (openrouter.balanceOK || !openrouter.keySet),
      db: dbOk,
      openrouter: {
        available: openrouter.available,
        keySet: openrouter.keySet,
        balanceOK: openrouter.balanceOK,
      },
      tts: { system: true, piper: false, kokoro: false },
      hasLLM: openrouter.balanceOK,
      hints: {
        showConnectKey: !openrouter.keySet,
        showAddCredit: openrouter.keySet && !openrouter.balanceOK,
        showPickModel: openrouter.balanceOK,
        aiAvailable: openrouter.balanceOK,
      },
      latencyMs: Date.now() - started,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
