export type HermesHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type HermesChatChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    message?: { content?: string | null };
  }>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8642";
const DEFAULT_MODEL = "hermes-agent";
const DEFAULT_SESSION_KEY = "tala:main:web:owner";

function baseUrl() {
  return (process.env.HERMES_API_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");
}

export function hermesConfigured() {
  return Boolean((process.env.HERMES_API_KEY || "").trim());
}

export async function streamHermes(
  input: string,
  history: HermesHistoryMessage[],
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = (process.env.HERMES_API_KEY || "").trim();
  if (!apiKey) throw new Error("HERMES_API_KEY is not configured");

  const model = (process.env.HERMES_MODEL || DEFAULT_MODEL).trim();
  const sessionKey = (process.env.HERMES_SESSION_KEY || DEFAULT_SESSION_KEY).trim();
  const systemPrompt =
    (process.env.TALA_SYSTEM_PROMPT || "").trim() ||
    "You are TALA, the user's persistent personal agent. Be concise, practical, and action-oriented. Use Hermes tools when a task requires action or verification. Never claim an action succeeded unless it actually completed.";

  const upstream = await fetch(`${baseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Hermes-Session-Key": sessionKey,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: input },
      ],
    }),
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    throw new Error(detail || `Hermes returned HTTP ${upstream.status}`);
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data) as HermesChatChunk;
              const token = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch {
              // Ignore Hermes progress/custom SSE events that are not chat chunks.
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
