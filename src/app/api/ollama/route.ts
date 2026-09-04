import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FALLBACK = "http://127.0.0.1:11434";

function normaliseUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim().replace(/\/+$/, "") : FALLBACK;
  if (!/^https?:\/\//i.test(raw)) return FALLBACK;
  return raw.slice(0, 300);
}

/** Discover models installed in the user's Ollama daemon. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = normaliseUrl(body.url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { available: false, models: [], error: `Ollama returned ${res.status}.` },
        { status: 502 },
      );
    }
    const json = (await res.json()) as {
      models?: {
        name?: string;
        model?: string;
        size?: number;
        modified_at?: string;
        details?: { parameter_size?: string; quantization_level?: string; family?: string };
      }[];
    };
    const models = (json.models ?? [])
      .map((m) => ({
        name: m.name ?? m.model ?? "",
        size: m.size ?? 0,
        modifiedAt: m.modified_at ?? "",
        parameters: m.details?.parameter_size ?? "",
        quantization: m.details?.quantization_level ?? "",
        family: m.details?.family ?? "",
      }))
      .filter((m) => m.name);
    return NextResponse.json({ available: true, models });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        available: false,
        models: [],
        error: timeout ? "Ollama did not respond within 3 seconds." : "Could not reach Ollama.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
