'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClientSettings } from '@/lib/clientTypes';

type Props = {
  settings: ClientSettings;
  onChange: (patch: Partial<ClientSettings>) => void;
};

type OpenRouterModel = {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
};

const STATIC_FREE_MODELS = [
  { id: 'openrouter/auto', name: 'Auto (OpenRouter picks best free)', description: 'Smart free-model routing' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (free)', description: 'Google, 27B params' },
  { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B (free)', description: 'Google, 12B params, fast' },
  { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B (free)', description: 'Google, 4B params, very fast' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', description: 'Meta, 70B params' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (free)', description: 'Meta, 8B params, fast' },
  { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi-3 Medium (free)', description: 'Microsoft, 14B params' },
  { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi-3 Mini (free)', description: 'Microsoft, 3.8B params' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (free)', description: 'Mistral, 7B params' },
  { id: 'openchat/openchat-7b:free', name: 'OpenChat 7B (free)', description: 'Open chat model' },
  { id: 'gryphe/mythomax-l2-13b:free', name: 'MythoMax 13B (free)', description: 'MythoMax, 13B params' },
  { id: 'undi95/toppy-m-7b:free', name: 'Toppy 7B (free)', description: 'Toppy M, 7B params' },
];

const STATIC_PAID_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', description: '$0.15/M in — fast, cheap' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: '$2.50/M in — best overall' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 mini', description: 'Latest small model' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', description: 'Latest flagship' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: '$0.10/M in — fast Google' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Latest Google speed' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Google flagship' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', description: '$0.25/M in — fast Claude' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: '$3/M in — best Claude' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Latest Claude Sonnet' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', description: 'Claude flagship' },
  { id: 'xai/grok-3-mini', name: 'Grok 3 Mini', description: 'xAI, mini version' },
  { id: 'xai/grok-3', name: 'Grok 3', description: 'xAI flagship' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', description: '$0.50/M in — reasoning model' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', description: 'Fast, capable Chinese model' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', description: '$2/M in — French flagship' },
  { id: 'mistralai/mistral-medium', name: 'Mistral Medium', description: '$0.65/M in — balanced' },
  { id: 'mistralai/mistral-small', name: 'Mistral Small', description: '$0.07/M in — very cheap' },
  { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', description: 'Meta latest open' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', description: 'NVIDIA optimized' },
];

export default function ModelPicker({ settings, onChange }: Props) {
  const [tab, setTab] = useState<'free' | 'paid' | 'live'>('free');
  const [liveModels, setLiveModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLiveModels(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'live' && liveModels.length === 0 && !loading) {
      void fetchLive();
    }
  }, [tab, liveModels.length, loading, fetchLive]);

  const freeModels = useMemo(() => STATIC_FREE_MODELS, []);
  const paidModels = useMemo(() => STATIC_PAID_MODELS, []);

  const renderModel = (m: { id: string; name: string; description: string }) => (
    <button
      key={m.id}
      onClick={() => onChange({ openrouterModel: m.id })}
      className={`w-full rounded-xl border p-3 text-left transition ${
        settings.openrouterModel === m.id
          ? 'border-cyan-400/70 bg-cyan-400/10'
          : 'border-slate-700/60 bg-slate-950/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-100 truncate">{m.name}</span>
        {settings.openrouterModel === m.id && (
          <span className="shrink-0 text-cyan-300 text-xs">✓</span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">{m.description}</p>
    </button>
  );

  return (
    <section className="glass rounded-2xl p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">AI Model</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Pick your brain. Free models cost nothing — paid models use your OpenRouter credits.
        </p>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">API Key</label>
        <input
          className="w-full rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none mt-1.5"
          type="password"
          value={settings.openrouterKey}
          onChange={(e) => onChange({ openrouterKey: e.target.value })}
          placeholder="sk-or-v1-..."
        />
      </div>

      <div className="flex rounded-xl border border-slate-700/60 p-0.5" role="tablist">
        {(['free', 'paid', 'live'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] ${
              tab === t ? 'bg-cyan-500/20 text-cyan-100' : 'text-slate-400'
            }`}
          >
            {t === 'free' ? '🆓 Free' : t === 'paid' ? '💰 Paid' : '🔄 Live list'}
          </button>
        ))}
      </div>

      {tab === 'live' && error && (
        <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-2.5 text-[11px] text-rose-200">
          {error} — showing static list below.
        </div>
      )}

      {tab === 'live' && loading && (
        <div className="py-6 text-center text-[11px] text-slate-500">Loading live models…</div>
      )}

      <div
        className="space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight: 'calc(100dvh - 32rem)' }}
      >
        {tab === 'free' && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400/80">
              Free — no credits needed
            </p>
            {freeModels.map(renderModel)}
          </>
        )}
        {tab === 'paid' && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-amber-300/80">
              Paid — uses OpenRouter credits
            </p>
            {paidModels.map(renderModel)}
          </>
        )}
        {tab === 'live' && !loading && liveModels.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-cyan-300/80">
              {liveModels.length} models available live from OpenRouter
            </p>
            {liveModels.map((m) => {
              const isFree = m.pricing?.prompt === '0';
              return (
                <button
                  key={m.id}
                  onClick={() => onChange({ openrouterModel: m.id })}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    settings.openrouterModel === m.id
                      ? 'border-cyan-400/70 bg-cyan-400/10'
                      : 'border-slate-700/60 bg-slate-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100 truncate">{m.name}</span>
                    <span className="flex items-center gap-2">
                      {isFree && (
                        <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 text-[9px] text-emerald-200">
                          free
                        </span>
                      )}
                      {settings.openrouterModel === m.id && (
                        <span className="text-cyan-300 text-xs">✓</span>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400 truncate">{m.id}</p>
                </button>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
