import { NextResponse } from 'next/server';
import { db, dbReady } from '@/db';
import { settings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSettings } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await getSettings();
    return NextResponse.json({
      settings: s,
      hasKey: s.openrouterKey ? true : false,
      hasLLM: false,
    });
  } catch {
    return NextResponse.json({
      settings: null,
      hasKey: false,
      hasLLM: false,
    });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
    const clampPct = (v: unknown, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(200, Math.max(30, Math.round(n))) : d;
    };

    const patch = {
      userName: str(body.userName, 'Sir').slice(0, 60),
      agentName: str(body.agentName, 'TALA').slice(0, 40),
      attitude: str(body.attitude, 'butler'),
      customAttitude: str(body.customAttitude, '').slice(0, 2000),
      voiceGender: body.voiceGender === 'female' || body.voiceGender === 'male' ? body.voiceGender : 'female',
      voiceEngine: body.voiceEngine === 'piper' || body.voiceEngine === 'kokoro' ? body.voiceEngine : 'system',
      voiceId: str(body.voiceId, '').slice(0, 80),
      kokoroDtype: body.kokoroDtype === 'fp32' ? 'fp32' : 'q8',
      voiceRate: clampPct(body.voiceRate, 100),
      voicePitch: clampPct(body.voicePitch, 100),
      voiceURI: str(body.voiceURI, '').slice(0, 200),
      speakReplies: Boolean(body.speakReplies),
      wakeWord: str(body.wakeWord, 'tala').slice(0, 30),
      listenMode: body.listenMode === 'wake' || body.listenMode === 'tap' ? body.listenMode : 'continuous',
      silenceTimeoutSec: (() => {
        const n = Number(body.silenceTimeoutSec);
        if (n === 0) return 0;
        return Number.isFinite(n) ? Math.min(600, Math.max(10, Math.round(n))) : 45;
      })(),
      timezone: str(body.timezone, 'local').slice(0, 60),
      units: body.units === 'imperial' ? 'imperial' : 'metric',
      openrouterKey: typeof body.openrouterKey === 'string' && body.openrouterKey ? body.openrouterKey.slice(0, 200) : '',
      openrouterModel: typeof body.openrouterModel === 'string' && body.openrouterModel ? body.openrouterModel.slice(0, 100) : '',
    };

    // If no DB configured, return the values for client-side persistence
    if (!dbReady()) {
      return NextResponse.json({
        settings: { ...patch, id: 1 },
        hasKey: !!patch.openrouterModel,
        noDb: true,
      });
    }

    await getSettings(); // ensure row exists
    const [updated] = await db
      .update(settings)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, 1))
      .returning();

    return NextResponse.json({ settings: updated, hasKey: updated.openrouterKey ? true : false });
  } catch (err) {
    console.error('Settings save failed:', err);
    return NextResponse.json(
      { error: 'Failed to save settings. Is the database reachable?' },
      { status: 500 },
    );
  }
}
