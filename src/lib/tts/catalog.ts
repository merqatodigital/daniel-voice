export type VoiceEngine = "system" | "piper" | "kokoro";

export type CatalogVoice = {
  id: string;
  name: string;
  gender: "male" | "female";
  lang: string; // BCP-47-ish
  langLabel: string;
  accent?: string;
  note?: string;
  engine: Exclude<VoiceEngine, "system">;
  /** Approximate on-device download, in MB. */
  sizeMB?: number;
  /** Where the model is fetched from (informational). */
  downloadUrl?: string;
  /** Pinned to the top of the gallery as a recommended assistant voice. */
  featured?: boolean;
};

export const ENGINE_INFO: Record<
  VoiceEngine,
  { label: string; license: string; blurb: string; download: string; emoji: string }
> = {
  system: {
    label: "Device voices",
    license: "Built into your OS",
    blurb:
      "Instant, zero download. Uses whatever voices your phone/browser already ships with — quality varies by device.",
    download: "0 MB",
    emoji: "📱",
  },
  piper: {
    label: "Piper",
    license: "MIT · Rhasspy",
    blurb:
      "Fast, lightweight open-source neural TTS (VITS). Runs on CPU via WebAssembly — works on almost any phone. One ~60 MB download per voice, then fully offline.",
    download: "~60 MB / voice",
    emoji: "🪶",
  },
  kokoro: {
    label: "Kokoro 82M",
    license: "Apache-2.0 · hexgrad",
    blurb:
      "Open-weight 82M-parameter neural model — the most natural of the three. One download covers all 54 voices and they then run 100% offline in your browser.",
    download: "~86 MB once (all voices)",
    emoji: "🧠",
  },
};

const P = (
  id: string,
  name: string,
  gender: CatalogVoice["gender"],
  lang: string,
  langLabel: string,
  accent?: string,
  note?: string,
): CatalogVoice => ({ id, name, gender, lang, langLabel, accent, note, engine: "piper" });

/** Curated open-source Piper voices (MIT). ~60MB each, cached offline after first use. */
export const PIPER_VOICES: CatalogVoice[] = [
  // ---- English (US) ----
  P("en_US-lessac-medium", "Lessac", "female", "en-US", "English (US)", "American", "Clear, warm narration standard"),
  P("en_US-lessac-high", "Lessac HD", "female", "en-US", "English (US)", "American", "Higher fidelity Lessac"),
  P("en_US-amy-medium", "Amy", "female", "en-US", "English (US)", "American", "Bright and friendly"),
  P("en_US-amy-low", "Amy Lite", "female", "en-US", "English (US)", "American", "Smallest download"),
  P("en_US-kristin-medium", "Kristin", "female", "en-US", "English (US)", "American", "Smooth, professional"),
  P("en_US-kathleen-low", "Kathleen", "female", "en-US", "English (US)", "American", "Soft, measured"),
  P("en_US-ljspeech-medium", "LJSpeech", "female", "en-US", "English (US)", "American", "Classic audiobook reader"),
  P("en_US-ljspeech-high", "LJSpeech HD", "female", "en-US", "English (US)", "American", "Classic reader, high fidelity"),
  P("en_US-hfc_female-medium", "HFC Female", "female", "en-US", "English (US)", "American", "Home Assistant favourite"),
  P("en_US-ryan-medium", "Ryan", "male", "en-US", "English (US)", "American", "Deep, confident — great JARVIS tone"),
  P("en_US-ryan-high", "Ryan HD", "male", "en-US", "English (US)", "American", "Deep and crisp"),
  P("en_US-ryan-low", "Ryan Lite", "male", "en-US", "English (US)", "American", "Deep, smallest download"),
  P("en_US-joe-medium", "Joe", "male", "en-US", "English (US)", "American", "Relaxed, conversational"),
  P("en_US-norman-medium", "Norman", "male", "en-US", "English (US)", "American", "Rounded, authoritative"),
  P("en_US-danny-low", "Danny", "male", "en-US", "English (US)", "American", "Casual and light"),
  P("en_US-bryce-medium", "Bryce", "male", "en-US", "English (US)", "American", "Youthful"),
  P("en_US-john-medium", "John", "male", "en-US", "English (US)", "American", "Steady newsreader"),
  P("en_US-hfc_male-medium", "HFC Male", "male", "en-US", "English (US)", "American", "Home Assistant favourite"),
  P("en_US-kusal-medium", "Kusal", "male", "en-US", "English (US)", "American", "Expressive"),
  P("en_US-arctic-medium", "Arctic (multi)", "male", "en-US", "English (US)", "American", "Multi-speaker model"),
  P("en_US-libritts-high", "LibriTTS (multi)", "female", "en-US", "English (US)", "American", "Multi-speaker, richest"),
  P("en_US-libritts_r-medium", "LibriTTS-R (multi)", "female", "en-US", "English (US)", "American", "Multi-speaker"),

  // ---- English (UK / other) ----
  P("en_GB-alan-medium", "Alan", "male", "en-GB", "English (UK)", "British", "Proper, butler-like RP"),
  P("en_GB-alan-low", "Alan Lite", "male", "en-GB", "English (UK)", "British", "Proper RP, lightweight"),
  P("en_GB-northern_english_male-medium", "Northern Male", "male", "en-GB", "English (UK)", "Northern England"),
  P("en_GB-alba-medium", "Alba", "female", "en-GB", "English (UK)", "Scottish"),
  P("en_GB-cori-medium", "Cori", "female", "en-GB", "English (UK)", "British", "Warm and clear"),
  P("en_GB-cori-high", "Cori HD", "female", "en-GB", "English (UK)", "British", "Warm, high fidelity"),
  P("en_GB-jenny_dioco-medium", "Jenny", "female", "en-GB", "English (UK)", "British", "Bright, upbeat"),
  P("en_GB-aru-medium", "Aru", "female", "en-GB", "English (UK)", "British"),
  P("en_GB-semaine-medium", "Semaine", "female", "en-GB", "English (UK)", "British", "Conversational"),
  P("en_GB-southern_english_female-low", "Southern Female", "female", "en-GB", "English (UK)", "Southern England"),
  P("en_GB-vctk-medium", "VCTK (multi)", "female", "en-GB", "English (UK)", "British", "109-speaker model"),

  // ---- World languages ----
  P("es_ES-davefx-medium", "Davefx", "male", "es-ES", "Spanish (Spain)"),
  P("es_ES-sharvard-medium", "Sharvard", "female", "es-ES", "Spanish (Spain)"),
  P("es_MX-ald-medium", "Ald", "male", "es-MX", "Spanish (Mexico)"),
  P("es_MX-claude-high", "Claude HD", "female", "es-MX", "Spanish (Mexico)"),
  P("fr_FR-siwis-medium", "Siwis", "female", "fr-FR", "French"),
  P("fr_FR-siwis-low", "Siwis Lite", "female", "fr-FR", "French"),
  P("fr_FR-gilles-low", "Gilles", "male", "fr-FR", "French"),
  P("fr_FR-tom-medium", "Tom", "male", "fr-FR", "French"),
  P("fr_FR-upmc-medium", "UPMC", "male", "fr-FR", "French"),
  P("de_DE-thorsten-medium", "Thorsten", "male", "de-DE", "German"),
  P("de_DE-thorsten-high", "Thorsten HD", "male", "de-DE", "German"),
  P("de_DE-eva_k-x_low", "Eva K", "female", "de-DE", "German", undefined, "Extra small"),
  P("de_DE-kerstin-low", "Kerstin", "female", "de-DE", "German"),
  P("de_DE-ramona-low", "Ramona", "female", "de-DE", "German"),
  P("de_DE-pavoque-low", "Pavoque", "male", "de-DE", "German"),
  P("de_DE-karlsson-low", "Karlsson", "male", "de-DE", "German"),
  P("it_IT-riccardo-x_low", "Riccardo", "male", "it-IT", "Italian"),
  P("it_IT-paola-medium", "Paola", "female", "it-IT", "Italian"),
  P("pt_BR-faber-medium", "Faber", "male", "pt-BR", "Portuguese (BR)"),
  P("pt_BR-edresson-low", "Edresson", "male", "pt-BR", "Portuguese (BR)"),
  P("pt_PT-tugão-medium", "Tugão", "male", "pt-PT", "Portuguese (PT)"),
  P("nl_NL-mls-medium", "MLS", "female", "nl-NL", "Dutch"),
  P("nl_BE-nathalie-medium", "Nathalie", "female", "nl-BE", "Dutch (Belgium)"),
  P("nl_BE-rdh-medium", "Rdh", "male", "nl-BE", "Dutch (Belgium)"),
  P("sv_SE-nst-medium", "NST", "female", "sv-SE", "Swedish"),
  P("da_DK-talesyntese-medium", "Talesyntese", "female", "da-DK", "Danish"),
  P("no_NO-talesyntese-medium", "Talesyntese", "female", "no-NO", "Norwegian"),
  P("fi_FI-harri-medium", "Harri", "male", "fi-FI", "Finnish"),
  P("pl_PL-gosia-medium", "Gosia", "female", "pl-PL", "Polish"),
  P("pl_PL-darkman-medium", "Darkman", "male", "pl-PL", "Polish"),
  P("ru_RU-irina-medium", "Irina", "female", "ru-RU", "Russian"),
  P("ru_RU-dmitri-medium", "Dmitri", "male", "ru-RU", "Russian"),
  P("ru_RU-denis-medium", "Denis", "male", "ru-RU", "Russian"),
  P("ru_RU-ruslan-medium", "Ruslan", "male", "ru-RU", "Russian"),
  P("uk_UA-ukrainian_tts-medium", "Ukrainian TTS", "female", "uk-UA", "Ukrainian"),
  P("cs_CZ-jirka-medium", "Jirka", "male", "cs-CZ", "Czech"),
  P("sk_SK-lili-medium", "Lili", "female", "sk-SK", "Slovak"),
  P("sl_SI-artur-medium", "Artur", "male", "sl-SI", "Slovenian"),
  P("sr_RS-serbski_institut-medium", "Serbski", "male", "sr-RS", "Serbian"),
  P("ro_RO-mihai-medium", "Mihai", "male", "ro-RO", "Romanian"),
  P("hu_HU-anna-medium", "Anna", "female", "hu-HU", "Hungarian"),
  P("hu_HU-imre-medium", "Imre", "male", "hu-HU", "Hungarian"),
  P("el_GR-rapunzelina-low", "Rapunzelina", "female", "el-GR", "Greek"),
  P("tr_TR-dfki-medium", "DFKI", "female", "tr-TR", "Turkish"),
  P("tr_TR-fahrettin-medium", "Fahrettin", "male", "tr-TR", "Turkish"),
  P("ar_JO-kareem-medium", "Kareem", "male", "ar-JO", "Arabic (Jordan)"),
  P("fa_IR-amir-medium", "Amir", "male", "fa-IR", "Persian"),
  P("fa_IR-gyro-medium", "Gyro", "male", "fa-IR", "Persian"),
  P("he_IL-none-medium", "Hebrew", "male", "he-IL", "Hebrew"),
  P("hi_IN-none-medium", "Hindi", "female", "hi-IN", "Hindi"),
  P("vi_VN-vais1000-medium", "Vais 1000", "female", "vi-VN", "Vietnamese"),
  P("zh_CN-huayan-medium", "Huayan", "female", "zh-CN", "Chinese (Mandarin)"),
  P("ja_JP-none-medium", "Japanese", "female", "ja-JP", "Japanese"),
  P("ko_KR-none-medium", "Korean", "female", "ko-KR", "Korean"),
  P("sw_CD-lanfrica-medium", "Lanfrica", "male", "sw-CD", "Swahili"),
  P("is_IS-salka-medium", "Salka", "female", "is-IS", "Icelandic"),
  P("is_IS-bui-medium", "Bui", "male", "is-IS", "Icelandic"),
  P("lb_LU-marylux-medium", "Marylux", "female", "lb-LU", "Luxembourgish"),
  P("ka_GE-natia-medium", "Natia", "female", "ka-GE", "Georgian"),
  P("ne_NP-google-medium", "Google Nepali", "female", "ne-NP", "Nepali"),
];

const K = (
  id: string,
  name: string,
  gender: CatalogVoice["gender"],
  lang: string,
  langLabel: string,
  accent: string,
  note: string,
): CatalogVoice => ({ id, name, gender, lang, langLabel, accent, note, engine: "kokoro" });

/** Kokoro 82M — 54 open-weight voices (Apache-2.0), 9 languages, one shared download. */
export const KOKORO_VOICES: CatalogVoice[] = [
  // American English — female
  K("af_heart", "Heart", "female", "en-US", "English (US)", "American", "★ Showcase voice — warm and natural"),
  K("af_bella", "Bella", "female", "en-US", "English (US)", "American", "Expressive, warm"),
  K("af_nicole", "Nicole", "female", "en-US", "English (US)", "American", "Smooth, professional"),
  K("af_sarah", "Sarah", "female", "en-US", "English (US)", "American", "Friendly, upbeat"),
  K("af_sky", "Sky", "female", "en-US", "English (US)", "American", "Light, conversational"),
  K("af_aoede", "Aoede", "female", "en-US", "English (US)", "American", "Lyrical, soft"),
  K("af_kore", "Kore", "female", "en-US", "English (US)", "American", "Even, composed"),
  K("af_jessica", "Jessica", "female", "en-US", "English (US)", "American", "Bright, energetic"),
  K("af_river", "River", "female", "en-US", "English (US)", "American", "Calm, measured"),
  K("af_nova", "Nova", "female", "en-US", "English (US)", "American", "Crisp, modern"),
  K("af_alloy", "Alloy", "female", "en-US", "English (US)", "American", "Neutral, even-toned"),
  // American English — male
  K("am_adam", "Adam", "male", "en-US", "English (US)", "American", "Deep, steady — classic assistant"),
  K("am_michael", "Michael", "male", "en-US", "English (US)", "American", "Warm, confident"),
  K("am_echo", "Echo", "male", "en-US", "English (US)", "American", "Resonant, deliberate"),
  K("am_eric", "Eric", "male", "en-US", "English (US)", "American", "Casual, relaxed"),
  K("am_fenrir", "Fenrir", "male", "en-US", "English (US)", "American", "Gritty, intense"),
  K("am_liam", "Liam", "male", "en-US", "English (US)", "American", "Young, bright"),
  K("am_onyx", "Onyx", "male", "en-US", "English (US)", "American", "Dark, cinematic"),
  K("am_puck", "Puck", "male", "en-US", "English (US)", "American", "Playful, quick"),
  K("am_santa", "Santa", "male", "en-US", "English (US)", "American", "Booming, jolly"),
  // British English
  K("bf_emma", "Emma", "female", "en-GB", "English (UK)", "British", "Refined RP — very JARVIS"),
  K("bf_isabella", "Isabella", "female", "en-GB", "English (UK)", "British", "Elegant, poised"),
  K("bf_alice", "Alice", "female", "en-GB", "English (UK)", "British", "Clear, precise"),
  K("bf_lily", "Lily", "female", "en-GB", "English (UK)", "British", "Soft, gentle"),
  K("bm_george", "George", "male", "en-GB", "English (UK)", "British", "Proper gentleman butler"),
  K("bm_daniel", "Daniel", "male", "en-GB", "English (UK)", "British", "Deep, authoritative"),
  K("bm_lewis", "Lewis", "male", "en-GB", "English (UK)", "British", "Warm, articulate"),
  K("bm_fable", "Fable", "male", "en-GB", "English (UK)", "British", "Storyteller"),
  // Other languages
  K("ef_dora", "Dora", "female", "es-ES", "Spanish", "Iberian", ""),
  K("em_alex", "Alex", "male", "es-ES", "Spanish", "Iberian", ""),
  K("em_santa", "Santa", "male", "es-ES", "Spanish", "Iberian", ""),
  K("ff_siwis", "Siwis", "female", "fr-FR", "French", "Metropolitan", ""),
  K("if_sara", "Sara", "female", "it-IT", "Italian", "Standard", ""),
  K("im_nicola", "Nicola", "male", "it-IT", "Italian", "Standard", ""),
  K("pf_dora", "Dora", "female", "pt-BR", "Portuguese (BR)", "Brazilian", ""),
  K("pm_alex", "Alex", "male", "pt-BR", "Portuguese (BR)", "Brazilian", ""),
  K("pm_santa", "Santa", "male", "pt-BR", "Portuguese (BR)", "Brazilian", ""),
  K("hf_alpha", "Alpha", "female", "hi-IN", "Hindi", "", ""),
  K("hf_beta", "Beta", "female", "hi-IN", "Hindi", "", ""),
  K("hm_omega", "Omega", "male", "hi-IN", "Hindi", "", ""),
  K("hm_psi", "Psi", "male", "hi-IN", "Hindi", "", ""),
  K("jf_alpha", "Alpha", "female", "ja-JP", "Japanese", "", ""),
  K("jf_gongitsune", "Gongitsune", "female", "ja-JP", "Japanese", "", ""),
  K("jf_nezumi", "Nezumi", "female", "ja-JP", "Japanese", "", ""),
  K("jf_tebukuro", "Tebukuro", "female", "ja-JP", "Japanese", "", ""),
  K("jm_kumo", "Kumo", "male", "ja-JP", "Japanese", "", ""),
  K("zf_xiaobei", "Xiaobei", "female", "zh-CN", "Chinese", "Mandarin", ""),
  K("zf_xiaoni", "Xiaoni", "female", "zh-CN", "Chinese", "Mandarin", ""),
  K("zf_xiaoxiao", "Xiaoxiao", "female", "zh-CN", "Chinese", "Mandarin", ""),
  K("zf_xiaoyi", "Xiaoyi", "female", "zh-CN", "Chinese", "Mandarin", ""),
  K("zm_yunjian", "Yunjian", "male", "zh-CN", "Chinese", "Mandarin", ""),
  K("zm_yunxi", "Yunxi", "male", "zh-CN", "Chinese", "Mandarin", ""),
  K("zm_yunxia", "Yunxia", "male", "zh-CN", "Chinese", "Mandarin", ""),
  K("zm_yunyang", "Yunyang", "male", "zh-CN", "Chinese", "Mandarin", ""),
];

export const DEFAULT_VOICE: Record<Exclude<VoiceEngine, "system">, string> = {
  piper: "en_US-ryan-medium",
  kokoro: "af_heart",
};

/** The six best all-round assistant voices, pinned as "Recommended". */
export const FEATURED_IDS = new Set([
  "af_heart",
  "am_adam",
  "bm_george",
  "bf_emma",
  "en_US-ryan-medium",
  "en_GB-alan-medium",
]);

const PIPER_HF = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";
const KOKORO_HF = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX";

function piperSize(id: string) {
  if (id.endsWith("-x_low")) return 20;
  if (id.endsWith("-low")) return 30;
  if (id.endsWith("-high")) return 110;
  return 63;
}

/** Fill in derived fields so embedded + remote entries look identical. */
export function enrich(v: CatalogVoice): CatalogVoice {
  return {
    ...v,
    featured: v.featured ?? FEATURED_IDS.has(v.id),
    sizeMB: v.sizeMB ?? (v.engine === "piper" ? piperSize(v.id) : 86),
    downloadUrl: v.downloadUrl ?? (v.engine === "piper" ? piperUrl(v.id) : KOKORO_HF),
  };
}

/** HF layout is `{family}/{locale}/{speaker}/{quality}/{id}.onnx`, e.g.
 *  de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx */
function piperUrl(id: string) {
  const m = id.match(/^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)$/);
  if (!m) return `${PIPER_HF}/${id}.onnx`;
  const [, family, , speaker, quality] = m;
  const locale = `${family}_${m[2]}`;
  return `${PIPER_HF}/${family}/${locale}/${speaker}/${quality}/${id}.onnx`;
}

/* ------------------------------------------------------------------ */
/* Live catalogue: /voice-catalog.json with embedded fallback           */
/* ------------------------------------------------------------------ */

const EMBEDDED: Record<Exclude<VoiceEngine, "system">, CatalogVoice[]> = {
  piper: PIPER_VOICES.map(enrich),
  kokoro: KOKORO_VOICES.map(enrich),
};

let live: Record<Exclude<VoiceEngine, "system">, CatalogVoice[]> = EMBEDDED;
let loadPromise: Promise<typeof live> | null = null;
export type CatalogSource = "embedded" | "remote";
let source: CatalogSource = "embedded";

export function catalogSource() {
  return source;
}

/**
 * Load `/voice-catalog.json` once (lets new voices ship without a redeploy).
 * Falls back to the embedded arrays on any failure and never throws.
 */
export function loadCatalog(): Promise<typeof live> {
  if (loadPromise) return loadPromise;
  if (typeof window === "undefined") return Promise.resolve(EMBEDDED);
  loadPromise = (async () => {
    try {
      const res = await fetch("/voice-catalog.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { voices?: Partial<CatalogVoice>[] };
      const rows = (json.voices ?? []).filter(
        (v): v is CatalogVoice =>
          typeof v.id === "string" &&
          typeof v.name === "string" &&
          (v.engine === "piper" || v.engine === "kokoro") &&
          (v.gender === "male" || v.gender === "female") &&
          typeof v.lang === "string",
      );
      const piper = rows.filter((v) => v.engine === "piper").map(enrich);
      const kokoro = rows.filter((v) => v.engine === "kokoro").map(enrich);
      if (piper.length && kokoro.length) {
        live = { piper, kokoro };
        source = "remote";
      }
    } catch {
      live = EMBEDDED;
      source = "embedded";
    }
    return live;
  })();
  return loadPromise;
}

export const ALL_OSS_VOICES = [...PIPER_VOICES, ...KOKORO_VOICES];

export function catalogFor(engine: Exclude<VoiceEngine, "system">): CatalogVoice[] {
  return live[engine];
}

export function findVoice(engine: VoiceEngine, id: string): CatalogVoice | undefined {
  if (engine === "system") return undefined;
  return catalogFor(engine).find((v) => v.id === id);
}

export function languageLabel(code: string) {
  return (
    [...live.piper, ...live.kokoro].find((v) => v.lang === code)?.langLabel ?? code
  );
}

/** Display order for grouped-by-language browsing. */
export const LANGUAGE_ORDER = [
  "en-US","en-GB","es-ES","es-MX","fr-FR","de-DE","it-IT","pt-BR","pt-PT",
  "zh-CN","ja-JP","ko-KR","hi-IN",
];

export function groupByLanguage(voices: CatalogVoice[]) {
  const map = new Map<string, { lang: string; label: string; voices: CatalogVoice[] }>();
  for (const v of voices) {
    const g = map.get(v.lang) ?? { lang: v.lang, label: v.langLabel, voices: [] };
    g.voices.push(v);
    map.set(v.lang, g);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ia = LANGUAGE_ORDER.indexOf(a.lang);
    const ib = LANGUAGE_ORDER.indexOf(b.lang);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.label.localeCompare(b.label);
  });
}
