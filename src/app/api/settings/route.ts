import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  // Never leak the raw OpenRouter key to the browser.
  const { openrouterKey, ...safe } = s;
  return NextResponse.json({
    settings: safe,
    hasKey: Boolean(openrouterKey),
    hasLLM: Boolean(
      (openrouterKey && s.openrouterModel) ||
        s.ollamaModel ||
        process.env.OPENAI_API_KEY ||
        process.env.ANTHROPIC_API_KEY,
    ),
  });
}

export async function PUT(req: Request) {
  await getSettings();
  const body = (await req.json()) as Record<string, unknown>;
  const clampPct = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(200, Math.max(30, Math.round(n))) : d;
  };
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

  const [updated] = await db
    .update(settings)
    .set({
      userName: str(body.userName, "Sir").slice(0, 60),
      agentName: str(body.agentName, "TALA").slice(0, 40),
      attitude: str(body.attitude, "butler"),
      customAttitude: str(body.customAttitude, "").slice(0, 2000),
      voiceGender: body.voiceGender === "female" ? "female" : "male",
      voiceEngine:
        body.voiceEngine === "piper" || body.voiceEngine === "kokoro" ? body.voiceEngine : "system",
      voiceId: str(body.voiceId, "").slice(0, 80),
      kokoroDtype: body.kokoroDtype === "fp32" ? "fp32" : "q8",
      voiceRate: clampPct(body.voiceRate, 100),
      voicePitch: clampPct(body.voicePitch, 100),
      voiceURI: str(body.voiceURI, "").slice(0, 200),
      speakReplies: Boolean(body.speakReplies),
      wakeWord: str(body.wakeWord, "tala").slice(0, 30),
      listenMode:
        body.listenMode === "wake" || body.listenMode === "tap" ? body.listenMode : "continuous",
      silenceTimeoutSec: (() => {
        const n = Number(body.silenceTimeoutSec);
        // 0 means "never auto-close".
        if (n === 0) return 0;
        return Number.isFinite(n) ? Math.min(600, Math.max(10, Math.round(n))) : 45;
      })(),
      openrouterModel: str(body.openrouterModel, "").slice(0, 120),
      llmBackend:
        body.llmBackend === "ollama" || body.llmBackend === "openrouter"
          ? body.llmBackend
          : "auto",
      ollamaUrl: (() => {
        const value = str(body.ollamaUrl, "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
        return /^https?:\/\//i.test(value) ? value.slice(0, 300) : "http://127.0.0.1:11434";
      })(),
      ollamaModel: str(body.ollamaModel, "").trim().slice(0, 160),
      llmMode:
        body.llmMode === "always" || body.llmMode === "off" ? body.llmMode : "auto",
      timezone: str(body.timezone, "local").slice(0, 60),
      units: body.units === "imperial" ? "imperial" : "metric",
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1))
    .returning();

  const { openrouterKey, ...safe } = updated;
  return NextResponse.json({ settings: safe, hasKey: Boolean(openrouterKey) });
}
