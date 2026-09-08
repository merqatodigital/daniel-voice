import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
  const dbOk = await checkDb();

  return Response.json(
    {
      ok: dbOk,
      db: dbOk,
      openrouter: { available: false, keySet: false, balanceOK: false },
      ollama: { available: false, model: null },
      modelCatalogue: { fresh: false, count: 0 },
      selectedModel: null,
      llmMode: "auto",
      llmBackend: "hermes",
      tts: { system: true, piper: false, kokoro: false },
      hasLLM: false,
      hints: {
        showConnectKey: false,
        showAddCredit: false,
        showPickModel: false,
        aiUnavailable: false,
      },
      latencyMs: Date.now() - started,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
