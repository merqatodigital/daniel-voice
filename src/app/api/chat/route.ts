import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, tasks, knowledge } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSettings, getKnowledge, getTasks, getMessages } from "@/lib/store";
import { localBrain, type AgentContext, type AgentResult } from "@/lib/agent";
import { planLlmStream } from "@/lib/llmStream";

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

  const ctx: AgentContext = {
    settings,
    knowledge: kb,
    tasks: taskRows,
    history: history.map((m) => ({ role: m.role, content: m.content })),
  };

  // The local brain always runs first: it handles deterministic commands
  // (tasks, memory, maths, briefings) that must never be paraphrased away.
  const local = localBrain(input, ctx);
  const tookAction = local.actions.length > 0;
  const localWasWeak = !tookAction && local.usedKnowledge.length === 0;

  // ---- LLM decision: branch explicitly on the three llmMode values. ----
  //   off    → local brain only, even if keys are configured.
  //   auto   → LLM when the local brain draws a blank and an LLM is available;
  //            otherwise local. Silent degradation is acceptable here.
  //   always → LLM for everything except explicit commands. If no LLM is
  //            available, or the call fails, tell the user — never degrade.
  const mode = settings.llmMode;
  const wantsLlm = mode === "off" ? false : mode === "always" ? !tookAction : localWasWeak;
  const plan = wantsLlm ? planLlmStream(input, ctx) : null;
  const strict = mode === "always";

  if (strict && wantsLlm && !plan) {
    const reply =
      "Reasoning mode is set to “Always”, but no AI model is connected. " +
      "Open Setup → OpenRouter brain to add your key and pick a model, or switch the mode to “Auto”.";
    await persistExchange(input, reply, "llm", []);
    return NextResponse.json({
      reply,
      engine: "llm",
      usedKnowledge: [],
      error: "no_llm_configured",
      tasks: await getTasks(),
    });
  }

  // ---- Local path: instant JSON, unchanged contract. ----
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

  // ---- LLM path: stream tokens as they arrive. ----
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
          // "always" must never quietly hand the turn to the local brain.
          const fallback = strict
            ? `I couldn't reach the model (${msg}). Reasoning is set to “Always”, so I won't answer from the local brain — check your OpenRouter key and model in Setup, or try again.`
            : `I couldn't reach the model (${msg}). ${local.reply}`;
          full += fallback;
          controller.enqueue(encoder.encode(fallback));
        }
      } finally {
        const reply = full.trim() || (strict ? "The model returned nothing. Try again." : local.reply);
        try {
          await persistExchange(input, reply, "llm", usedKnowledge);
        } catch {
          /* never let a DB hiccup break the stream close */
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
      // Header values must be ASCII — encode the JSON payload.
      "X-Used-Knowledge": encodeURIComponent(JSON.stringify(usedKnowledge)),
    },
  });
}
