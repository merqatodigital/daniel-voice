"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ENGINE_INFO,
  catalogFor,
  DEFAULT_VOICE,
  type CatalogVoice,
  type VoiceEngine,
} from "@/lib/tts/catalog";
import {
  ensureKokoro,
  isKokoroLoaded,
  kokoroCachedFlag,
  piperStoredVoices,
  setKokoroDtype,
  speak,
  stopAudio,
  type TtsStatus,
} from "@/lib/tts/engine";
import { useVoices } from "@/lib/useSpeech";
import { useToast } from "@/components/Toast";
import type { ClientSettings } from "@/lib/clientTypes";

type Props = {
  settings: ClientSettings;
  onChange: (patch: Partial<ClientSettings>) => void;
};

type VoiceDl =
  | { state: "idle" }
  | { state: "downloading"; pct?: number; label?: string }
  | { state: "error"; message: string };

const ENGINES: VoiceEngine[] = ["system", "kokoro", "piper"];
type Gender = "all" | "male" | "female";

const SAMPLE = (name: string) =>
  `Hi, I'm ${name}. Your personal assistant. How can I help you today?`;

function estimateSeconds(text: string, ratePct: number) {
  return Math.max(0.5, text.length / 14 / (ratePct / 100));
}

export default function VoiceLab({ settings, onChange }: Props) {
  const systemVoices = useVoices();
  const { toast, show } = useToast();

  const [view, setView] = useState<"female" | "male">("female");
  const [query, setQuery] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewSecs, setPreviewSecs] = useState<number | null>(null);
  const [status, setStatus] = useState<TtsStatus>({ stage: "idle" });
  const [piperStored, setPiperStored] = useState<Set<string>>(new Set());
  const [kokoroReady, setKokoroReady] = useState(false);
  const [dl, setDl] = useState<Record<string, VoiceDl>>({});

  const engine = settings.voiceEngine;
  const info = ENGINE_INFO[engine];

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await piperStoredVoices();
      if (!alive) return;
      setPiperStored(new Set(stored));
      setKokoroReady(isKokoroLoaded() || kokoroCachedFlag());
    })();
    return () => {
      alive = false;
    };
  }, []);

  const download = useCallback(
    async (v: CatalogVoice) => {
      setDl((d) => ({ ...d, [v.id]: { state: "downloading", pct: 0 } }));
      const onStatus = (s: TtsStatus) => {
        if (s.stage === "loading")
          setDl((d) => ({ ...d, [v.id]: { state: "downloading", pct: s.pct, label: s.label } }));
      };
      try {
        if (v.engine === "piper") {
          const { piperDownload } = await import("@/lib/tts/engine");
          await piperDownload(v.id, onStatus);
          setPiperStored(new Set(await piperStoredVoices()));
        } else {
          await ensureKokoro(onStatus);
          setKokoroReady(true);
        }
        setDl((d) => {
          const n = { ...d };
          delete n[v.id];
          return n;
        });
        show(`${v.name} is ready.`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download failed";
        setDl((d) => ({ ...d, [v.id]: { state: "error", message } }));
      }
    },
    [show],
  );

  const preview = useCallback(
    async (id: string, name: string) => {
      if (previewing) {
        stopAudio();
        setPreviewing(null);
        setPreviewSecs(null);
        return;
      }
      const text = SAMPLE(name);
      setPreviewing(id);
      setPreviewSecs(estimateSeconds(text, settings.voiceRate));
      try {
        if (engine === "kokoro" && !kokoroReady) {
          setStatus({ stage: "loading", label: "Loading Kokoro…" });
          await ensureKokoro((s) => setStatus(s));
          setKokoroReady(true);
        }
        await speak({
          engine,
          voiceId: id,
          voiceURI: engine === "system" ? id : undefined,
          lang: engine === "system" ? undefined : undefined,
          gender: settings.voiceGender,
          rate: settings.voiceRate,
          pitch: settings.voicePitch,
          text,
          onStatus: (s) => setStatus(s),
        });
      } finally {
        setPreviewing(null);
        setPreviewSecs(null);
        setStatus({ stage: "idle" });
      }
    },
    [previewing, engine, settings, kokoroReady],
  );

  const busy = status.stage === "loading" || previewing !== null;
  const activeId = engine === "system" ? (settings.voiceURI || "auto") : settings.voiceId || DEFAULT_VOICE[engine];

  const recommendedVoices = useMemo(() => {
    const all = catalogFor(engine === "system" ? "kokoro" : engine);
    return all.filter(v => v.featured);
  }, [engine]);

  const filteredVoices = useMemo(() => {
    const all = catalogFor(engine === "system" ? "kokoro" : engine);
    const g = view;
    const q = query.toLowerCase();
    return all.filter(v => {
      if (g === "male" && v.gender !== "male") return false;
      if (g === "female" && v.gender !== "female") return false;
      if (q && !`${v.name} ${v.langLabel} ${v.accent ?? ""} ${v.note ?? ""} ${v.id}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [engine, view, query]);

  return (
    <section className="glass relative rounded-2xl p-4 space-y-4">
      {toast}
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Voice</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Choose your assistant's voice. Audio plays from your device.
        </p>
      </div>

      {/* Engine picker */}
      <div className="space-y-2" role="radiogroup" aria-label="Voice engine">
        {ENGINES.map((e) => {
          const i = ENGINE_INFO[e];
          const on = engine === e;
          return (
            <button
              key={e}
              role="radio"
              aria-checked={on}
              onClick={() => {
                onChange({ voiceEngine: e, voiceId: e === "system" ? "" : DEFAULT_VOICE[e] });
                if (e === "kokoro") void ensureKokoro().catch(() => {});
              }}
              className={`w-full rounded-xl border p-3 text-left transition ${
                on ? "border-cyan-400/70 bg-cyan-400/10" : "border-slate-700/60 bg-slate-950/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-100">
                  {i.emoji} {i.label}
                </span>
                <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                  {i.download}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">{i.blurb}</p>
            </button>
          );
        })}
      </div>

      {engine === "kokoro" && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Quality</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                kokoroReady ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-400"
              }`}
            >
              {kokoroReady ? "cached" : "not downloaded"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["q8", "fp32"] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setKokoroDtype(d);
                  onChange({ kokoroDtype: d });
                  setKokoroReady(isKokoroLoaded() || kokoroCachedFlag());
                }}
                className={`rounded-lg border px-2 py-2 text-left text-[11px] ${
                  settings.kokoroDtype === d
                    ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-700/60 text-slate-400"
                }`}
              >
                <span className="block text-[12px] font-medium">{d === "q8" ? "q8 · Fast" : "fp32 · Best"}</span>
                <span className="text-[10px] text-slate-500">{d === "q8" ? "86 MB, quick on phones" : "326 MB, richest"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Voice list */}
      {engine !== "system" && (
        <>
          <div className="flex gap-1.5">
            {(["female", "male"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setView(g)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] capitalize ${
                  view === g ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-slate-700/60 text-slate-400"
                }`}
              >
                {g === "female" ? "♀ Female" : "♂ Male"}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              aria-label="Search voices"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="min-w-0 flex-1 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
            />
          </div>

          {status.stage === "error" && status.message !== "no-voice" && (
            <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-[11px] text-amber-200">
              {status.message}
            </p>
          )}

          <div
            className="space-y-1.5 overflow-y-auto pr-1 pb-2"
            style={{ maxHeight: "calc(100dvh - 30rem)" }}
          >
            <p className="text-[10px] uppercase tracking-widest text-amber-300/80">★ Recommended</p>
            {recommendedVoices
              .filter(v => v.gender === view)
              .map(v => (
                <VoiceRow
                  key={v.id}
                  name={v.name}
                  sub={`${v.langLabel}${v.accent ? ` · ${v.accent}` : ""}${v.note ? ` · ${v.note}` : ""}`}
                  sizeMB={v.sizeMB}
                  selected={settings.voiceId === v.id}
                  previewing={previewing === v.id}
                  previewSecs={previewing === v.id ? previewSecs : null}
                  cached={isKokoroLoaded() || kokoroCachedFlag()}
                  dl={dl[v.id] ?? { state: "idle" }}
                  featured
                  onPreview={() => void preview(v.id, v.name)}
                  onDownload={() => void download(v)}
                  onSelect={() => onChange({ voiceId: v.id, voiceGender: v.gender })}
                />
              ))}

            <p className="pt-2 text-[10px] uppercase tracking-widest text-slate-500">More voices</p>
            {filteredVoices
              .filter(v => !v.featured)
              .map(v => (
                <VoiceRow
                  key={v.id}
                  name={v.name}
                  sub={`${v.langLabel}${v.accent ? ` · ${v.accent}` : ""}${v.note ? ` · ${v.note}` : ""}`}
                  sizeMB={v.sizeMB}
                  selected={settings.voiceId === v.id}
                  previewing={previewing === v.id}
                  previewSecs={previewing === v.id ? previewSecs : null}
                  cached={isKokoroLoaded() || kokoroCachedFlag()}
                  dl={dl[v.id] ?? { state: "idle" }}
                  onPreview={() => void preview(v.id, v.name)}
                  onDownload={() => void download(v)}
                  onSelect={() => onChange({ voiceId: v.id, voiceGender: v.gender })}
                />
              ))}
          </div>
        </>
      )}

      {/* System voices */}
      {engine === "system" && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">
            Device voices ({systemVoices.length}): system default, works everywhere instantly.
          </p>
          {systemVoices.slice(0, 6).map(v => (
            <div key={v.uri} className="rounded-xl border border-slate-700/50 bg-slate-950/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-slate-100">{v.name}</span>
                  <span className="ml-2 text-[10px] text-slate-500">{v.lang}</span>
                </div>
                <button
                  onClick={() => onChange({ voiceURI: v.uri })}
                  className={`rounded-lg px-2 py-1 text-[10px] ${
                    settings.voiceURI === v.uri ? "bg-cyan-400/20 text-cyan-100" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {settings.voiceURI === v.uri ? "✓ Selected" : "Select"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Speed/Pitch */}
      <div className="space-y-3 border-t border-slate-700/50 pt-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Speed — {settings.voiceRate}%</span>
          <input
            type="range"
            aria-label="Speech speed"
            min={60}
            max={160}
            value={settings.voiceRate}
            onChange={(e) => onChange({ voiceRate: Number(e.target.value) })}
            className="mt-1.5 w-full accent-cyan-400"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Pitch — {settings.voicePitch}%</span>
          <input
            type="range"
            aria-label="Speech pitch"
            min={50}
            max={160}
            value={settings.voicePitch}
            onChange={(e) => onChange({ voicePitch: Number(e.target.value) })}
            className="mt-1.5 w-full accent-cyan-400"
          />
        </label>
        <div className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-3">
          <span className="text-sm text-slate-200">Speak replies aloud</span>
          <button
            role="switch"
            aria-checked={settings.speakReplies}
            onClick={() => onChange({ speakReplies: !settings.speakReplies })}
            className={`h-7 w-12 rounded-full transition ${settings.speakReplies ? "bg-cyan-500" : "bg-slate-700"}`}
          >
            <span className={`block h-6 w-6 translate-x-0.5 rounded-full bg-white transition ${settings.speakReplies ? "translate-x-[22px]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Test button */}
      <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-20 -mx-4 -mb-4 border-t border-cyan-400/15 bg-[#0b1524]/95 px-4 pb-3 pt-3 backdrop-blur-xl">
        <button
          disabled={busy}
          aria-label="Test voice"
          onClick={() => void preview(activeId, settings.agentName)}
          className="w-full rounded-xl border border-cyan-400/40 bg-cyan-400/10 py-2.5 text-sm font-medium text-cyan-100 disabled:opacity-50"
        >
          {busy
            ? previewSecs
              ? `Playing… ~${previewSecs.toFixed(1)}s`
              : status.stage === "loading"
                ? (status.label ?? "Loading…")
                : "Generating…"
            : "▶ Test voice"}
        </button>
      </div>
    </section>
  );
}

function VoiceRow({
  name,
  sub,
  sizeMB,
  selected,
  previewing,
  previewSecs,
  cached,
  dl,
  featured,
  onPreview,
  onDownload,
  onSelect,
}: {
  name: string;
  sub: string;
  sizeMB?: number;
  selected: boolean;
  previewing: boolean;
  previewSecs: number | null;
  cached: boolean;
  dl: VoiceDl;
  featured?: boolean;
  onPreview: () => void;
  onDownload?: () => void;
  onSelect: () => void;
}) {
  const downloading = dl.state === "downloading";
  const failed = dl.state === "error";

  return (
    <div
      role="option"
      aria-selected={selected}
      className={`rounded-xl border px-3 py-2 transition ${
        selected ? "border-cyan-400/60 bg-cyan-400/10" : failed ? "border-rose-400/40 bg-rose-950/20" : "border-slate-700/50 bg-slate-950/30"
      }`}
    >
      <div className="flex items-center gap-2">
        {downloading ? (
          <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
        ) : (
          <button
            onClick={onPreview}
            aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name}`}
            className="w-6 shrink-0 text-center text-cyan-300"
          >
            {previewing ? "■" : "▶"}
          </button>
        )}
        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] text-slate-100">{name}</span>
            {featured && <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[9px] text-amber-200">★</span>}
          </div>
          <div className="truncate text-[10px] text-slate-500">{sub}</div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {selected && <span className="text-[10px] text-cyan-300">✓</span>}
          {previewing && previewSecs !== null && (
            <span className="text-[9px] text-cyan-300/80">~{previewSecs.toFixed(1)}s</span>
          )}
          {!previewing && (
            <span className={`rounded-full px-1.5 text-[9px] ${cached ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-500"}`}>
              {cached ? "cached" : "download"}
            </span>
          )}
        </div>
      </div>
      {downloading && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full bg-cyan-400 transition-all ${dl.pct === undefined ? "w-1/3 animate-pulse" : ""}`}
              style={dl.pct !== undefined ? { width: `${Math.max(3, dl.pct)}%` } : undefined}
            />
          </div>
        </div>
      )}
      {failed && (
        <p className="mt-1.5 text-[10px] text-rose-300">
          Failed. <button onClick={onDownload} className="underline">Retry</button>
        </p>
      )}
    </div>
  );
}
