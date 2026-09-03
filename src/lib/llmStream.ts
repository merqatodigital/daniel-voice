import { buildSystemPrompt, searchKnowledge, type AgentContext } from "./agent";
import type { Knowledge } from "@/db/schema";

export type StreamPlan = {
  provider: "openrouter" | "openai" | "anthropic" | "ollama";
  hits: Knowledge[];
  /** Starts the upstream request and yields text deltas as they arrive. */
  run: () => AsyncGenerator<string, void, void>;
};

/**
 * Decide which LLM to call and return a lazy token generator. Returns null
 * when no provider is configured so the caller can stay on the local brain.
 *
 * Priority: OpenRouter (user-configured cloud) → Ollama (local open-source)
 * → OpenAI env var → Anthropic env var.
 */
export function planLlmStream(input: string, ctx: AgentContext): StreamPlan | null {
  const orKey = ctx.settings.openrouterKey;
  const orModel = ctx.settings.openrouterModel;
  const ollamaUrl = ctx.settings.ollamaUrl || "http://localhost:11434";
  const ollamaModel = ctx.settings.ollamaModel;
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!(orKey && orModel) && !ollamaModel && !openai && !anthropic) return null;

  const hits = searchKnowledge(input, ctx.knowledge, 6);
  const system = buildSystemPrompt(ctx, hits.length ? hits : ctx.knowledge.slice(0, 6));
  const history = ctx.history.slice(-8).map((m) => ({
    role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  if (orKey && orModel) {
    return {
      provider: "openrouter",
      hits,
      run: () =>
        streamOpenAICompatible({
          // Overridable so self-hosted OpenAI-compatible gateways work too.
          url: `${process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`,
          key: orKey,
          model: orModel,
          system,
          history,
          input,
          extraHeaders: {
            "HTTP-Referer": "https://jarvis.local",
            "X-Title": ctx.settings.agentName || "JARVIS",
          },
        }),
    };
  }
  // Ollama — local open-source LLM, no API key needed.
  if (ollamaModel) {
    return {
      provider: "ollama",
      hits,
      run: () =>
        streamOllama({
          baseUrl: ollamaUrl,
          model: ollamaModel,
          system,
          history,
          input,
        }),
    };
  }
  if (openai) {
    return {
      provider: "openai",
      hits,
      run: () =>
        streamOpenAICompatible({
          url: "https://api.openai.com/v1/chat/completions",
          key: openai,
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          system,
          history,
          input,
        }),
    };
  }
  return {
    provider: "anthropic",
    hits,
    run: () =>
      streamAnthropic({
        key: anthropic as string,
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
        system,
        history,
        input,
      }),
  };
}

type Msg = { role: "user" | "assistant"; content: string };

function friendlyHttpError(status: number, model: string, detail: string) {
  if (status === 402)
    return "That model needs credit on your OpenRouter account. Pick a free model in Setup.";
  if (status === 401) return "My API key was rejected. Please re-enter it in Setup.";
  if (status === 429) return "The model is rate-limited right now. Try again in a moment.";
  return `The model “${model}” failed (${status}). ${detail.slice(0, 140)}`;
}

/** Splits a byte stream into SSE `data:` payload lines. */
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // ignore comments / event: lines
        const payload = line.slice(5).trim();
        if (payload) yield payload;
      }
    }
    if (buf.startsWith("data:")) {
      const payload = buf.slice(5).trim();
      if (payload) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamOpenAICompatible(opts: {
  url: string;
  key: string;
  model: string;
  system: string;
  history: Msg[];
  input: string;
  extraHeaders?: Record<string, string>;
}): AsyncGenerator<string, void, void> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.key}`,
      ...(opts.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      max_tokens: 600,
      messages: [
        { role: "system", content: opts.system },
        ...opts.history,
        { role: "user", content: opts.input },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    yield friendlyHttpError(res.status, opts.model, detail);
    return;
  }

  for await (const payload of sseLines(res.body)) {
    if (payload === "[DONE]") return;
    let json: {
      choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
      error?: { message?: string };
    };
    try {
      json = JSON.parse(payload);
    } catch {
      continue; // partial / keep-alive noise
    }
    if (json.error?.message) {
      yield `\n[${json.error.message}]`;
      return;
    }
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

async function* streamAnthropic(opts: {
  key: string;
  model: string;
  system: string;
  history: Msg[];
  input: string;
}): AsyncGenerator<string, void, void> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      max_tokens: 600,
      system: opts.system,
      messages: [...opts.history, { role: "user", content: opts.input }],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    yield friendlyHttpError(res.status, opts.model, detail);
    return;
  }

  for await (const payload of sseLines(res.body)) {
    let json: {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }
    if (json.type === "error") {
      yield `\n[${json.error?.message ?? "Anthropic error"}]`;
      return;
    }
    if (json.type === "message_stop") return;
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta.text) {
      yield json.delta.text;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ollama — local open-source LLM (NDJSON streaming, no auth)          */
/* ------------------------------------------------------------------ */

async function* streamOllama(opts: {
  baseUrl: string;
  model: string;
  system: string;
  history: Msg[];
  input: string;
}): AsyncGenerator<string, void, void> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/api/chat`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        stream: true,
        messages: [
          { role: "system", content: opts.system },
          ...opts.history,
          { role: "user", content: opts.input },
        ],
      }),
    });
  } catch {
    yield "Could not reach Ollama. Make sure `ollama serve` is running on this machine.";
    return;
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    yield `Ollama returned ${res.status}. ${detail.slice(0, 140)}`;
    return;
  }

  // Ollama streams NDJSON — one JSON object per line, not SSE.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let json: {
          done?: boolean;
          message?: { content?: string };
          error?: string;
        };
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        if (json.done) return;
        if (json.error) {
          yield `\n[Ollama: ${json.error}]`;
          return;
        }
        const token = json.message?.content;
        if (token) yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
