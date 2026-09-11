import { db } from '@/db';
import { settings, knowledge, messages, tasks } from '@/db/schema';
import { eq, desc, asc } from 'drizzle-orm';

const SEED: Record<string, unknown> = {
  userName: 'Sir',
  agentName: 'TALA',
  attitude: 'butler',
  customAttitude: '',
  voiceGender: 'female',
  voiceEngine: 'system',
  voiceId: '',
  kokoroDtype: 'q8',
  voiceRate: 100,
  voicePitch: 100,
  voiceURI: '',
  speakReplies: true,
  wakeWord: 'tala',
  listenMode: 'continuous',
  silenceTimeoutSec: 45,
  timezone: 'local',
  units: 'metric',
  openrouterKey: '',
  openrouterModel: '',
};

export async function getSettings() {
  try {
    const rows = await db.select().from(settings).where(eq(settings.id, 1));
    if (rows.length) return rows[0];
    const [created] = await db
      .insert(settings)
      .values(SEED as Partial<typeof settings.$inferInsert>)
      .returning();
    return created;
  } catch {
    // No DB configured — return defaults
    return { ...SEED, id: 1, createdAt: new Date().toISOString() } as any;
  }
}

export async function getKnowledge() {
  try {
    return await db.select().from(knowledge).orderBy(desc(knowledge.createdAt));
  } catch {
    return [];
  }
}

export async function getTasks() {
  try {
    return await db.select().from(tasks).orderBy(asc(tasks.done), desc(tasks.createdAt));
  } catch {
    return [];
  }
}

export async function getMessages(limit = 60) {
  try {
    const rows = await db
      .select()
      .from(messages)
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return rows.reverse();
  } catch {
    return [];
  }
}
