"use client";

import { isKokoroLoaded, kokoroCachedFlag, piperStoredVoices } from "@/lib/tts/engine";

export type HealthReport = {
  ok: boolean;
  db: boolean;
  openrouter: { available: boolean; keySet: boolean; balanceOK: boolean };
  ollama: { available: boolean; modelCount: number; selectedModel: string | null };
  modelCatalogue: { fresh: boolean; count: number };
  selectedModel: string | null;
  llmMode: "auto" | "always" | "off";
  tts: { system: boolean; piper: boolean; kokoro: boolean };
  hasLLM: boolean;
  hints: {
    showConnectKey: boolean;
    showAddCredit: boolean;
    showPickModel: boolean;
    aiUnavailable: boolean;
  };
  latencyMs: number;
};

/**
 * The TTS engines live in the browser (Web Speech API, OPFS, in-memory model),
 * so only the client can report them truthfully. Call this and merge over the
 * server payload.
 */
export async function probeClientTts(): Promise<HealthReport["tts"]> {
  const system = typeof window !== "undefined" && "speechSynthesis" in window;
  let piper = false;
  try {
    piper = (await piperStoredVoices()).length > 0;
  } catch {
    piper = false;
  }
  const kokoro = isKokoroLoaded() || kokoroCachedFlag();
  return { system, piper, kokoro };
}

/** Full rollup: server status + real on-device TTS state. */
export async function fetchHealth(): Promise<HealthReport | null> {
  try {
    const [res, tts] = await Promise.all([
      fetch("/api/health", { cache: "no-store" }),
      probeClientTts(),
    ]);
    if (!res.ok) return null;
    const server = (await res.json()) as HealthReport;
    return { ...server, tts };
  } catch {
    return null;
  }
}
