import { getPersona } from "./personas";
import type { Knowledge, Settings, Task } from "@/db/schema";

export type AgentContext = {
  settings: Settings;
  knowledge: Knowledge[];
  tasks: Task[];
  history: { role: string; content: string }[];
};

export type AgentAction =
  | { type: "create_task"; title: string }
  | { type: "complete_task"; id: number }
  | { type: "create_knowledge"; title: string; content: string };

export type AgentResult = {
  reply: string;
  actions: AgentAction[];
  usedKnowledge: { id: number; title: string }[];
  engine: "llm" | "local";
};

function pick(list: string[], user: string) {
  const s = list[Math.floor(Math.random() * list.length)] ?? "";
  return s.replaceAll("{user}", user);
}

const STOP = new Set([
  "the","a","an","is","are","was","were","of","to","and","or","in","on","for","my","me","i",
  "you","what","whats","how","do","does","did","can","could","should","tell","about","with",
  "please","that","this","it","be","at","from","have","has","again","whos","who","when","where",
]);

function tokenize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Simple TF-style scoring of knowledge entries against the query. */
export function searchKnowledge(query: string, kb: Knowledge[], limit = 4) {
  const q = tokenize(query);
  if (!q.length) return [];
  const scored = kb.map((k) => {
    const hay = `${k.title} ${k.tags} ${k.content}`.toLowerCase();
    let score = 0;
    for (const w of q) {
      if (k.title.toLowerCase().includes(w)) score += 3;
      if (k.tags.toLowerCase().includes(w)) score += 2;
      const m = hay.split(w).length - 1;
      score += Math.min(m, 4);
    }
    return { k, score };
  });
  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.k);
}

function safeMath(expr: string): number | null {
  const cleaned = expr.replace(/[^0-9+\-*/().%\s^]/g, "");
  if (!/[0-9]/.test(cleaned) || !/[+\-*/^%]/.test(cleaned)) return null;
  try {
    const fn = new Function(`"use strict";return (${cleaned.replaceAll("^", "**")});`);
    const val = fn();
    return typeof val === "number" && Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

function fmtTime(tz: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  if (tz && tz !== "local") opts.timeZone = tz;
  try {
    return new Intl.DateTimeFormat("en-GB", opts).format(new Date());
  } catch {
    return new Date().toString();
  }
}

/** Deterministic on-device brain. Always available, no API key required. */
export function localBrain(input: string, ctx: AgentContext): AgentResult {
  const { settings, knowledge, tasks } = ctx;
  const persona = getPersona(settings.attitude, settings.customAttitude);
  const user = settings.userName || "Sir";
  const text = input.trim();
  const low = text.toLowerCase();
  const actions: AgentAction[] = [];
  const usedKnowledge: { id: number; title: string }[] = [];
  const concise = settings.attitude === "concise";

  const wrap = (body: string) => body.replaceAll("{user}", user);

  // greetings
  if (/^(hi|hey|hello|yo|good (morning|evening|afternoon)|wake up|are you (there|online))\b/.test(low)) {
    const open = pick(persona.greetings, user);
    const pending = tasks.filter((t) => !t.done).length;
    const extra = concise
      ? pending ? ` ${pending} open task(s).` : ""
      : pending
        ? ` You have ${pending} open task${pending === 1 ? "" : "s"} on the board.`
        : " Nothing outstanding on your task list.";
    return { reply: open + extra, actions, usedKnowledge, engine: "local" };
  }

  // identity
  if (/(who are you|what are you|your name)/.test(low)) {
    return {
      reply: wrap(
        concise
          ? `${settings.agentName}. Personality: ${persona.label}. KB entries: ${knowledge.length}.`
          : `I am ${settings.agentName} — your personal assistant, currently running the ${persona.label} personality ${persona.emoji}. I have ${knowledge.length} entr${knowledge.length === 1 ? "y" : "ies"} in your knowledge base and ${tasks.filter((t) => !t.done).length} open tasks.`,
      ),
      actions,
      usedKnowledge,
      engine: "local",
    };
  }

  // time / date
  if (/\b(time|date|what day)\b/.test(low)) {
    return { reply: `${fmtTime(settings.timezone)}.`, actions, usedKnowledge, engine: "local" };
  }

  // math
  if (/[0-9]/.test(low) && /[+\-*/^%]|times|plus|minus|divided/.test(low)) {
    const norm = low
      .replace(/what is|whats|calculate|compute|=|\?/g, " ")
      .replace(/times|multiplied by/g, "*")
      .replace(/plus/g, "+")
      .replace(/minus/g, "-")
      .replace(/divided by/g, "/");
    const val = safeMath(norm);
    if (val !== null) {
      return {
        reply: concise ? `${val}` : `${val}. ${pick(persona.ack, user)}`,
        actions,
        usedKnowledge,
        engine: "local",
      };
    }
  }

  // task creation
  const taskMatch = low.match(
    /^(?:add|create|new)?\s*(?:a\s+)?(?:task|todo|to-do|reminder)[:\s]+(.*)$/,
  ) ||
    low.match(/^remind me to (.*)$/) ||
    low.match(/^(?:i need to|i have to) (.*)$/);
  if (taskMatch && taskMatch[1]?.trim()) {
    const title = text.slice(text.length - taskMatch[1].length).trim();
    actions.push({ type: "create_task", title });
    return {
      reply: `${pick(persona.ack, user)} Task logged: “${title}”.`,
      actions,
      usedKnowledge,
      engine: "local",
    };
  }

  // task listing
  if (/(my tasks|task list|todo list|what.*(to do|on my plate)|agenda|briefing)/.test(low)) {
    const open = tasks.filter((t) => !t.done);
    if (!open.length) {
      return { reply: `Your board is clear, ${user}.`, actions, usedKnowledge, engine: "local" };
    }
    const list = open.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join("\n");
    return {
      reply: `${open.length} open item${open.length === 1 ? "" : "s"}:\n${list}`,
      actions,
      usedKnowledge,
      engine: "local",
    };
  }

  // complete task
  const doneMatch = low.match(/^(?:done|complete|finished|mark done)\s*(?:task\s*)?#?(\d+)?/);
  if (doneMatch) {
    const open = tasks.filter((t) => !t.done);
    const idx = doneMatch[1] ? parseInt(doneMatch[1], 10) - 1 : 0;
    const target = open[idx];
    if (target) {
      actions.push({ type: "complete_task", id: target.id });
      return {
        reply: `${pick(persona.ack, user)} “${target.title}” is closed out.`,
        actions,
        usedKnowledge,
        engine: "local",
      };
    }
  }

  // remember X
  const remember = text.match(/^(?:remember|note|store|learn)(?: that)?[:\s]+(.+)$/i);
  if (remember) {
    const content = remember[1].trim();
    const title = content.split(/[.,;]/)[0].slice(0, 60);
    actions.push({ type: "create_knowledge", title, content });
    return {
      reply: `${pick(persona.ack, user)} Committed to memory: “${title}”.`,
      actions,
      usedKnowledge,
      engine: "local",
    };
  }

  // knowledge base lookup
  const hits = searchKnowledge(text, knowledge);
  if (hits.length) {
    hits.forEach((h) => usedKnowledge.push({ id: h.id, title: h.title }));
    const top = hits[0];
    const rest = hits.slice(1, 3).map((h) => `• ${h.title}`).join("\n");
    const body = concise
      ? top.content.slice(0, 400)
      : `From your knowledge base — **${top.title}**:\n${top.content.slice(0, 700)}`;
    return {
      reply: rest ? `${body}\n\nRelated:\n${rest}` : body,
      actions,
      usedKnowledge,
      engine: "local",
    };
  }

  if (/(help|what can you do|commands)/.test(low)) {
    return {
      reply: [
        `Here's my command surface, ${user}:`,
        "• “task: call the bank” — log a task",
        "• “my tasks” / “briefing” — see what's open",
        "• “done 1” — close a task",
        "• “remember that my router password is …” — store knowledge",
        "• Ask anything covered by your knowledge base",
        "• “what time is it”, “12 * 34”",
        "• Tap the orb to talk to me hands-free.",
      ].join("\n"),
      actions,
      usedKnowledge,
      engine: "local",
    };
  }

  return { reply: pick(persona.unknown, user), actions, usedKnowledge, engine: "local" };
}

/** Optional LLM upgrade path when an API key is present. */
export function buildSystemPrompt(ctx: AgentContext, kbHits: Knowledge[]) {
  const persona = getPersona(ctx.settings.attitude, ctx.settings.customAttitude);
  const open = ctx.tasks.filter((t) => !t.done);
  return [
    `You are ${ctx.settings.agentName}, a personal AI assistant for ${ctx.settings.userName}.`,
    `PERSONALITY: ${persona.systemStyle}`,
    `Keep replies short enough to be spoken aloud (under 90 words) unless asked for detail.`,
    `Units: ${ctx.settings.units}. Current time: ${fmtTime(ctx.settings.timezone)}.`,
    open.length ? `OPEN TASKS:\n${open.map((t) => `- ${t.title}`).join("\n")}` : "OPEN TASKS: none",
    kbHits.length
      ? `USER KNOWLEDGE BASE (authoritative, prefer this over general knowledge):\n${kbHits
          .map((k) => `### ${k.title}\n${k.content}`)
          .join("\n\n")}`
      : "USER KNOWLEDGE BASE: no relevant entries.",
  ].join("\n\n");
}

export async function llmBrain(
  input: string,
  ctx: AgentContext,
): Promise<AgentResult | null> {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const orKey = ctx.settings.openrouterKey;
  const orModel = ctx.settings.openrouterModel;
  if (!openai && !anthropic && !(orKey && orModel)) return null;

  const hits = searchKnowledge(input, ctx.knowledge, 6);
  const system = buildSystemPrompt(ctx, hits.length ? hits : ctx.knowledge.slice(0, 6));
  const history = ctx.history.slice(-8).map((m) => ({
    role: m.role === "agent" ? "assistant" : "user",
    content: m.content,
  }));

  try {
    // OpenRouter takes priority — it's the user-configured path.
    if (orKey && orModel) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${orKey}`,
          "HTTP-Referer": "https://tala.local",
          "X-Title": ctx.settings.agentName || "TALA",
        },
        body: JSON.stringify({
          model: orModel,
          messages: [
            { role: "system", content: system },
            ...history,
            { role: "user", content: input },
          ],
          max_tokens: 600,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
          reply:
            res.status === 402
              ? "That model needs credit on your OpenRouter account. Pick a free model in Setup."
              : res.status === 401
                ? "My OpenRouter key was rejected. Please re-enter it in Setup."
                : `The model “${orModel}” failed (${res.status}). ${detail.slice(0, 140)}`,
          actions: [],
          usedKnowledge: [],
          engine: "llm",
        };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      const reply = json.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        if (json.error?.message) {
          return {
            reply: `OpenRouter error: ${json.error.message}`,
            actions: [],
            usedKnowledge: [],
            engine: "llm",
          };
        }
        return null;
      }
      return {
        reply,
        actions: [],
        usedKnowledge: hits.map((h) => ({ id: h.id, title: h.title })),
        engine: "llm",
      };
    }

    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openai}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [{ role: "system", content: system }, ...history, { role: "user", content: input }],
          max_tokens: 500,
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = json.choices?.[0]?.message?.content?.trim();
      if (!reply) return null;
      return {
        reply,
        actions: [],
        usedKnowledge: hits.map((h) => ({ id: h.id, title: h.title })),
        engine: "llm",
      };
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropic as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
        max_tokens: 500,
        system,
        messages: [...history, { role: "user", content: input }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { text?: string }[] };
    const reply = json.content?.map((c) => c.text ?? "").join("").trim();
    if (!reply) return null;
    return {
      reply,
      actions: [],
      usedKnowledge: hits.map((h) => ({ id: h.id, title: h.title })),
      engine: "llm",
    };
  } catch {
    return null;
  }
}
