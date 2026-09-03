import { NextResponse } from "next/server";
import { db } from "@/db";
import { models } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getSettings } from "@/lib/store";
import { refreshModels } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

async function listModels() {
  const rows = await db.select().from(models).orderBy(desc(models.createdAt));
  return rows;
}

/** GET — return the cached catalogue (auto-refreshes if empty). */
export async function GET() {
  const s = await getSettings();
  let rows = await listModels();

  if (rows.length === 0) {
    try {
      await refreshModels(s.openrouterKey || undefined);
      rows = await listModels();
    } catch {
      // Leave the list empty; the UI offers a manual refresh.
    }
  }

  return NextResponse.json({
    models: rows,
    fetchedAt: rows[0]?.fetchedAt ?? null,
    counts: {
      total: rows.length,
      free: rows.filter((r) => r.isFree).length,
      paid: rows.filter((r) => !r.isFree).length,
    },
  });
}

/** POST — force a refresh from OpenRouter (models change daily). */
export async function POST() {
  const s = await getSettings();
  try {
    const stats = await refreshModels(s.openrouterKey || undefined);
    const rows = await listModels();
    return NextResponse.json({
      ok: true,
      models: rows,
      fetchedAt: rows[0]?.fetchedAt ?? null,
      counts: { total: stats.count, free: stats.free, paid: stats.paid },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 502 },
    );
  }
}
