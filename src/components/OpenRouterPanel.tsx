"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientSettings, KeyStatus, ModelInfo } from "@/lib/clientTypes";

type Props = {
  settings: ClientSettings;
  onChange: (patch: Partial<ClientSettings>) => void;
};

const input =
  "w-full rounded-xl border border-cyan-400/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/60";

type Tier = "all" | "free" | "paid";
type SortKey = "new" | "cheap" | "context" | "name";

function pricePerM(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return "variable";
  if (n === 0) return "free";
  const per = n * 1_000_000;
  if (per < 0.01) return `$${per.toFixed(4)}`;
  if (per < 1) return `$${per.toFixed(3)}`;
  return `$${per.toFixed(2)}`;
}

function ctxLabel(n: number) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function OpenRouterPanel({ settings, onChange }: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [keyState, setKeyState] = useState<KeyStatus>({
    configured: false,
    masked: "",
    status: null,
  });
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [modelList, setModelList] = useState<ModelInfo[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tier, setTier] = useState<Tier>("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [limit, setLimit] = useState(40);

  const loadKey = useCallback(async () => {
    const r = await fetch("/api/openrouter/key");
    setKeyState(await r.json());
  }, []);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/models");
      const j = await r.json();
      setModelList(j.models ?? []);
      setFetchedAt(j.fetchedAt ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKey();
    void loadModels();
  }, [loadKey, loadModels]);

  const saveKey = async () => {
    const k = keyInput.trim();
    if (!k) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      const r = await fetch("/api/openrouter/key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: k }),
      });
      // Vercel can return an HTML error page on 5xx — guard against non-JSON.
      let j: { configured?: boolean; masked?: string; status?: { ok?: boolean; label?: string; error?: string } | null; error?: string };
      try {
        j = await r.json();
      } catch {
        setKeyError(`Server returned an error (${r.status}). Try again.`);
        setSavingKey(false);
        return;
      }
      if (!r.ok) {
        setKeyError(j.error ?? `Could not save that key (${r.status}).`);
        setSavingKey(false);
        return;
      }
      setKeyState(j as { configured: boolean; masked: string; status: { ok: boolean; label?: string; error?: string } | null });
      setKeyInput("");
      // Try to refresh the model catalogue now that the key is saved.
      await refresh();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Could not connect to OpenRouter.");
    } finally {
      setSavingKey(false);
    }
  };

  const removeKey = async () => {
    await fetch("/api/openrouter/key", { method: "DELETE" });
    setKeyState({ configured: false, masked: "", status: null });
    onChange({ openrouterModel: "" });
  };

  const refresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const r = await fetch("/api/models", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setRefreshMsg(j.error ?? "Refresh failed.");
        return;
      }
      setModelList(j.models ?? []);
      setFetchedAt(j.fetchedAt ?? null);
      setRefreshMsg(
        `Updated — ${j.counts.total} models (${j.counts.free} free, ${j.counts.paid} paid).`,
      );
      setTimeout(() => setRefreshMsg(null), 5000);
    } catch {
      setRefreshMsg("Network error while refreshing.");
    } finally {
      setRefreshing(false);
    }
  };

  const providers = useMemo(
    () => Array.from(new Set(modelList.map((m) => m.provider))).sort(),
    [modelList],
  );

  const counts = useMemo(
    () => ({
      total: modelList.length,
      free: modelList.filter((m) => m.isFree).length,
      paid: modelList.filter((m) => !m.isFree).length,
    }),
    [modelList],
  );

  const filtered = useMemo(() => {
    let out = modelList;
    if (tier === "free") out = out.filter((m) => m.isFree);
    if (tier === "paid") out = out.filter((m) => !m.isFree);
    if (provider !== "all") out = out.filter((m) => m.provider === provider);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      );
    }
    const sorted = [...out];
    if (sort === "new") sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "context") sorted.sort((a, b) => b.contextLength - a.contextLength);
    if (sort === "cheap")
      sorted.sort((a, b) => {
        const pa = Math.max(0, Number(a.promptPrice));
        const pb = Math.max(0, Number(b.promptPrice));
        return pa - pb;
      });
    return sorted;
  }, [modelList, tier, provider, query, sort]);

  const selected = modelList.find((m) => m.id === settings.openrouterModel);

  return (
    <section className="glass rounded-2xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">
            OpenRouter brain
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            One key, {counts.total || "400+"} models. Your key is stored server-side and never sent
            to the browser.
          </p>
        </div>
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-200"
        >
          Get key ↗
        </a>
      </div>

      {/* API key */}
      {keyState.configured ? (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] text-emerald-100">{keyState.masked}</p>
              <p className="mt-0.5 text-[10px] text-emerald-200/70">
                {keyState.status?.ok
                  ? `Connected${keyState.status.label ? ` · ${keyState.status.label}` : ""}`
                  : (keyState.status?.error ?? "Saved, but could not verify.")}
              </p>
            </div>
            <button
              onClick={removeKey}
              className="shrink-0 rounded-lg bg-rose-500/20 px-2.5 py-1 text-[11px] text-rose-200"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className={`${input} font-mono text-[12px]`}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-or-v1-…"
            type="password"
            autoComplete="off"
            spellCheck={false}
          />
          {keyError && (
            <p className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-2.5 py-2 text-[11px] text-rose-200">
              {keyError}
            </p>
          )}
          <button
            onClick={saveKey}
            disabled={savingKey || !keyInput.trim()}
            className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            {savingKey ? "Verifying…" : "Connect OpenRouter"}
          </button>
          <p className="text-[10px] text-slate-500">
            Without a key the assistant still works — it just uses the built-in on-device brain.
          </p>
        </div>
      )}

      {/* Reasoning mode */}
      <div className="space-y-2 border-t border-slate-700/50 pt-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Reasoning mode</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { k: "auto", label: "Auto", hint: "Local first" },
              { k: "always", label: "Always", hint: "Prefer LLM" },
              { k: "off", label: "Off", hint: "Local only" },
            ] as const
          ).map((m) => (
            <button
              key={m.k}
              onClick={() => onChange({ llmMode: m.k })}
              className={`rounded-lg border px-2 py-2 ${
                settings.llmMode === m.k
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700/60 text-slate-400"
              }`}
            >
              <span className="block text-[12px] font-medium">{m.label}</span>
              <span className="text-[10px] text-slate-500">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Selected model */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/80">Active model</p>
        {selected ? (
          <>
            <p className="mt-1 text-[13px] text-slate-100">{selected.name}</p>
            <p className="truncate font-mono text-[10px] text-slate-500">{selected.id}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Tag free={selected.isFree}>{selected.isFree ? "FREE" : "PAID"}</Tag>
              <Tag>{ctxLabel(selected.contextLength)} ctx</Tag>
              <Tag>in {pricePerM(selected.promptPrice)}/M</Tag>
              <Tag>out {pricePerM(selected.completionPrice)}/M</Tag>
            </div>
          </>
        ) : (
          <p className="mt-1 text-[12px] text-slate-500">
            None selected — the on-device brain handles everything.
          </p>
        )}
        {settings.openrouterModel && (
          <button
            onClick={() => onChange({ openrouterModel: "" })}
            className="mt-2 text-[11px] text-slate-400 underline"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Catalogue header + refresh */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-700/50 pt-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
            Model catalogue
          </p>
          <p className="truncate text-[10px] text-slate-500">
            {counts.total} models · {counts.free} free · {counts.paid} paid · updated{" "}
            {timeAgo(fetchedAt)}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="shrink-0 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-[11px] font-medium text-cyan-100 disabled:opacity-50"
        >
          <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>⟳</span>{" "}
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {refreshMsg && (
        <p className="rounded-lg border border-cyan-400/30 bg-cyan-400/5 px-2.5 py-2 text-[11px] text-cyan-100">
          {refreshMsg}
        </p>
      )}

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-1.5">
          {(["all", "free", "paid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTier(t);
                setLimit(40);
              }}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] capitalize ${
                tier === t
                  ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700/60 text-slate-400"
              }`}
            >
              {t === "all" ? `All ${counts.total}` : t === "free" ? `🆓 Free ${counts.free}` : `💳 Paid ${counts.paid}`}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setLimit(40);
            }}
            className="w-32 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
          >
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-28 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
          >
            <option value="new">Newest</option>
            <option value="cheap">Cheapest</option>
            <option value="context">Context</option>
            <option value="name">A–Z</option>
          </select>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(40);
            }}
            placeholder="Search…"
            className="min-w-0 flex-1 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Model list */}
      <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
        {loading && (
          <p className="py-6 text-center text-[11px] text-slate-500">Loading catalogue…</p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-[11px] text-slate-500">
              {modelList.length === 0
                ? "No models cached yet."
                : "No models match those filters."}
            </p>
            {modelList.length === 0 && (
              <button onClick={refresh} className="mt-2 text-[11px] text-cyan-300 underline">
                Fetch from OpenRouter
              </button>
            )}
          </div>
        )}
        {filtered.slice(0, limit).map((m) => {
          const on = settings.openrouterModel === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange({ openrouterModel: m.id })}
              className={`w-full rounded-xl border p-2.5 text-left transition ${
                on
                  ? "border-cyan-400/70 bg-cyan-400/10"
                  : "border-slate-700/50 bg-slate-950/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-100">
                  {m.name}
                </span>
                {on && <span className="shrink-0 text-[10px] text-cyan-300">✓</span>}
              </div>
              <p className="truncate font-mono text-[10px] text-slate-500">{m.id}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Tag free={m.isFree}>{m.isFree ? "FREE" : pricePerM(m.promptPrice) + "/M in"}</Tag>
                <Tag>{ctxLabel(m.contextLength)} ctx</Tag>
                {m.modalities.includes("image") && <Tag>👁 vision</Tag>}
              </div>
            </button>
          );
        })}
        {filtered.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 60)}
            className="w-full rounded-xl border border-slate-700/60 py-2.5 text-[11px] text-slate-300"
          >
            Show {Math.min(60, filtered.length - limit)} more of {filtered.length}
          </button>
        )}
      </div>
    </section>
  );
}

function Tag({ children, free }: { children: React.ReactNode; free?: boolean }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] ${
        free === true
          ? "bg-emerald-500/20 text-emerald-200"
          : free === false
            ? "bg-amber-500/15 text-amber-200"
            : "bg-slate-800 text-slate-400"
      }`}
    >
      {children}
    </span>
  );
}
