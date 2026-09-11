/**
 * TALA Voice — server-side streaming for chat completions.
 *
 * Uses OpenRouter (free + paid models) directly. No Hermes middleman —
 * simpler, more reliable, full OpenRouter model catalog.
 */

export type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type KnowledgeEntry = { id: number; title: string; content: string; tags: string };
export type TaskEntry = { id: number; title: string; done: boolean };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Build a persona + context system prompt for the assistant.
 */
export function buildSystemPrompt(
  settings: {
    agentName?: string;
    userName?: string;
    attitude?: string;
    customAttitude?: string;
  },
  knowledge: KnowledgeEntry[],
  tasks: TaskEntry[],
): string {
  const name = settings.agentName || 'TALA';
  const user = settings.userName || 'friend';

  const attitudeStyle =
    settings.attitude === 'custom' && settings.customAttitude
      ? settings.customAttitude
      : settings.attitude === 'snarky'
        ? 'You are witty, sharp, and a little sarcastic — but always helpful.'
        : settings.attitude === 'formal'
          ? 'You are polished, professional, and precise.'
          : 'You are warm, friendly, attentive, and genuinely helpful.';

  const parts = [
    `You are ${name}, a personal AI assistant for ${user}. ${attitudeStyle} Always identify yourself as ${name}. Never call yourself by any other name.`,
  ];

  if (knowledge.length > 0) {
    parts.push('KNOWLEDGE BASE (use this to answer questions):\n');
    for (const k of knowledge) {
      parts.push(`- ${k.title}: ${k.content}`);
      if (k.tags) parts.push(`  Tags: ${k.tags}`);
    }
    parts.push('');
  }

  if (tasks.length > 0) {
    const open = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    if (open.length > 0) {
      parts.push('OPEN TASKS (things the user asked you to do):\n');
      for (const t of open) parts.push(`- [ ] ${t.title}`);
      parts.push('');
    }
    if (done.length > 0) {
      parts.push('COMPLETED TASKS:\n');
      for (const t of done) parts.push(`- [x] ${t.title}`);
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Stream chat completions from OpenRouter.
 * Returns a ReadableStream of raw SSE data chunks (client parses SSE).
 */
export async function streamChat(
  input: string,
  history: ChatHistoryMessage[],
  knowledge: KnowledgeEntry[],
  tasks: TaskEntry[],
  apiKey: string,
  model: string,
  settings: { agentName?: string; userName?: string; attitude?: string; customAttitude?: string },
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = buildSystemPrompt(settings, knowledge, tasks);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: input },
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tala.local',
      'X-Title': 'TALA',
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {}
          }
        }
      } catch (err) {
        controller.error(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      controller.close();
    },
  });
}
