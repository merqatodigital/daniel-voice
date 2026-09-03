import { db } from "@/db";
import { models } from "@/db/schema";

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type RawModel = {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  context_length?: number;
  architecture?: { input_modalities?: string[]; modality?: string };
  pricing?: { prompt?: string; completion?: string };
};

export type CatalogModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  promptPrice: string;
  completionPrice: string;
  isFree: boolean;
  provider: string;
  modalities: string;
  createdAt: number;
};

const num = (v: string | undefined) => {
  const n = Number(v ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function normaliseModel(m: RawModel): CatalogModel | null {
  if (!m?.id) return null;
  const prompt = m.pricing?.prompt ?? "0";
  const completion = m.pricing?.completion ?? "0";
  // "-1" is the Auto Router's variable pricing — treat as paid.
  const isFree = num(prompt) === 0 && num(completion) === 0 && num(prompt) >= 0;
  return {
    id: m.id,
    name: m.name ?? m.id,
    description: (m.description ?? "").slice(0, 600),
    contextLength: Math.round(m.context_length ?? 0),
    promptPrice: prompt,
    completionPrice: completion,
    isFree,
    provider: m.id.split("/")[0] ?? "",
    modalities: (m.architecture?.input_modalities ?? ["text"]).join(","),
    createdAt: Math.round(m.created ?? 0),
  };
}

/** Fetch the live catalogue from OpenRouter and replace the cached copy. */
export async function refreshModels(apiKey?: string): Promise<{
  count: number;
  free: number;
  paid: number;
}> {
  const headers: Record<string, string> = { Accept: "application/json" };
  // The models endpoint is public, but sending the key surfaces per-key access.
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenRouter returned ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data?: RawModel[] };
  const rows = (json.data ?? [])
    .map(normaliseModel)
    .filter((m): m is CatalogModel => m !== null);

  if (!rows.length) throw new Error("OpenRouter returned an empty model list");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(models);
    // Chunk the insert — the catalogue is several hundred rows.
    for (let i = 0; i < rows.length; i += 200) {
      await tx
        .insert(models)
        .values(rows.slice(i, i + 200).map((r) => ({ ...r, fetchedAt: now })));
    }
  });

  return {
    count: rows.length,
    free: rows.filter((r) => r.isFree).length,
    paid: rows.filter((r) => !r.isFree).length,
  };
}

export function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 12) return "••••";
  return `${key.slice(0, 8)}••••${key.slice(-4)}`;
}

/** Verify a key by hitting the authenticated /key endpoint. */
export async function verifyKey(apiKey: string): Promise<{
  ok: boolean;
  label?: string;
  limit?: number | null;
  usage?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (res.status === 401) return { ok: false, error: "Key rejected by OpenRouter (401)." };
    if (!res.ok) return { ok: false, error: `OpenRouter returned ${res.status}.` };
    const json = (await res.json()) as {
      data?: { label?: string; limit?: number | null; usage?: number };
    };
    return {
      ok: true,
      label: json.data?.label,
      limit: json.data?.limit ?? null,
      usage: json.data?.usage ?? 0,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/** Price per million tokens, formatted for display. */
export function pricePerMillion(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return "variable";
  if (n === 0) return "free";
  const per = n * 1_000_000;
  if (per < 0.01) return `$${per.toFixed(4)}`;
  if (per < 1) return `$${per.toFixed(3)}`;
  return `$${per.toFixed(2)}`;
}
