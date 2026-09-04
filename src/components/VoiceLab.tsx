"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ENGINE_INFO,
  catalogFor,
  catalogSource,
  groupByLanguage,
  loadCatalog,
  DEFAULT_VOICE,
  type CatalogVoice,
  type VoiceEngine,
} from "@/lib/tts/catalog";
import {
  ensureKokoro,
  isKokoroLoaded,
  kokoroCachedFlag,
  pickSystemVoice,
  piperDownload,
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

const ENGINES: VoiceEngine[] = ["system", "piper", "kokoro"];
type View = "recommended" | "language" | "all";
type Gender = "all" | "male" | "female";

const SAMPLE = (name: string) =>
  `Systems online. This is ${name}, your personal assistant. Everything you hear is generated on your device.`;

/** Rough spoken-duration estimate: ~14 chars/sec at 100% rate. */
function estimateSeconds(text: string, ratePct: number) {
  return Math.max(0.5, text.length / 14 / (ratePct / 100));
}

/* ---------------- per-voice download bookkeeping ---------------- */

type VoiceDl =
  | { state: "idle" }
  | { state: "downloading"; pct?: number; label?: string }
  | { state: "error"; message: string };

const LAST_USED_KEY = "tala.voice.lastUsed";
type LastUsed = Partial<Record<VoiceEngine, string>>;
function readLastUsed(): LastUsed {
  try {
    return JSON.parse(localStorage.getItem(LAST_USED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export default function VoiceLab({ settings, onChange }: Props) {
  const systemVoices = useVoices();
  const { toast, show } = useToast();

  const [catalogReady, setCatalogReady] = useState(false);
  const [view, setView] = useState<View>("recommended");
  const [gender, setGender] = useState<Gender>(settings.voiceGender);
  const [lang, setLang] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["en-US"]));

  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewSecs, setPreviewSecs] = useState<number | null>(null);
  const [status, setStatus] = useState<TtsStatus>({ stage: "idle" });

  const [piperStored, setPiperStored] = useState<Set<string>>(new Set());
  const [kokoroReady, setKokoroReady] = useState(false);
  const [dl, setDl] = useState<Record<string, VoiceDl>>({});
  const [lastUsed, setLastUsed] = useState<LastUsed>({});
  const prevEngine = useRef<VoiceEngine>(settings.voiceEngine);

  const engine = settings.voiceEngine;
  const info = ENGINE_INFO[engine];

  /* ---- boot: catalogue + cache state, before rendering the gallery ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadCatalog();
      const stored = await piperStoredVoices();
      if (!alive) return;
      setPiperStored(new Set(stored));
      setKokoroReady(isKokoroLoaded() || kokoroCachedFlag());
      setLastUsed(readLastUsed());
      setCatalogReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---- engine switch: reset to default + toast (Prompt 4.3) ---- */
  useEffect(() => {
    if (prevEngine.current === engine) return;
    prevEngine.current = engine;
    if (engine === "system") {
      show(`Switched to device voices — ${systemVoices.length} installed.`);
      return;
    }
    const list = catalogFor(engine);
    const valid = list.some((v) => v.id === settings.voiceId);
    if (!valid) onChange({ voiceId: DEFAULT_VOICE[engine] });
    show(`Switched to ${ENGINE_INFO[engine].label} — ${list.length} voices available.`, "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /* ---- remember last-used per engine (Prompt 5.3) ---- */
  const rememberUse = useCallback(
    (id: string) => {
      const next = { ...readLastUsed(), [engine]: id };
      try {
        localStorage.setItem(LAST_USED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setLastUsed(next);
    },
    [engine],
  );

  const isCached = useCallback(
    (v: CatalogVoice) => (v.engine === "piper" ? piperStored.has(v.id) : kokoroReady),
    [piperStored, kokoroReady],
  );

  /* ---- download a single voice with row-scoped progress (Prompt 1.2/1.3) ---- */
  const download = useCallback(
    async (v: CatalogVoice) => {
      setDl((d) => ({ ...d, [v.id]: { state: "downloading", pct: 0 } }));
      const onStatus = (s: TtsStatus) => {
        if (s.stage === "loading")
          setDl((d) => ({ ...d, [v.id]: { state: "downloading", pct: s.pct, label: s.label } }));
      };
      try {
        if (v.engine === "piper") {
          await piperDownload(v.id, onStatus);
          setPiperStored((s) => new Set(s).add(v.id));
        } else {
          await ensureKokoro(onStatus);
          setKokoroReady(true);
        }
        setDl((d) => {
          const n = { ...d };
          delete n[v.id];
          return n;
        });
        show(`${v.name} is ready offline.`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download failed";
        setDl((d) => ({ ...d, [v.id]: { state: "error", message } }));
      }
    },
    [show],
  );

  /* ---- preview (Prompt 4.2 duration hint, Prompt 3.3 no-voice toast) ---- */
  const preview = useCallback(
    async (id: string, name: string, voiceLang?: string) => {
      if (previewing) {
        stopAudio();
        setPreviewing(null);
        setPreviewSecs(null);
        return;
      }
      const text = SAMPLE(name);
      setPreviewing(id);
      setPreviewSecs(estimateSeconds(text, settings.voiceRate));
      let noVoice = false;
      try {
        await speak({
          engine,
          voiceId: id,
          voiceURI: engine === "system" ? id : undefined,
          lang: engine === "system" ? (voiceLang ?? (lang !== "all" ? lang : undefined)) : undefined,
          gender: settings.voiceGender,
          rate: settings.voiceRate,
          pitch: settings.voicePitch,
          text,
          onStatus: (s) => {
            if (s.stage === "error" && s.message === "no-voice") {
              noVoice = true;
              return;
            }
            setStatus(s);
            if (s.stage === "error") {
              const v = catalogFor(engine === "system" ? "piper" : engine).find((x) => x.id === id);
              if (v) setDl((d) => ({ ...d, [id]: { state: "error", message: s.message } }));
            }
          },
        });
        if (engine !== "system" && id) rememberUse(id);
        if (engine === "kokoro") setKokoroReady(isKokoroLoaded());
        if (engine === "piper") setPiperStored(new Set(await piperStoredVoices()));
      } finally {
        setPreviewing(null);
        setPreviewSecs(null);
        setStatus({ stage: "idle" });
        if (noVoice) show("No voice found for this language — try English.", "warn");
      }
    },
    [previewing, engine, lang, settings, rememberUse, show],
  );

  /* ---------------- derived lists ---------------- */

  const ossAll = useMemo(
    () => (engine === "system" || !catalogReady ? [] : catalogFor(engine)),
    [engine, catalogReady],
  );

  const ossFiltered = useMemo(() => {
    const q = query.toLowerCase();
    return ossAll.filter((v) => {
      if (gender !== "all" && v.gender !== gender) return false;
      if (lang !== "all" && v.lang !== lang) return false;
      if (q && !`${v.name} ${v.langLabel} ${v.accent ?? ""} ${v.note ?? ""} ${v.id}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [ossAll, gender, lang, query]);

  const featured = useMemo(() => ossFiltered.filter((v) => v.featured), [ossFiltered]);
  const grouped = useMemo(() => groupByLanguage(ossFiltered), [ossFiltered]);

  const languages = useMemo(() => {
    if (engine === "system") {
      return Array.from(new Set(systemVoices.map((v) => v.lang))).sort();
    }
    return groupByLanguage(ossAll).map((g) => g.lang);
  }, [engine, systemVoices, ossAll]);

  const langLabelOf = (code: string) =>
    engine === "system" ? code : (ossAll.find((v) => v.lang === code)?.langLabel ?? code);

  /* System list: language filter is now honoured (Prompt 3.1) */
  const systemList = useMemo(() => {
    const norm = (l: string) => l.toLowerCase().replace("_", "-");
    return systemVoices.filter((v) => {
      if (lang !== "all" && norm(v.lang) !== norm(lang) && !norm(v.lang).startsWith(norm(lang).split("-")[0]))
        return false;
      if (gender !== "all" && v.guessed !== gender && v.guessed !== "unknown") return false;
      if (query && !v.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [systemVoices, lang, gender, query]);

  /* What "Auto" would actually pick for the current language/gender (Prompt 3.2) */
  const autoPick = useMemo(() => {
    if (engine !== "system" || typeof window === "undefined" || !("speechSynthesis" in window))
      return null;
    return pickSystemVoice(window.speechSynthesis.getVoices(), lang, settings.voiceGender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, lang, settings.voiceGender, systemVoices]);

  const busy = status.stage === "loading" || previewing !== null;
  const activeId = engine === "system" ? settings.voiceURI : settings.voiceId || DEFAULT_VOICE[engine];

  /* ---------------- render helpers ---------------- */

  const renderOss = (v: CatalogVoice) => (
    <VoiceRow
      key={v.id}
      name={v.name}
      sub={`${v.langLabel}${v.accent ? ` · ${v.accent}` : ""}${v.note ? ` · ${v.note}` : ""}`}
      sizeMB={v.sizeMB}
      selected={settings.voiceId === v.id}
      previewing={previewing === v.id}
      previewSecs={previewing === v.id ? previewSecs : null}
      cached={isCached(v)}
      dl={dl[v.id] ?? { state: "idle" }}
      featured={v.featured}
      lastUsed={lastUsed[engine] === v.id}
      onPreview={() => void preview(v.id, v.name)}
      onDownload={() => void download(v)}
      onSelect={() => {
        onChange({ voiceId: v.id, voiceGender: v.gender });
        rememberUse(v.id);
      }}
    />
  );

  return (
    <section className="glass relative rounded-2xl p-4 space-y-4">
      {toast}
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-cyan-200 hud-text">Voice engine</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          All three are free and open source. Audio is generated on your device — nothing is sent to a server.
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
              aria-label={`${i.label} engine, ${i.download}`}
              onClick={() => onChange({ voiceEngine: e, voiceId: e === "system" ? "" : DEFAULT_VOICE[e] })}
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
              <p className="mt-1 text-[10px] uppercase tracking-wider text-emerald-400/80">{i.license}</p>
            </button>
          );
        })}
      </div>

      {engine === "kokoro" && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">Model precision</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                kokoroReady ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-400"
              }`}
            >
              {kokoroReady ? "↓ model cached" : "not downloaded"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["q8", "fp32"] as const).map((d) => (
              <button
                key={d}
                aria-pressed={settings.kokoroDtype === d}
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
                <span className="text-[10px] text-slate-500">{d === "q8" ? "86 MB, quick on phones" : "326 MB, richest audio"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View tabs (OSS engines) — Prompt 2.3 */}
      {engine !== "system" && (
        <div className="flex rounded-xl border border-slate-700/60 p-0.5" role="tablist" aria-label="Browse voices">
          {(
            [
              { k: "recommended", label: "Recommended" },
              { k: "language", label: "By language" },
              { k: "all", label: "All voices" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              role="tab"
              aria-selected={view === t.k}
              aria-label={`${t.label} view`}
              onClick={() => setView(t.k)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] ${
                view === t.k ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Secondary filters */}
      <div className="space-y-2">
        <div className="flex gap-1.5" role="group" aria-label="Filter by gender">
          {(["all", "male", "female"] as const).map((g) => (
            <button
              key={g}
              aria-pressed={gender === g}
              aria-label={g === "all" ? "All genders" : `${g} voices`}
              onClick={() => setGender(g)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] capitalize ${
                gender === g ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-slate-700/60 text-slate-400"
              }`}
            >
              {g === "all" ? "All" : g === "male" ? "♂ Male" : "♀ Female"}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(engine === "system" || view === "all") && (
            <select
              aria-label="Filter by language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-36 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none"
            >
              <option value="all">All languages</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {langLabelOf(l)}
                </option>
              ))}
            </select>
          )}
          <input
            aria-label="Search voices"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices…"
            className="min-w-0 flex-1 rounded-lg border border-cyan-400/20 bg-slate-950/70 px-2 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600"
          />
        </div>
      </div>

      {status.stage === "error" && status.message !== "no-voice" && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-[11px] text-amber-200">
          {status.message}
        </p>
      )}

      {/* ---------------- Gallery ---------------- */}
      <div
        className="space-y-1.5 overflow-y-auto pr-1 pb-2"
        style={{ maxHeight: "calc(100dvh - 22rem)" }}
        role="listbox"
        aria-label="Available voices"
      >
        {!catalogReady && engine !== "system" && (
          <p className="py-6 text-center text-[11px] text-slate-500">Checking which voices are cached…</p>
        )}

        {engine === "system" && (
          <>
            {systemVoices.length === 0 && (
              <p className="py-6 text-center text-[11px] text-slate-500">No device voices detected yet…</p>
            )}
            <VoiceRow
              name={
                autoPick?.voice
                  ? `Auto — ${autoPick.voice.name}`
                  : "Auto (best match)"
              }
              sub={
                autoPick?.voice
                  ? autoPick.match === "exact"
                    ? `${autoPick.voice.lang} · ${settings.voiceGender} match`
                    : `${autoPick.voice.lang} · gender unknown, labelled Auto`
                  : "No voice for this language"
              }
              selected={!settings.voiceURI}
              previewing={previewing === ""}
              previewSecs={previewing === "" ? previewSecs : null}
              cached
              dl={{ state: "idle" }}
              onPreview={() => void preview("", "Auto")}
              onSelect={() => onChange({ voiceURI: "" })}
            />
            {systemList.map((v) => (
              <VoiceRow
                key={v.uri}
                name={v.name}
                sub={`${v.lang} · ${v.guessed === "unknown" ? "auto" : v.guessed}`}
                selected={settings.voiceURI === v.uri}
                previewing={previewing === v.uri}
                previewSecs={previewing === v.uri ? previewSecs : null}
                cached
                dl={{ state: "idle" }}
                lastUsed={lastUsed.system === v.uri}
                onPreview={() => void preview(v.uri, v.name, v.lang)}
                onSelect={() => {
                  onChange({ voiceURI: v.uri });
                  const next = { ...readLastUsed(), system: v.uri };
                  try {
                    localStorage.setItem(LAST_USED_KEY, JSON.stringify(next));
                  } catch {
                    /* ignore */
                  }
                  setLastUsed(next);
                }}
              />
            ))}
            {systemVoices.length > 0 && systemList.length === 0 && (
              <p className="py-6 text-center text-[11px] text-slate-500">
                No device voices for {langLabelOf(lang)} — try English or another engine.
              </p>
            )}
          </>
        )}

        {engine !== "system" && catalogReady && (
          <>
            {/* Recommended — pinned (Prompt 2.1) */}
            {(view === "recommended" || view === "language") && featured.length > 0 && (
              <div className="sticky top-0 z-10 -mx-1 space-y-1.5 bg-[#0b1524]/95 px-1 pb-2 pt-0.5 backdrop-blur">
                <p className="text-[10px] uppercase tracking-widest text-amber-300/80">★ Recommended</p>
                {featured.map(renderOss)}
              </div>
            )}

            {view === "recommended" && featured.length === 0 && (
              <p className="py-6 text-center text-[11px] text-slate-500">
                No recommended voices match — try “All voices”.
              </p>
            )}

            {/* By language — collapsible (Prompt 2.2) */}
            {view === "language" &&
              grouped.map((g) => {
                const isOpen = open.has(g.lang);
                const rest = g.voices.filter((v) => !v.featured);
                if (!rest.length) return null;
                return (
                  <div key={g.lang} className="rounded-xl border border-slate-800/70">
                    <button
                      aria-expanded={isOpen}
                      aria-controls={`lang-${g.lang}`}
                      aria-label={`${g.label}, ${rest.length} voices`}
                      onClick={() =>
                        setOpen((s) => {
                          const n = new Set(s);
                          if (n.has(g.lang)) n.delete(g.lang);
                          else n.add(g.lang);
                          return n;
                        })
                      }
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <span className="text-[12px] text-slate-200">{g.label}</span>
                      <span className="flex items-center gap-2 text-[10px] text-slate-500">
                        {rest.length}
                        <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div id={`lang-${g.lang}`} className="space-y-1.5 px-1.5 pb-1.5">
                        {rest.map(renderOss)}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* All — flat */}
            {view === "all" && (
              <>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">
                  {ossFiltered.length} voices · catalogue: {catalogSource()}
                </p>
                {ossFiltered.map(renderOss)}
                {ossFiltered.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-slate-500">No voices match those filters.</p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Delivery controls */}
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
          <p className="mt-1 text-[10px] text-slate-500">
            {engine === "system" ? "Pitch applies to device voices." : "Pitch is fixed in the neural model; speed still applies."}
          </p>
        </label>

        <div className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-3">
          <span className="text-sm text-slate-200">Speak replies aloud</span>
          <button
            role="switch"
            aria-checked={settings.speakReplies}
            aria-label="Speak replies aloud"
            onClick={() => onChange({ speakReplies: !settings.speakReplies })}
            className={`h-7 w-12 rounded-full transition ${settings.speakReplies ? "bg-cyan-500" : "bg-slate-700"}`}
          >
            <span className={`block h-6 w-6 translate-x-0.5 rounded-full bg-white transition ${settings.speakReplies ? "translate-x-[22px]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Sticky test button (Prompt 5.2) — sits above the bottom nav */}
      <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-20 -mx-4 -mb-4 border-t border-cyan-400/15 bg-[#0b1524]/95 px-4 pb-3 pt-3 backdrop-blur-xl">
        <button
          disabled={busy}
          aria-label="Test the selected voice"
          onClick={() => void preview(activeId, settings.agentName)}
          className="w-full rounded-xl border border-cyan-400/40 bg-cyan-400/10 py-2.5 text-sm font-medium text-cyan-100 disabled:opacity-50"
        >
          {busy
            ? previewSecs
              ? `Playing… ~${previewSecs.toFixed(1)}s`
              : status.stage === "loading"
                ? (status.label ?? "Loading…")
                : "Generating…"
            : "▶ Test this voice"}
        </button>
        <p className="mt-1.5 text-center text-[10px] text-slate-500">
          {info.emoji} {info.label} · {info.license}
        </p>
      </div>
    </section>
  );
}

/* ================================================================== */

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
  lastUsed,
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
  lastUsed?: boolean;
  onPreview: () => void;
  onDownload?: () => void;
  onSelect: () => void;
}) {
  const downloading = dl.state === "downloading";
  const failed = dl.state === "error";
  const showDownload = !cached && !downloading && !!onDownload;

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={`${name}${cached ? ", cached" : ", not downloaded"}${selected ? ", selected" : ""}`}
      className={`rounded-xl border px-3 py-2 transition ${
        selected ? "border-cyan-400/60 bg-cyan-400/10" : failed ? "border-rose-400/40 bg-rose-950/20" : "border-slate-700/50 bg-slate-950/30"
      }`}
    >
      <div className="flex items-center gap-2">
        {showDownload || failed ? (
          <button
            onClick={onDownload}
            aria-label={failed ? `Retry download for ${name}` : `Download ${name}${sizeMB ? `, ${sizeMB} megabytes` : ""}`}
            className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${
              failed ? "bg-rose-500/25 text-rose-100" : "bg-cyan-500/20 text-cyan-100"
            }`}
          >
            {failed ? "↻ Retry" : `↓ ${sizeMB ? `${sizeMB} MB` : "Get"}`}
          </button>
        ) : downloading ? (
          <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" aria-hidden />
        ) : (
          <button
            onClick={onPreview}
            aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name}`}
            className="w-6 shrink-0 text-center text-cyan-300"
          >
            {previewing ? "■" : "▶"}
          </button>
        )}

        <button onClick={onSelect} aria-label={`Select ${name}`} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] text-slate-100">{name}</span>
            {featured && <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[9px] text-amber-200">Recommended</span>}
          </div>
          <div className="flex items-center gap-1.5 truncate text-[10px] text-slate-500">
            <span className="truncate">{sub}</span>
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {selected && <span className="text-[10px] text-cyan-300">✓</span>}
          {previewing && previewSecs !== null && (
            <span className="text-[9px] text-cyan-300/80">~{previewSecs.toFixed(1)}s</span>
          )}
          {!previewing && (
            <span
              className={`rounded-full px-1.5 text-[9px] ${
                cached ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-500"
              }`}
            >
              {cached ? "cached" : "download"}
            </span>
          )}
          {lastUsed && !selected && <span className="text-[9px] text-slate-400">✓ Used last</span>}
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
          <p className="mt-0.5 truncate text-[9px] text-slate-500">
            {dl.label ?? "Downloading…"}{dl.pct !== undefined ? ` · ${dl.pct}%` : ""}
          </p>
        </div>
      )}

      {failed && (
        <p className="mt-1.5 text-[10px] text-rose-300">
          Download failed. Tap to retry. <span className="text-rose-400/70">({dl.message.slice(0, 80)})</span>
        </p>
      )}
    </div>
  );
}
