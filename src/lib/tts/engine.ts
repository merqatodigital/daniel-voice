import { DEFAULT_VOICE } from "./catalog";
import type { VoiceEngine } from "./catalog";

export type TtsStatus =
  | { stage: "idle" }
  | { stage: "loading"; label: string; pct?: number }
  | { stage: "playing" }
  | { stage: "error"; message: string };

export type SpeakOptions = {
  engine: VoiceEngine;
  /** OSS voice id (piper / kokoro) */
  voiceId: string;
  /** System voice URI (engine === "system") */
  voiceURI?: string;
  /** Preferred language for system voices when no URI is pinned, e.g. "es-ES". */
  lang?: string;
  gender: "male" | "female";
  rate: number; // 100 = normal
  pitch: number; // 100 = normal
  text: string;
  onStatus?: (s: TtsStatus) => void;
};

/* ------------------------------------------------------------------ */
/* Shared audio element                                                */
/* ------------------------------------------------------------------ */

let audioEl: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

function getAudioEl() {
  if (typeof document === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
  }
  return audioEl;
}

function playBlob(blob: Blob, playbackRate: number) {
  return new Promise<void>((resolve, reject) => {
    const el = getAudioEl();
    if (!el) return resolve();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    el.src = objectUrl;
    el.playbackRate = Math.min(2, Math.max(0.5, playbackRate));
    el.onended = () => resolve();
    el.onerror = () => reject(new Error("audio playback failed"));
    void el.play().catch(reject);
  });
}

/** iOS Safari refuses to play audio that isn't descended from a user gesture.
 *  Call this once from a real tap so later programmatic playback is allowed. */
let primed = false;
export function primeAudio() {
  if (primed || typeof document === "undefined") return;
  primed = true;
  try {
    const el = getAudioEl();
    if (!el) return;
    const silent = encodeWav(new Float32Array(1), 24000);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(silent);
    el.src = objectUrl;
    el.muted = true;
    void el
      .play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      })
      .catch(() => {
        /* priming is best-effort */
      });
  } catch {
    /* ignore */
  }
}

export function stopAudio() {
  const el = getAudioEl();
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/* ------------------------------------------------------------------ */
/* WAV encoding helper (fallback if RawAudio.toBlob is unavailable)    */
/* ------------------------------------------------------------------ */

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

/* ------------------------------------------------------------------ */
/* Kokoro 82M (Apache-2.0)                                             */
/* ------------------------------------------------------------------ */

type KokoroLike = {
  generate: (text: string, opts: { voice: string; speed?: number }) => Promise<{
    audio: Float32Array;
    sampling_rate: number;
    toBlob?: () => Blob;
    toWav?: () => Blob;
  }>;
};

let kokoroPromise: Promise<KokoroLike> | null = null;
let kokoroReady = false;

let kokoroDtype = "q8";

export function setKokoroDtype(dtype: "q8" | "fp32") {
  if (dtype !== kokoroDtype) {
    kokoroDtype = dtype;
    kokoroPromise = null; // force a reload with the new precision
    kokoroReady = false;
  }
}

/** True once the Kokoro model is resident in memory (all 54 voices usable). */
export function isKokoroLoaded() {
  return kokoroReady;
}

/** Whether Kokoro has previously been fetched into the browser cache. */
export function kokoroCachedFlag(): boolean {
  try {
    return localStorage.getItem(`jarvis.kokoro.cached.${kokoroDtype}`) === "1";
  } catch {
    return false;
  }
}

/** Public loader for the settings UI (download without speaking). */
export function ensureKokoro(onStatus?: (s: TtsStatus) => void) {
  return loadKokoro(onStatus);
}

function loadKokoro(
  onStatus?: (s: TtsStatus) => void,
): Promise<KokoroLike> {
  if (kokoroPromise) return kokoroPromise;
  kokoroPromise = (async () => {
    const mod = (await import("kokoro-js")) as unknown as {
      KokoroTTS: {
        from_pretrained: (
          id: string,
          opts: {
            dtype: string;
            device: string;
            progress_callback?: (p: {
              status: string;
              file?: string;
              progress?: number;
              loaded?: number;
              total?: number;
            }) => void;
          },
        ) => Promise<KokoroLike>;
      };
    };
    const wantsWebGpu =
      kokoroDtype === "fp32" && typeof navigator !== "undefined" && "gpu" in navigator;
    const tts = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: kokoroDtype,
      device: wantsWebGpu ? "webgpu" : "wasm",
      progress_callback: (p) => {
        const pct = p.progress ?? (p.total ? (p.loaded ?? 0) / p.total : undefined);
        onStatus?.({
          stage: "loading",
          label: p.file ? `Kokoro · ${p.file}` : "Kokoro 82M",
          pct: pct !== undefined ? Math.round(pct) : undefined,
        });
      },
    });
    kokoroReady = true;
    try {
      localStorage.setItem(`jarvis.kokoro.cached.${kokoroDtype}`, "1");
    } catch {
      /* private mode */
    }
    return tts;
  })().catch((err) => {
    kokoroPromise = null;
    kokoroReady = false;
    throw err;
  });
  return kokoroPromise;
}

/* ------------------------------------------------------------------ */
/* Piper (MIT)                                                         */
/* ------------------------------------------------------------------ */

type PiperLike = {
  predict: (
    config: { text: string; voiceId: string },
    cb?: (p: { url: string; total: number; loaded: number }) => void,
  ) => Promise<Blob>;
  stored: () => Promise<string[]>;
  download: (
    voiceId: string,
    cb?: (p: { url: string; total: number; loaded: number }) => void,
  ) => Promise<void>;
  remove: (voiceId: string) => Promise<void>;
};

let piperPromise: Promise<PiperLike> | null = null;

function loadPiper(): Promise<PiperLike> {
  if (piperPromise) return piperPromise;
  piperPromise = (async () => {
    const mod = (await import("@mintplex-labs/piper-tts-web")) as unknown as PiperLike;
    return mod;
  })().catch((err) => {
    piperPromise = null;
    throw err;
  });
  return piperPromise;
}

export async function piperStoredVoices(): Promise<string[]> {
  try {
    const mod = await loadPiper();
    return await mod.stored();
  } catch {
    return [];
  }
}

export async function piperRemoveVoice(id: string) {
  try {
    const mod = await loadPiper();
    await mod.remove(id);
  } catch {
    /* ignore */
  }
}

export async function piperDownload(
  id: string,
  onStatus?: (s: TtsStatus) => void,
) {
  const mod = await loadPiper();
  await mod.download(id, (p) => {
    onStatus?.({
      stage: "loading",
      label: `Piper · ${p.url.split("/").pop() ?? "model"}`,
      pct: p.total ? Math.round((p.loaded / p.total) * 100) : undefined,
    });
  });
}

/* ------------------------------------------------------------------ */
/* System (Web Speech API)                                             */
/* ------------------------------------------------------------------ */

const FEMALE_HINTS = [
  "female","woman","samantha","victoria","karen","moira","tessa","fiona","serena","allison",
  "ava","susan","zira","hazel","uk english female","us english","amelie","joana","kate","emma",
  "sofia","lucy","nicky","aria","jenny","libby","sonia","natasha","clara","alice","google uk english female",
];
const MALE_HINTS = [
  "male","man","daniel","alex","fred","tom","oliver","aaron","david","mark","george","james",
  "uk english male","rishi","arthur","gordon","lee","ryan","guy","brian","eric","liam","jarvis",
  "reed","albert","bruce",
];

export function guessGender(name: string): "male" | "female" | "unknown" {
  const n = name.toLowerCase();
  if (FEMALE_HINTS.some((h) => n.includes(h))) return "female";
  if (MALE_HINTS.some((h) => n.includes(h))) return "male";
  return "unknown";
}

export type SystemPick = {
  voice: SpeechSynthesisVoice | null;
  /** How confident the gender match is: exact hint, language-only, or nothing. */
  match: "exact" | "language" | "auto" | "none";
};

/**
 * Choose a system voice for a language + gender. Prefers an explicit gender
 * hint in the voice name; falls back to any voice of that language (labelled
 * "auto"); never silently guesses the wrong gender.
 */
export function pickSystemVoice(
  all: SpeechSynthesisVoice[],
  lang: string | undefined,
  gender: "male" | "female",
): SystemPick {
  if (!all.length) return { voice: null, match: "none" };
  const norm = (l: string) => l.toLowerCase().replace("_", "-");
  const want = lang && lang !== "all" ? norm(lang) : "";
  const base = want.split("-")[0];

  let pool = want ? all.filter((v) => norm(v.lang) === want) : [];
  if (!pool.length && base) pool = all.filter((v) => norm(v.lang).startsWith(base));
  if (!pool.length && !want) pool = all.filter((v) => norm(v.lang).startsWith("en"));
  if (!pool.length) return { voice: null, match: "none" };

  const exact = pool.find((v) => guessGender(v.name) === gender);
  if (exact) return { voice: exact, match: "exact" };
  const unknown = pool.find((v) => guessGender(v.name) === "unknown");
  if (unknown) return { voice: unknown, match: "auto" };
  return { voice: pool[0], match: "language" };
}

function speakSystem(opts: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(opts.text.replace(/[*_`#]/g, "").slice(0, 900));
    const all = synth.getVoices();
    let chosen = opts.voiceURI ? all.find((v) => v.voiceURI === opts.voiceURI) : undefined;
    if (!chosen) {
      const pick = pickSystemVoice(all, opts.lang, opts.gender);
      chosen = pick.voice ?? all[0];
      if (!pick.voice) opts.onStatus?.({ stage: "error", message: "no-voice" });
    }
    if (chosen) u.voice = chosen;
    u.rate = Math.max(0.1, Math.min(10, opts.rate / 100));
    u.pitch = Math.max(0, Math.min(2, (opts.pitch / 100) * (opts.gender === "female" ? 1.15 : 0.85)));
    u.onend = () => resolve();
    u.onerror = () => resolve();
    // Chrome sometimes fires neither event; bail out after a safe window.
    const est = Math.min(60000, 1200 + opts.text.length * 90);
    setTimeout(resolve, est);
    synth.speak(u);
  });
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function speak(opts: SpeakOptions): Promise<void> {
  const text = opts.text.replace(/[*_`#]/g, "").replace(/\n+/g, ". ").trim();
  if (!text) return;
  const status = opts.onStatus ?? (() => {});

  if (opts.engine === "system") {
    status({ stage: "playing" });
    await speakSystem({ ...opts, text });
    status({ stage: "idle" });
    return;
  }

  const voiceId = opts.voiceId || DEFAULT_VOICE[opts.engine];

  try {
    let blob: Blob;
    if (opts.engine === "kokoro") {
      status({ stage: "loading", label: "Loading Kokoro 82M…" });
      const tts = await loadKokoro(status);
      status({ stage: "loading", label: "Synthesising…" });
      const out = await tts.generate(text, { voice: voiceId, speed: opts.rate / 100 });
      blob =
        typeof out.toBlob === "function"
          ? out.toBlob()
          : typeof out.toWav === "function"
            ? out.toWav()
            : encodeWav(out.audio, out.sampling_rate ?? 24000);
    } else {
      status({ stage: "loading", label: "Preparing Piper…" });
      const mod = await loadPiper();
      status({ stage: "loading", label: "Piper · synthesising…" });
      blob = await mod.predict({ text, voiceId }, (p) => {
        status({
          stage: "loading",
          label: p.url.includes("onnx.json") || p.url.endsWith(".json")
            ? "Piper · downloading voice"
            : "Piper · generating",
          pct: p.total ? Math.round((p.loaded / p.total) * 100) : undefined,
        });
      });
    }
    status({ stage: "playing" });
    await playBlob(blob, opts.rate / 100);
    status({ stage: "idle" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status({ stage: "error", message: `${opts.engine} failed — using device voice. (${message})` });
    await speakSystem({ ...opts, text });
    status({ stage: "idle" });
  }
}
