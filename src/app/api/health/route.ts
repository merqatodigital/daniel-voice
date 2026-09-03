import { db } from "@/db";
import { models, settings } from "@/db/schema";
import { count, eq, max, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const OR = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 5000;
const FRESH_MS = 24 * 60 * 60 * 1000;

/** fetch() that gives up after `ms` and never throws. */
async function tryFetch(url: string, init: RequestInit = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function checkDb(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function readSettings() {
  try {
    const [row] = await db
      .select({
        key: settings.openrouterKey,
        model: settings.openrouterModel,
        llmMode: settings.llmMode,
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel,
      })
      .from(settings)
      .where(eq(settings.id, 1));
    return row ?? null;
  } catch {
    return null;
  }
}

async function checkOllama(url: string): Promise<{ available: boolean; modelCount: number }> {
  try {
    const res = await tryFetch(`${url.replace(/\/+$/, "")}/api/tags`);
    if (!res || !res.ok) return { available: false, modelCount: 0 };
    const json = (await res.json()) as { models?: unknown[] };
    return { available: true, modelCount: (json.models ?? []).length };
  } catch {
    return { available: false, modelCount: 0 };
  }
}

async function checkCatalogue(): Promise<{ fresh: boolean; count: number }> {
  try {
    const [row] = await db
      .select({ n: count(), latest: max(models.fetchedAt) })
      .from(models);
    const n = Number(row?.n ?? 0);
    const latest = row?.latest ? new Date(row.latest).getTime() : 0;
    return { fresh: n > 0 && Date.now() - latest < FRESH_MS, count: n };
  } catch {
    return { fresh: false, count: 0 };
  }
}

async function checkOpenRouterUp(): Promise<boolean> {
  const res = await tryFetch(`${OR}/models`, { method: "HEAD" });
  if (res?.ok) return true;
  // Some edges reject HEAD; fall back to a GET we discard.
  const get = await tryFetch(`${OR}/models`);
  return Boolean(get?.ok);
}

/** True when the key authenticates and has usable balance. Never leaks amounts. */
async function checkBalance(key: string): Promise<boolean> {
  const res = await tryFetch(`${OR}/key`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res || !res.ok) return false;
  try {
    const json = (await res.json()) as {
      data?: {
        limit?: number | null;
        usage?: number;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
      };
    };
    const d = json.data;
    if (!d) return false;
    // Unlimited key → usable. Otherwise require remaining credit > 0.
    if (d.limit_remaining !== undefined && d.limit_remaining !== null) return d.limit_remaining > 0;
    if (d.limit === null || d.limit === undefined) return true;
    return d.limit - (d.usage ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  const started = Date.now();
  const dbOk = await checkDb();

  // Everything below is best-effort and runs in parallel; nothing here can
  // throw, and the slow network probes are capped at TIMEOUT_MS.
  const [cfg, catalogue, orUp] = await Promise.all([
    dbOk ? readSettings() : Promise.resolve(null),
    dbOk ? checkCatalogue() : Promise.resolve({ fresh: false, count: 0 }),
    checkOpenRouterUp(),
  ]);

  const key = cfg?.key ?? "";
  const keySet = key.length > 0;
  const balanceOK = keySet ? await checkBalance(key) : false;
  const ollamaModel = cfg?.ollamaModel ?? "";
  const ollama = ollamaModel
    ? await checkOllama(cfg?.ollamaUrl || "http://localhost:11434")
    : { available: false, modelCount: 0 };

  const llmMode = (cfg?.llmMode ?? "auto") as "auto" | "always" | "off";
  const selectedModel = cfg?.model ? cfg.model : null;

  const envLlm = Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  const hasLLM = (keySet && balanceOK && Boolean(selectedModel)) || envLlm || (Boolean(ollamaModel) && ollama.available);

  return Response.json(
    {
      ok: dbOk,
      db: dbOk,
      openrouter: { available: orUp, keySet, balanceOK },
      modelCatalogue: catalogue,
      selectedModel,
      llmMode,
      // Browser-only capabilities can't be observed from the server. The
      // client merges real values via probeClientTts(); these are the
      // server's best knowledge (system TTS exists on every modern phone).
      tts: { system: true, piper: false, kokoro: false },
      hasLLM,
      // Convenience flags so the landing page can pick a banner directly.
      ollama: { available: ollama.available, modelCount: ollama.modelCount, selectedModel: ollamaModel || null },
      hints: {
        showConnectKey: !keySet && !envLlm && !ollamaModel && llmMode !== "off",
        showAddCredit: keySet && !balanceOK && !ollamaModel,
        showPickModel: keySet && balanceOK && !selectedModel && !ollamaModel && llmMode !== "off",
        aiUnavailable: llmMode === "always" && !hasLLM,
      },
      latencyMs: Date.now() - started,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
