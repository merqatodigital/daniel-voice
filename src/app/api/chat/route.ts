import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, tasks, knowledge } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessages, getKnowledge, getTasks } from "@/lib/store";
import { hermesConfigured, streamHermes, type HermesHistoryMessage, type KnowledgeEntry, type TaskEntry } from "@/lib/hermes";

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

async function hermesResponse(
  input: string,
  history: Awaited<ReturnType<typeof getMessages>>,
  kb: Awaited<ReturnType<typeof getKnowledge>>,
  taskRows: Awaited<ReturnType<typeof getTasks>>,
) {
  const source = await streamHermes(
    input,
    toHermesHistory(history),
    kb as KnowledgeEntry[],
    taskRows as TaskEntry[],
  );
  const reader = source.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (!text) continue;
          full += text;
          controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Hermes stream failed";
        if (!full) controller.enqueue(encoder.encode(`Hermes connection failed: ${msg}`));
      } finally {
        const reply = full.trim();
        if (reply) {
          try {
            await persistExchange(input, reply, "hermes");
          } catch {
            // A DB failure must not break the response stream.
          }
        }
        reader.releaseLock();
        controller.close();
      }
    },
  });
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

  if (hermesConfigured()) {
    try {
      const stream = await hermesResponse(input, history, kb, taskRows);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Engine": "hermes",
          "X-Provider": "hermes-agent",
          "X-Used-Knowledge": encodeURIComponent("[]"),
        },
      });
    } catch (err) {
      console.error("Hermes unavailable:", err);
      return NextResponse.json(
        { reply: "Hermes backend is not reachable. Is TALA Hermes running on port 8650?", engine: "error" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { reply: "Hermes is not configured. Check your TALA Hermes profile.", engine: "error" },
    { status: 503 }
  );
}
