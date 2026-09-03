import { NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tasks: await getTasks() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { title?: string };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const [row] = await db.insert(tasks).values({ title: title.slice(0, 200) }).returning();
  return NextResponse.json({ task: row });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { id?: number; done?: boolean };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const [row] = await db
    .update(tasks)
    .set({ done: Boolean(body.done) })
    .where(eq(tasks.id, body.id))
    .returning();
  return NextResponse.json({ task: row });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await db.delete(tasks).where(eq(tasks.id, id));
  return NextResponse.json({ ok: true });
}
