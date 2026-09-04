"use client";

import { useState } from "react";
import type { ClientSettings } from "@/lib/clientTypes";

type Props = {
  settings: ClientSettings;
  onChange: (patch: Partial<ClientSettings>) => void;
};

type LocalModel = {
  name: string;
  size: number;
  parameters: string;
  quantization: string;
  family: string;
};

const field =
  "w-full rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/60";

export default function OllamaPanel({ settings, onChange }: Props) {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  const discover = async () => {
    setChecking(true);
    setMessage("");
    try {
      const res = await fetch("/api/ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: settings.ollamaUrl }),
      });
      const json = await res.json();
      setModels(json.models ?? []);
      setMessage(
        res.ok
          ? `${json.models?.length ?? 0} installed model${json.models?.length === 1 ? "" : "s"} found.`
          : (json.error ?? "Could not reach Ollama."),
      );
    } catch {
      setMessage("Could not reach Ollama.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="glass rounded-2xl p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">
          Open-source LLM backend
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Ollama runs models on this server for free. Auto prefers Ollama, then optional cloud providers.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="LLM backend">
        {(
          [
            { key: "auto", label: "Auto", hint: "Local first" },
            { key: "ollama", label: "Ollama", hint: "Local only" },
            { key: "openrouter", label: "OpenRouter", hint: "Cloud only" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            role="radio"
            aria-checked={settings.llmBackend === item.key}
            onClick={() => onChange({ llmBackend: item.key })}
            className={`rounded-lg border px-2 py-2 ${
              settings.llmBackend === item.key
                ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                : "border-slate-700/60 text-slate-400"
            }`}
          >
            <span className="block text-[12px] font-medium">{item.label}</span>
            <span className="text-[10px] text-slate-500">{item.hint}</span>
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Ollama URL</span>
        <input
          className={`${field} mt-1.5 font-mono text-[12px]`}
          value={settings.ollamaUrl}
          onChange={(e) => onChange({ ollamaUrl: e.target.value })}
          placeholder="http://127.0.0.1:11434"
          spellCheck={false}
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Ollama model</span>
            <input
              list="ollama-models"
              className={`${field} mt-1.5 font-mono text-[12px]`}
              value={settings.ollamaModel}
              onChange={(e) => onChange({ ollamaModel: e.target.value })}
              placeholder="llama3.2:3b"
              spellCheck={false}
            />
          </label>
          <button
            onClick={discover}
            disabled={checking}
            className="mb-0.5 shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2.5 text-[11px] font-medium text-cyan-100 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Refresh"}
          </button>
        </div>
        <datalist id="ollama-models">
          {models.map((model) => (
            <option key={model.name} value={model.name} />
          ))}
        </datalist>
        {models.length > 0 && (
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {models.map((model) => (
              <button
                key={model.name}
                onClick={() => onChange({ ollamaModel: model.name, llmBackend: "ollama" })}
                className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left ${
                  settings.ollamaModel === model.name
                    ? "border-emerald-400/50 bg-emerald-400/10"
                    : "border-slate-800 bg-slate-950/30"
                }`}
              >
                <span className="truncate font-mono text-[11px] text-slate-200">{model.name}</span>
                <span className="ml-2 shrink-0 text-[9px] text-slate-500">
                  {model.parameters || model.family} {model.quantization}
                </span>
              </button>
            ))}
          </div>
        )}
        {message && (
          <p className={`text-[10px] ${models.length ? "text-emerald-300" : "text-amber-300"}`}>{message}</p>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-500">
        Run <code className="text-slate-300">ollama serve</code> on the same machine. Prompts stay local
        when “Ollama” is selected. Install a model first, for example{" "}
        <code className="text-slate-300">ollama pull llama3.2:3b</code>.
      </p>
    </section>
  );
}
