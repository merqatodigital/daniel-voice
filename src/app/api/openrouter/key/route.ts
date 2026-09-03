import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettings } from "@/lib/store";
import { maskKey, verifyKey } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

/** GET — masked key + live credit status. Never returns the raw key. */
export async function GET() {
  const s = await getSettings();
  const key = s.openrouterKey;
  if (!key) {
    return NextResponse.json({ configured: false, masked: "", status: null });
  }
  const status = await verifyKey(key);
  return NextResponse.json({ configured: true, masked: maskKey(key), status });
}

/** PUT — save (and validate) a new key. */
export async function PUT(req: Request) {
  await getSettings();
  const body = (await req.json()) as { apiKey?: string };
  const apiKey = (body.apiKey ?? "").trim();

  if (!apiKey) {
    return NextResponse.json({ error: "API key is required" }, { status: 400 });
  }

  const status = await verifyKey(apiKey);
  if (!status.ok) {
    return NextResponse.json(
      { error: status.error ?? "That key was rejected by OpenRouter." },
      { status: 400 },
    );
  }

  await db
    .update(settings)
    .set({ openrouterKey: apiKey, updatedAt: new Date() })
    .where(eq(settings.id, 1));

  return NextResponse.json({ configured: true, masked: maskKey(apiKey), status });
}

/** DELETE — remove the stored key. */
export async function DELETE() {
  await getSettings();
  await db
    .update(settings)
    .set({ openrouterKey: "", updatedAt: new Date() })
    .where(eq(settings.id, 1));
  return NextResponse.json({ configured: false, masked: "", status: null });
}
