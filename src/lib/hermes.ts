export type HermesHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type KnowledgeEntry = { id: number; title: string; content: string; tags: string };
export type TaskEntry = { id: number; title: string; done: boolean };

const HERMES_URL = "http://127.0.0.1:8650";

export function hermesConfigured() {
  return true;
}

type RpcFrame = {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
  params?: {
    type?: string;
    session_id?: string;
    payload?: {
      text?: string;
      rendered?: string;
    };
  };
};

async function getWsUrl() {
  const res = await fetch(HERMES_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Hermes returned ${res.status}`);

  const html = await res.text();
  const token = html.match(/__HERMES_SESSION_TOKEN__="([^"]+)"/)?.[1];

  if (!token) throw new Error("Hermes session token not found");

  return `ws://127.0.0.1:8650/api/ws?token=${encodeURIComponent(token)}`;
}

async function wireText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data))
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  if (data instanceof Blob) return await data.text();
  return String(data);
}

function buildContext(knowledge: KnowledgeEntry[], tasks: TaskEntry[]): string {
  const parts: string[] = [];

  if (knowledge.length > 0) {
    parts.push("KNOWLEDGE BASE (information you can use to answer questions):\n");
    for (const k of knowledge) {
      parts.push(`- ${k.title}: ${k.content}`);
      if (k.tags) parts.push(`  Tags: ${k.tags}`);
    }
    parts.push("");
  }

  if (tasks.length > 0) {
    const open = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    if (open.length > 0) {
      parts.push("OPEN TASKS (things the user asked you to do):\n");
      for (const t of open) parts.push(`- [ ] ${t.title}`);
      parts.push("");
    }
    if (done.length > 0) {
      parts.push("COMPLETED TASKS:\n");
      for (const t of done) parts.push(`- [x] ${t.title}`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

export async function streamHermes(
  input: string,
  history: HermesHistoryMessage[],
  knowledge: KnowledgeEntry[] = [],
  tasks: TaskEntry[] = [],
): Promise<ReadableStream<Uint8Array>> {
  const wsUrl = await getWsUrl();
  const encoder = new TextEncoder();
  const context = buildContext(knowledge, tasks);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const ws = new WebSocket(wsUrl);

      let id = 0;
      let sessionId = "";
      let finished = false;

      const pending = new Map<
        number,
        {
          resolve: (frame: RpcFrame) => void;
          reject: (err: Error) => void;
        }
      >();

      const close = () => {
        if (finished) return;
        finished = true;
        try { ws.close(); } catch {}
        controller.close();
      };

      const fail = (message: string) => {
        if (finished) return;
        finished = true;
        try { ws.close(); } catch {}
        controller.error(new Error(message));
      };

      const rpc = (method: string, params: Record<string, unknown>) =>
        new Promise<RpcFrame>((resolve, reject) => {
          const rpcId = ++id;
          pending.set(rpcId, { resolve, reject });

          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpcId,
              method,
              params,
            }),
          );
        });

      ws.onopen = async () => {
        try {
          const created = await rpc("session.create", {
            source: "web",
            title: "TALA",
            cols: 120,
          });

          sessionId = String(created.result?.session_id || "");

          if (!sessionId)
            throw new Error("Hermes did not return session_id");

          const transcript = history
            .slice(-20)
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n");

          const prompt = transcript
            ? `${context}\n${transcript}\nUSER: ${input}`
            : input;

          await rpc("prompt.submit", {
            session_id: sessionId,
            text: prompt,
          });
        } catch (err) {
          fail(err instanceof Error ? err.message : "Hermes startup failed");
        }
      };

      ws.onmessage = async (event) => {
        try {
          const text = await wireText(event.data);
          const frame = JSON.parse(text) as RpcFrame;

          if (typeof frame.id === "number") {
            const waiter = pending.get(frame.id);
            if (!waiter) return;

            pending.delete(frame.id);

            if (frame.error) {
              waiter.reject(
                new Error(frame.error.message || "Hermes RPC error"),
              );
            } else {
              waiter.resolve(frame);
            }

            return;
          }

          if (
            frame.method !== "event" ||
            frame.params?.session_id !== sessionId
          ) return;

          if (frame.params.type === "message.delta") {
            const delta =
              frame.params.payload?.text ||
              frame.params.payload?.rendered ||
              "";

            if (delta)
              controller.enqueue(encoder.encode(delta));
          }

          if (frame.params.type === "message.complete") {
            close();
          }
        } catch {}
      };

      ws.onerror = () =>
        fail("Cannot connect to TALA Hermes backend on port 8650");

      ws.onclose = () => {
        if (!finished)
          fail("TALA Hermes connection closed unexpectedly");
      };
    },
  });
}
