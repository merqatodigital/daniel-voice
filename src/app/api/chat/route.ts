import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, tasks, knowledge } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettings, getKnowledge, getTasks, getMessages } from "@/lib/store";
import { localBrain, type AgentContext, type AgentResult } from "@/lib/agent";
import { planLlmStream } from "@/lib/llmStream";
import { hermesConfigured, streamHermes, type HermesHistoryMessage } from "@/lib/hermes";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ messages: await getMessages() });
}

export async function DELETE() {
  await db.delete(messages);
  return NextResponse.json({ ok: true });
}

async function applyActions(result: AgentResult) {
  for (const action of result.actions) {
    if (action.type === "create_task") {
      await db.insert(tasks).values({ title: action.title.slice(0, 200) });
    } else if (action.type === "complete_task") {
      await db.update(tasks).set({ done: true }).where(eq(tasks.id, action.id));
    } else if (action.type === "create_knowledge") {
      await db.insert(knowledge).values({
        title: action.title.slice(0, 160),
        content: action.content,
        source: "conversation",
      });
    }
  }
}

async function persistExchange(
  input: string,
  reply: string,
  engine: string,
  usedKnowledge: { id: number; title: string }[],
) {
  await db.insert(messages).values([
    { role: "user", content: input },
    { role: "agent", content: reply, meta: { engine, usedKnowledge } },
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

async function hermesResponse(input: string, history: Awaited<ReturnType<typeof getMessages>>) {
  const source = await streamHermes(input, toHermesHistory(history));
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
            await persistExchange(input, reply, "hermes", []);
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

  const [settings, kb, taskRows, history] = await Promise.all([
    getSettings(),
    getKnowledge(),
    getTasks(),
    getMessages(20),
  ]);

  // Hermes is now TALA's primary agent runtime. The existing local/Ollama path
  // remains intact as a fallback until Hermes is configured and proven stable.
  if (hermesConfigured()) {
    try {
      const stream = await hermesResponse(input, history);
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
      console.error("Hermes unavailable; using legacy TALA fallback", err);
    }
  }

  const ctx: AgentContext = {
    settings,
    knowledge: kb,
    tasks: taskRows,
    history: history.map((m) => ({ role: m.role, content: m.content })),
  };

  const local = localBrain(input, ctx);
  const tookAction = local.actions.length > 0;
  const localWasWeak = !tookAction && local.usedKnowledge.length === 0;

  const mode = settings.llmMode;
  const wantsLlm = mode === "off" ? false : mode === "always" ? !tookAction : localWasWeak;
  const plan = wantsLlm ? await planLlmStream(input, ctx) : null;
  const strict = mode === "always";

  if (strict && wantsLlm && !plan) {
    const reply =
      "Reasoning mode is set to “Always”, but no AI model is available. " +
      "Configure Hermes, select a running Ollama model, or switch the mode to Auto.";
    await persistExchange(input, reply, "llm", []);
    return NextResponse.json({
      reply,
      engine: "llm",
      usedKnowledge: [],
      error: "no_llm_configured",
      tasks: await getTasks(),
    });
  }

  if (!plan) {
    await applyActions(local);
    await persistExchange(input, local.reply, local.engine, local.usedKnowledge);
    return NextResponse.json({
      reply: local.reply,
      engine: local.engine,
      usedKnowledge: local.usedKnowledge,
      tasks: await getTasks(),
    });
  }

  const usedKnowledge = plan.hits.map((h) => ({ id: h.id, title: h.title }));
  const encoder = new TextEncoder();
  const run = plan.run;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const token of run()) {
          full += token;
          controller.enqueue(encoder.encode(token));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream failed";
        if (!full) {
          const fallback = strict
            ? `I couldn't reach the model (${msg}). Reasoning is set to Always, so I won't answer from the local brain.`
            : `I couldn't reach the model (${msg}). ${local.reply}`;
          full += fallback;
          controller.enqueue(encoder.encode(fallback));
        }
      } finally {
        const reply = full.trim() || (strict ? "The model returned nothing. Try again." : local.reply);
        try {
          await persistExchange(input, reply, "llm", usedKnowledge);
        } catch {
          // Never let a DB hiccup break stream close.
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Engine": "llm",
      "X-Provider": plan.provider,
      "X-Used-Knowledge": encodeURIComponent(JSON.stringify(usedKnowledge)),
    },
  });
}
