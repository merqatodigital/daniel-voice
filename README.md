# JARVIS — Personal Voice Assistant

A phone-first, voice-driven personal assistant built with Next.js, PostgreSQL, and the Web Speech API. Talk to it hands-free, teach it facts through a knowledge base, manage tasks by voice, and choose between fully local open-source AI (Ollama) or cloud models (OpenRouter) for reasoning. All speech synthesis and recognition runs in the browser — zero server cost for voice.

## What you need

- **Node.js** 18+
- **PostgreSQL** instance (local or remote)
- **`DATABASE_URL`** environment variable pointing at it

That's it for the open-source path. No Docker required, no external services, no API keys mandatory.

## Quick start

```bash
git clone <this-repo> && cd jarvis
npm install
# Set your DATABASE_URL in .env
npx drizzle-kit push        # apply the schema
npm run dev                  # http://localhost:3000
```

Open the URL on your phone (same Wi-Fi, or use a tunnel like `ngrok`). Tap **Install** / **Add to Home Screen** to get the PWA.

## LLM backends (pick one, or none)

The assistant works without any LLM — the on-device brain handles tasks, knowledge lookup, math, time, and briefings. For open-ended questions, connect one of these:

### Option A — Ollama (fully open-source, fully local)

1. Install [Ollama](https://ollama.ai) on the same machine.
2. Run `ollama serve` and pull a model: `ollama pull llama3.2`
3. In the app: **Setup → Ollama (local)** — the panel auto-detects running models. Pick one.
4. Done. No API key, no cloud, no cost. The app streams tokens from `localhost:11434`.

### Option B — OpenRouter (cloud, 400+ models, free tier available)

1. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. In the app: **Setup → OpenRouter brain** — paste your key. It's validated live, stored in Postgres, and never sent to the browser.
3. Pick a model. The catalogue refreshes on demand (models change daily).
4. Free models are available — filter by "Free" in the model list.

### Option C — OpenAI / Anthropic (env vars)

Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in your environment. These are read server-side only. The app picks them up automatically.

## Voice & TTS

All voice processing is browser-side:

- **Speech recognition** — Web Speech API, continuous hands-free mode, wake-word mode, or tap-to-talk.
- **Speech synthesis** — three engines, all free and open-source:
  - **Device voices** — whatever your phone ships with.
  - **Piper** (MIT) — 90+ neural voices, ~60 MB each, cached offline after first download.
  - **Kokoro 82M** (Apache-2.0) — 54 neural voices, one shared ~86 MB download, highest quality.

## Architecture

```
src/
  app/
    page.tsx              — phone UI (Talk, Tasks, Brain, Setup tabs)
    layout.tsx            — PWA manifest + service worker registration
    api/
      chat/route.ts       — streaming LLM + local brain, llmMode branching
      settings/route.ts   — user preferences (key never leaked)
      knowledge/route.ts  — knowledge base CRUD + bulk import
      tasks/route.ts      — task CRUD
      models/route.ts     — OpenRouter model catalogue (cached in Postgres)
      openrouter/key/     — key verify/store/remove
      health/route.ts     — full system status rollup
  components/             — UI panels (Orb, VoiceLab, OpenRouterPanel, etc.)
  lib/
    agent.ts              — deterministic on-device brain
    llmStream.ts          — streaming plans: OpenRouter, Ollama, OpenAI, Anthropic
    conversation.ts       — stop-phrase + wake-word detection
    personas.ts           — 6 attitude presets + custom
    tts/                  — engine.ts (Piper, Kokoro, system), catalog.ts
  db/
    schema.ts             — Drizzle tables (settings, messages, knowledge, tasks, models)
    index.ts              — Postgres connection pool
public/
    manifest.json         — PWA manifest
    sw.js                 — service worker (network-first nav, cache-first assets)
    voice-catalog.json    — 147 voices, editable without redeploy
```

## License

MIT. All runtime dependencies are open-source. The app runs entirely on Node.js + Postgres + (optionally) Ollama.
