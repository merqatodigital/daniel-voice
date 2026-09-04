import { buildSystemPrompt, searchKnowledge, type AgentContext } from "./agent";
import type { Knowledge } from "@/db/schema";

export type StreamPlan = {
  provider: "ollama" | "openrouter" | "openai" | "anthropic";
  hits: Knowledge[];
  /** Starts the upstream request and yields text deltas as they arrive. */
  run: () => AsyncGenerator<string, void, void>;
};

type Msg = { role: "user" | "assistant"; content: string };
type OllamaTags = { models?: { name?: string; model?: string }[] };

function cleanBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Ollama is optional. Probe quickly so an offline local daemon never delays the
 * built-in brain or the cloud fallback. A configured model must be installed.
 */
async function ollamaHasModel(baseUrl: string, model: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as OllamaTags;
    return (json.models ?? []).some((m) => (m.name ?? m.model) === model);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide which LLM to call and return a lazy token generator. `auto` prefers
 * open-source local Ollama, then the optional OpenRouter/OpenAI/Anthropic paths.
 * Returns null when no usable provider is configured.
 */
export async function planLlmStream(input: string, ctx: AgentContext): Promise<StreamPlan | null> {
  const backend = ctx.settings.llmBackend;
  const ollamaUrl = cleanBaseUrl(ctx.settings.ollamaUrl || "http://127.0.0.1:11434");
  const ollamaModel = ctx.settings.ollamaModel;
  const orKey = ctx.settings.openrouterKey;
  const orModel = ctx.settings.openrouterModel;
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  // A reachable Ollama outside localhost (LAN box, Cloudflare/Tailscale tunnel).
  // Deployment platforms can't host the daemon, so the URL has to come from env.
  const envOllamaUrl = (process.env.OLLAMA_URL || "").trim();
  const envOllamaModel = (process.env.OLLAMA_MODEL || "").trim();

  const hits = searchKnowledge(input, ctx.knowledge, 6);
  const system = buildSystemPrompt(ctx, hits.length ? hits : ctx.knowledge.slice(0, 6));
  const history = ctx.history.slice(-8).map((m) => ({
    role: m.role === "agent" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  // Explicit OpenRouter skips Ollama. Auto and explicit Ollama both try local.
  // The env pair is consulted first when the DB still points at 127.0.0.1, which
  // is what happens on Vercel / any host that has no local daemon.
  const preferEnvOllama =
    backend !== "openrouter" &&
    envOllamaUrl &&
    envOllamaModel &&
    (!ollamaModel || /^https?:\/\/127\.0\.0\.1|^https?:\/\/localhost/i.test(ollamaUrl));
  if (preferEnvOllama) {
    return {
      provider: "ollama",
      hits,
      run: () =>
        streamOllama({
          baseUrl: cleanBaseUrl(envOllamaUrl),
          model: envOllamaModel,
          system,
          history,
          input,
        }),
    };
  }
  if (backend !== "openrouter" && ollamaModel && (await ollamaHasModel(ollamaUrl, ollamaModel))) {
    return {
      provider: "ollama",
      hits,
      run: () => streamOllama({ baseUrl: ollamaUrl, model: ollamaModel, system, history, input }),
    };
  }

  // Explicit Ollama never leaks a prompt to a cloud fallback.
  if (backend === "ollama") return null;

  // A cloud OpenAI-compatible endpoint supplied purely by env (no key in the DB).
  // Covers the free tiers — Groq, Cerebras, SambaNova, Mistral, OpenRouter — by
  // swapping OPENAI_BASE_URL; nothing else in the request shape changes.
  const envOrKey = (process.env.OPENROUTER_API_KEY || "").trim();
  const envOrModel = (process.env.OPENROUTER_MODEL || "").trim();
  const openAiBase = (process.env.OPENAI_BASE_URL || "").trim();
  const openAiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!orKey && envOrKey && envOrModel) {
    return {
      provider: "openrouter",
      hits,
      run: () =>
        streamOpenAICompatible({
          url: `${process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`,
          key: envOrKey,
          model: envOrModel,
          system,
          history,
          input,
          extraHeaders: {
            "HTTP-Referer": "https://tala.local",
            "X-Title": ctx.settings.agentName || "TALA",
          },
        }),
    };
  }

  if (orKey && orModel) {
    return {
      provider: "openrouter",
      hits,
      run: () =>
        streamOpenAICompatible({
          url: `${process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`,
          key: orKey,
          model: orModel,
          system,
          history,
          input,
          extraHeaders: {
            "HTTP-Referer": "https://tala.local",
            "X-Title": ctx.settings.agentName || "TALA",
          },
        }),
    };
  }
  if (openai) {
    return {
      provider: "openai",
      hits,
      run: () =>
        streamOpenAICompatible({
          url: `${openAiBase ? cleanBaseUrl(openAiBase) : "https://api.openai.com/v1"}/chat/completions`,
          key: openai,
          model: openAiModel,
          system,
          history,
          input,
        }),
    };
  }
  if (anthropic) {
    return {
      provider: "anthropic",
      hits,
      run: () =>
        streamAnthropic({
          key: anthropic,
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
          system,
          history,
          input,
        }),
    };
  }
  return null;
}

function friendlyHttpError(status: number, model: string, detail: string) {
  if (status === 402)
    return "That model needs credit on your OpenRouter account. Pick a free model in Setup.";
  if (status === 401) return "My API key was rejected. Please re-enter it in Setup.";
  if (status === 429) return "The model is rate-limited right now. Try again in a moment.";
  return `The model “${model}” failed (${status}). ${detail.slice(0, 140)}`;
}

/** Splits a byte stream into newline-delimited payloads. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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
        const line = buf.slice(0, nl).replace(/\r$/, "").trim();
        buf = buf.slice(nl + 1);
        if (line) yield line;
      }
    }
    const tail = (buf + decoder.decode()).trim();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** Converts SSE into JSON payload lines. */
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of lines(body)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload) yield payload;
  }
}

/** Native, fully local Ollama `/api/chat` NDJSON stream. */
async function* streamOllama(opts: {
  baseUrl: string;
  model: string;
  system: string;
  history: Msg[];
  input: string;
}): AsyncGenerator<string, void, void> {
  const res = await fetch(`${opts.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      keep_alive: "10m",
      options: { num_predict: 600 },
      messages: [
        { role: "system", content: opts.system },
        ...opts.history,
        { role: "user", content: opts.input },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama returned ${res.status}: ${detail.slice(0, 140)}`);
  }
  for await (const line of lines(res.body)) {
    let json: { message?: { content?: string }; response?: string; done?: boolean; error?: string };
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    if (json.error) throw new Error(json.error);
    const token = json.message?.content ?? json.response;
    if (token) yield token;
    if (json.done) return;
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
      continue;
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
