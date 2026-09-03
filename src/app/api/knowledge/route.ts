import { NextResponse } from "next/server";
import { db } from "@/db";
import { knowledge } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getKnowledge } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ knowledge: await getKnowledge() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    title?: string;
    content?: string;
    tags?: string;
    bulk?: string;
  };

  if (body.bulk && body.bulk.trim()) {
    // Split a pasted document into chunks by markdown-ish headings or blank lines.
    const blocks = body.bulk
      .split(/\n(?=#{1,3}\s)|\n\s*\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 10);
    const rows = blocks.slice(0, 100).map((b) => {
      const firstLine = b.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80);
      return {
        title: firstLine || "Imported note",
        content: b,
        tags: body.tags?.trim() ?? "",
        source: "import",
      };
    });
    if (!rows.length) return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
    const inserted = await db.insert(knowledge).values(rows).returning();
    return NextResponse.json({ knowledge: inserted });
  }

  const title = (body.title ?? "").trim();
  const content = (body.content ?? "").trim();
  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(knowledge)
    .values({ title: title.slice(0, 160), content, tags: (body.tags ?? "").slice(0, 200) })
    .returning();
  return NextResponse.json({ entry: row });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await db.delete(knowledge).where(eq(knowledge.id, id));
  return NextResponse.json({ ok: true });
}
