import { NextResponse } from 'next/server';
import { db } from '@/db';
import { messages } from '@/db/schema';
import { getMessages, getKnowledge, getTasks, getSettings } from '@/lib/store';
import { streamChat, type KnowledgeEntry } from '@/lib/openrouter';
import { searchKnowledge } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const msgs = await getMessages();
    return NextResponse.json({ messages: msgs });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function DELETE() {
  try {
    await db.delete(messages);
  } catch {}
  return NextResponse.json({ ok: true });
}

async function persistExchange(input: string, reply: string, engine: string) {
  try {
    await db.insert(messages).values([
      { role: 'user', content: input },
      { role: 'agent', content: reply, meta: { engine } },
    ]);
  } catch {}
}

function toChatHistory(history: Awaited<ReturnType<typeof getMessages>>) {
  return history
    .slice(-20)
    .map((m) => ({
      role: m.role === 'agent' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }))
    .filter((m) => m.content.trim().length > 0);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { input?: string };
    const input = (body.input ?? '').trim();
    if (!input) return NextResponse.json({ error: 'empty input' }, { status: 400 });

    const [history, kb, taskRows] = await Promise.all([
      getMessages(20),
      getKnowledge(),
      getTasks(),
    ]);

    const settings = await getSettings();

    if (!settings.openrouterKey || !settings.openrouterModel) {
      return NextResponse.json(
        { error: 'Configure your OpenRouter key and model in Setup → AI Model.' },
        { status: 400 },
      );
    }

    // Search knowledge base for relevant context
    const relevantKnowledge = searchKnowledge(input, 3);
    const knowledgeForPrompt: KnowledgeEntry[] = relevantKnowledge.map(k => ({
      id: k.id,
      title: k.title,
      content: k.content,
      tags: k.tags,
      category: k.category,
    }));

    // Get raw SSE stream from OpenRouter
    const source = await streamChat(
      input,
      toChatHistory(history),
      knowledgeForPrompt,
      taskRows as any[],
      settings.openrouterKey,
      settings.openrouterModel,
      settings,
    );

    // Parse SSE on the server, stream clean text deltas to client
    const reader = source.getReader();
    const decoder = new TextDecoder();
    let reply = '';
    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
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
                if (delta) {
                  reply += delta;
                  controller.enqueue(encoder.encode(delta));
                }
              } catch {}
            }
          }
        } catch (err) {
          controller.error(err instanceof Error ? err : new Error(String(err)));
          return;
        } finally {
          controller.close();
          reader.releaseLock();
        }

        // Persist after streaming completes
        reply = reply.trim();
        if (reply) await persistExchange(input, reply, 'openrouter');
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Engine': 'openrouter',
        'X-Model': settings.openrouterModel,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
