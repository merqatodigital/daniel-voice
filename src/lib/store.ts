import { db } from "@/db";
import { settings, knowledge, messages, tasks } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

export async function getSettings() {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  if (rows.length) return rows[0];
  const [created] = await db.insert(settings).values({ id: 1 }).returning();
  return created;
}

export async function getKnowledge() {
  return db.select().from(knowledge).orderBy(desc(knowledge.createdAt));
}

export async function getTasks() {
  return db.select().from(tasks).orderBy(asc(tasks.done), desc(tasks.createdAt));
}

export async function getMessages(limit = 60) {
  const rows = await db
    .select()
    .from(messages)
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}
