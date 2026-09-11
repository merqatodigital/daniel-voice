/**
 * Curated TTS catalog — only the best fluent voices for resort use.
 * ~12 top picks instead of 54. "More" toggle if power users want all.
 */

export type VoiceEngine = 'system' | 'piper' | 'kokoro';

export type CatalogVoice = {
  id: string;
  name: string;
  gender: 'male' | 'female';
  lang: string;
  langLabel: string;
  accent?: string;
  note?: string;
  engine: Exclude<VoiceEngine, 'system'>;
  sizeMB?: number;
  downloadUrl?: string;
  featured?: boolean;
};

export const ENGINE_INFO: Record<
  VoiceEngine,
  { label: string; license: string; blurb: string; download: string; emoji: string }
> = {
  system: {
    label: 'Device voices',
    license: 'Built into your OS',
    blurb:
      'Instant, zero download. Uses whatever voices your phone/browser already ships with.',
    download: '0 MB',
    emoji: '📱',
  },
  piper: {
    label: 'Piper',
    license: 'MIT · Rhasspy',
    blurb:
      'Fast, lightweight neural TTS. Runs on CPU — works on almost any phone.',
    download: '~60 MB / voice',
    emoji: '🪶',
  },
  kokoro: {
    label: 'Kokoro 82M',
    license: 'Apache-2.0 · hexgrad',
    blurb:
      'Open-weight 82M neural model. One download covers 54 voices, then runs 100% offline.',
    download: '~86 MB once',
    emoji: '🧠',
  },
};

// ---- Curated top picks (shown by default) ----
const CURATED: CatalogVoice[] = [
  // Female
  { id: 'af_heart', name: 'Heart', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: '★ Showcase voice — warm and natural', engine: 'kokoro', featured: true },
  { id: 'bf_emma', name: 'Emma', gender: 'female', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: '★ Refined RP — very TALA', engine: 'kokoro', featured: true },
  { id: 'en_US-amy-medium', name: 'Amy', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Bright and friendly', engine: 'piper', featured: true },
  { id: 'en_GB-jenny_dioco-medium', name: 'Jenny', gender: 'female', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Bright, upbeat', engine: 'piper', featured: true },

  // Male
  { id: 'am_adam', name: 'Adam', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: '★ Deep, steady — classic assistant', engine: 'kokoro', featured: true },
  { id: 'bm_george', name: 'George', gender: 'male', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: '★ Proper gentleman butler', engine: 'kokoro', featured: true },
  { id: 'en_US-ryan-medium', name: 'Ryan', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Deep, confident — great TALA tone', engine: 'piper', featured: true },
  { id: 'en_GB-alan-medium', name: 'Alan', gender: 'male', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Proper, butler-like RP', engine: 'piper', featured: true },
];

// ---- All voices (hidden behind "Show more") ----
const ALL: CatalogVoice[] = [
  ...CURATED,
  { id: 'af_bella', name: 'Bella', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Expressive, warm', engine: 'kokoro' },
  { id: 'af_sarah', name: 'Sarah', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Friendly, upbeat', engine: 'kokoro' },
  { id: 'af_nicole', name: 'Nicole', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Smooth, professional', engine: 'kokoro' },
  { id: 'af_sky', name: 'Sky', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Light, conversational', engine: 'kokoro' },
  { id: 'bf_isabella', name: 'Isabella', gender: 'female', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Elegant, poised', engine: 'kokoro' },
  { id: 'bf_alice', name: 'Alice', gender: 'female', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Clear, precise', engine: 'kokoro' },
  { id: 'am_echo', name: 'Echo', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Resonant, deliberate', engine: 'kokoro' },
  { id: 'am_onyx', name: 'Onyx', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Dark, cinematic', engine: 'kokoro' },
  { id: 'am_fenrir', name: 'Fenrir', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Gritty, intense', engine: 'kokoro' },
  { id: 'bm_daniel', name: 'Daniel', gender: 'male', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Deep, authoritative', engine: 'kokoro' },
  { id: 'bm_lewis', name: 'Lewis', gender: 'male', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Warm, articulate', engine: 'kokoro' },
  { id: 'am_puck', name: 'Puck', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Playful, quick', engine: 'kokoro' },
  { id: 'bf_lily', name: 'Lily', gender: 'female', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Soft, gentle', engine: 'kokoro' },
  { id: 'am_michael', name: 'Michael', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Warm, confident', engine: 'kokoro' },
  { id: 'en_US-jenny-medium', name: 'Jenny', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Bright, upbeat', engine: 'piper' },
  { id: 'en_US-kristin-medium', name: 'Kristin', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Smooth, professional', engine: 'piper' },
  { id: 'en_US-ljspeech-high', name: 'LJSpeech HD', gender: 'female', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Classic audiobook reader', engine: 'piper' },
  { id: 'en_GB-cori-medium', name: 'Cori', gender: 'female', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Warm and clear', engine: 'piper' },
  { id: 'en_US-danny-low', name: 'Danny', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Casual and light', engine: 'piper' },
  { id: 'en_US-norman-medium', name: 'Norman', gender: 'male', lang: 'en-US', langLabel: 'English (US)', accent: 'American', note: 'Rounded, authoritative', engine: 'piper' },
  { id: 'en_GB-alan-low', name: 'Alan Lite', gender: 'male', lang: 'en-GB', langLabel: 'English (UK)', accent: 'British', note: 'Proper RP, lightweight', engine: 'piper' },
];

export const DEFAULT_VOICE: Record<Exclude<VoiceEngine, 'system'>, string> = {
  piper: 'en_US-amy-medium',
  kokoro: 'af_heart',
};

let loaded = false;
let source: 'embedded' | 'remote' = 'embedded';

export function catalogSource() {
  return source;
}

export function loadCatalog(): Promise<void> {
  if (loaded) return Promise.resolve();
  loaded = true;
  // Future: fetch from /voice-catalog.json if needed. For now, embedded.
  return Promise.resolve();
}

export function catalogFor(engine: Exclude<VoiceEngine, 'system'>): CatalogVoice[] {
  return ALL.filter(v => v.engine === engine);
}

export function curatedFor(engine: Exclude<VoiceEngine, 'system'>): CatalogVoice[] {
  return CURATED.filter(v => v.engine === engine);
}

export function findVoice(engine: VoiceEngine, id: string): CatalogVoice | undefined {
  if (engine === 'system') return undefined;
  return ALL.find(v => v.engine === engine && v.id === id);
}

export function languageLabel(code: string) {
  return ALL.find(v => v.lang === code)?.langLabel ?? code;
}

export const ALL_OSS_VOICES = ALL;

export const LANGUAGE_ORDER = ['en-US', 'en-GB'];

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
