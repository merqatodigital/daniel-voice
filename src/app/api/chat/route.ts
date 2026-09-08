import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, tasks, knowledge } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessages, getKnowledge, getTasks, getSettings } from "@/lib/store";
import { hermesConfigured, streamHermes, streamOpenRouter, type HermesHistoryMessage, type KnowledgeEntry, type TaskEntry } from "@/lib/hermes";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ messages: await getMessages() });
}

export async function DELETE() {
  await db.delete(messages);
  return NextResponse.json({ ok: true });
}

async function persistExchange(
  input: string,
  reply: string,
  engine: string,
) {
  await db.insert(messages).values([
    { role: "user", content: input },
    { role: "agent", content: reply, meta: { engine } },
  ]);
}

function toHermesHistory(
  history: Awaited<ReturnType<typeof getMessages>>,
): HermesHistoryMessage[] {
  return history
    .slice(-20)
    .map((m) => ({
      role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }))
    .filter((m) => m.content.trim().length > 0);
}

/** Buffer a Hermes stream into a string. Returns empty string on failure. */
async function hermesBuffer(
  input: string,
  history: Awaited<ReturnType<typeof getMessages>>,
  kb: Awaited<ReturnType<typeof getKnowledge>>,
  taskRows: Awaited<ReturnType<typeof getTasks>>,
): Promise<string> {
  const source = await streamHermes(
    input,
    toHermesHistory(history),
    kb as KnowledgeEntry[],
    taskRows as TaskEntry[],
  );
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let full = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
    }
  } catch (err) {
    console.error("Hermes buffer error:", err);
  } finally {
    reader.releaseLock();
  }
  return full.trim();
}

export async function POST(req: Request) {
  const body = (await req.json()) as { input?: string };
  const input = (body.input ?? "").trim();
  if (!input) return NextResponse.json({ error: "empty input" }, { status: 400 });

  const [history, kb, taskRows] = await Promise.all([
    getMessages(20),
    getKnowledge(),
    getTasks(),
  ]);

  const settings = await getSettings();
  let reply = "";
  let engine = "";
  let provider = "";

  // OpenRouter first (when key + model are configured)
  if (settings.openrouterKey && settings.openrouterModel) {
    try {
      const orStream = await streamOpenRouter(
        input,
        toHermesHistory(history),
        kb as KnowledgeEntry[],
        taskRows as TaskEntry[],
        settings.openrouterKey,
        settings.openrouterModel,
        settings,
      );
      const reader = orStream.getReader();
      const decoder = new TextDecoder();
      let orFull = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        orFull += decoder.decode(value, { stream: true });
      }
      reader.releaseLock();
      reply = orFull.trim();
      engine = "openrouter";
      provider = settings.openrouterModel;
    } catch (err) {
      console.error("OpenRouter failed:", err);
    }
  }

  // Hermes fallback
  if (!reply && hermesConfigured()) {
    try {
      reply = await hermesBuffer(input, history, kb, taskRows);
      if (reply) {
        engine = "hermes";
        provider = "hermes-agent";
      }
    } catch (err) {
      console.error("Hermes failed:", err);
    }
  }

  if (!reply) {
    return NextResponse.json(
      { reply: "No AI backend responded. Configure Hermes or add your OpenRouter key + model in Settings.", engine: "error" },
      { status: 503 }
    );
  }

  // Persist the exchange
  try {
    await persistExchange(input, reply, engine);
  } catch {}

  // Stream the buffered reply back to the client
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(reply));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Engine": engine,
      "X-Provider": provider,
    },
  });
}
