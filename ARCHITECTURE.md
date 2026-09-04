# TALA — architecture

A phone-first, single-user voice assistant: one Next.js app that serves an
installable PWA, keeps its state in Postgres, answers with a deterministic local
brain that escalates to a streaming LLM, and does all speech work in the browser.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js `16.2.6`, App Router, TS strict | route handlers for the API, zero-config Turbopack dev |
| UI | React `19.2.6` | every interactive view is `"use client"`; one page, four tabs |
| Styling | Tailwind `4.1.17` via `@tailwindcss/postcss` | plus hand-written keyframes in `globals.css` (orb, rings, EQ) |
| DB | PostgreSQL via `pg` `8.20.0` | `Pool` cached on `globalThis` in dev, `max: 3`, TLS-aware |
| ORM | Drizzle `0.45.2` + drizzle-kit `0.31.10` | 5 tables, one committed migration in `drizzle/` |
| LLM | raw `fetch` streaming — Ollama, OpenRouter, OpenAI-compatible, Anthropic | no provider SDKs, no Vercel AI SDK |
| TTS | Web Speech API + `kokoro-js` (ONNX, q8/fp32) + `@mintplex-labs/piper-tts-web` (OPFS) | browser-only; `serverExternalPackages` keeps Node entrypoints out of the bundle |
| STT | native `webkitSpeechRecognition` | no Whisper server, no cloud STT bill |
| PWA | `public/manifest.json` + hand-written `public/sw.js` | network-first navigations, cache-first statics, `/api/*` never intercepted |
| Quality | ESLint `9` flat config (`next/core-web-vitals`), `tsc --noEmit` | no test framework, no CI |

Intentional omissions: no auth (single-user by design), no state library (plain
`useState` + refs), no Docker, no ORM relations/joins (queries are per-table).

## Tree

```
daniel-voice/
├── README.md                      pitch, requirements, LLM options
├── DEPLOY.md                      the Vercel + free-backend runbook
├── ARCHITECTURE.md                this file
├── .env.example                   every env var, commented
├── package.json                   scripts: dev / build / start / lint / typecheck
├── next.config.ts                 serverExternalPackages + turbopack aliases → tts/empty.js
├── tsconfig.json                  strict, @/* → src/*
├── postcss.config.mjs  eslint.config.mjs  drizzle.config.ts
├── .gitignore                     node_modules/.next/out, .env*, .vercel/
│
├── drizzle/
│   ├── 0000_initial.sql           5 CREATE TABLEs
│   └── meta/                      drizzle-kit journal + snapshot
│
├── public/
│   ├── manifest.json              standalone, portrait, #04070d
│   ├── sw.js                      cache "tala-v3"
│   ├── voice-catalog.json         editable Piper/Kokoro voice list (HF download URLs)
│   └── icon-{192,512}.png  icon-maskable-512.png  apple-touch-icon.png
│
└── src/
    ├── app/
    │   ├── layout.tsx             metadata (PWA icons, appleWebApp), viewport, PwaRegister
    │   ├── page.tsx        (598)  ★ the app: tabs, mic loop, stream reader, wake-word
    │   │                          #   routing, silence timeout, health banner
    │   ├── globals.css            Tailwind + HUD background + orb/ring/EQ keyframes
    │   └── api/                   all handlers are force-dynamic
    │       ├── chat/route.ts      ★ POST: local brain → optional LLM stream
    │       │                      #   maxDuration 60; GET history; DELETE log
    │       ├── health/route.ts    DB + OpenRouter up/balance + Ollama probe +
    │       │                      #   catalogue freshness, all probes ≤5s, in parallel
    │       ├── settings/route.ts  GET (key stripped) / PUT (per-field clamp + whitelist)
    │       ├── tasks/route.ts     GET POST PATCH DELETE
    │       ├── knowledge/route.ts GET POST (single or bulk-chunked) DELETE
    │       ├── models/route.ts    cached OpenRouter catalogue; POST = force refresh;
    │       │                      #   pre-seeds OPENROUTER_MODEL when the DB is empty
    │       ├── ollama/route.ts    POST → probe /api/tags (3s), list installed models
    │       └── openrouter/key/route.ts   PUT verify+store / GET masked / DELETE
    │
    ├── components/                client panels; no UI kit
    │   ├── Orb.tsx                state-coloured animated core
    │   ├── VoiceLab.tsx    (769)  ★ engine picker, voices by language, Piper downloads,
    │   │                          #   Kokoro dtype, rate/pitch, preview
    │   ├── OpenRouterPanel.tsx    key entry + validation, searchable catalogue, free/paid
    │   ├── SettingsPanel.tsx      names, persona grid, listen mode, wake word, units
    │   ├── KnowledgePanel.tsx     list + drag/drop import (500 KB cap) + search
    │   ├── OllamaPanel.tsx        daemon URL, model discovery, size/quant display
    │   ├── TasksPanel.tsx         add / toggle / delete
    │   ├── Toast.tsx              useToast() snackbar hook
    │   └── PwaRegister.tsx        registers /sw.js outside dev
    │
    ├── db/
    │   ├── schema.ts              settings (31 cols, id=1 singleton), knowledge,
    │   │                          #   messages, tasks, models
    │   └── index.ts               drizzle(node-postgres), SSL + pool sizing
    │
    └── lib/
        ├── agent.ts        (403)  ★ localBrain(): regex intents (greetings, identity,
        │                          #   time/date, math, task add/complete/list, remember,
        │                          #   KB answer, help) + searchKnowledge() TF scoring
        │                          #   + buildSystemPrompt() + legacy non-streaming llmBrain()
        ├── llmStream.ts    (302)  ★ planLlmStream(): provider choice + lazy AsyncGenerator
        │                          #   of token deltas; SSE/NDJSON parsers per provider
        ├── conversation.ts (155)  isStopPhrase(), matchWakeWord() with Levenshtein
        │                          #   tolerance and filler stripping
        ├── useSpeech.ts    (286)  useVoices / useTts / useListener (auto-restart,
        │                          #   mute-while-speaking, error + interim state)
        ├── tts/engine.ts   (421)  ★ speak() dispatcher: system | Kokoro | Piper,
        │                          #   WAV encode + playbackRate, OPFS voice storage
        ├── tts/catalog.ts  (368)  engine metadata, voice lists, remote JSON overlay
        ├── openrouter.ts   (141)  catalogue fetch/normalise/chunked insert, maskKey, verifyKey
        ├── personas.ts     (126)  6 personas + custom (systemStyle, greetings, ack, unknown)
        ├── health.ts        (55)  client rollup: server status merged with real device TTS
        ├── clientTypes.ts   (88)  DTOs + DEFAULT_SETTINGS (no zod; hand-maintained contract)
        └── store.ts         (27)  getSettings (upserts id=1), getKnowledge, getTasks, getMessages
```

## Request lifecycle

1. `useListener` runs `SpeechRecognition` continuously; each final transcript goes
   to `handleTranscript` in `page.tsx`.
2. `conversation.ts` decides: stop-phrase → close the conversation; wake-word mode
   → ignore until the (fuzzy-matched) wake word is heard; otherwise pass the text on.
3. `POST /api/chat` loads settings + knowledge + tasks + last 20 messages in
   parallel, then runs `localBrain()`. Commands (tasks, memory writes, math,
   time/date) execute here on purpose: they must never be paraphrased by a model.
4. `llmMode` gates escalation — `off` never calls a model, `auto` calls one only
   when the local brain draws a blank, `always` calls one for every non-command
   turn and reports failure loudly instead of silently degrading.
5. `planLlmStream()` picks a provider: env `OLLAMA_URL`/`OLLAMA_MODEL`, else the
   DB-configured Ollama (1.5s `/api/tags` probe), else OpenRouter (DB key, or
   `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`), else `OPENAI_API_KEY` against
   `OPENAI_BASE_URL`, else Anthropic. Returns `null` when nothing is configured.
6. Local path → JSON. LLM path → `text/plain` `ReadableStream`, with engine,
   provider and cited knowledge smuggled in `X-Engine` / `X-Provider` /
   URL-encoded `X-Used-Knowledge` headers; the client appends tokens as they land.
7. The exchange and any side-effects are persisted in the stream's `finally`, so a
   DB hiccup can't break the stream close. Then `useTts.say()` speaks the completed
   reply through the selected engine, and the mic reopens 700 ms later so the
   speaker doesn't transcribe itself.

## Data model

* `settings` — one row (`id = 1`) holding identity, persona, voice/engine choices,
  listen mode, wake word, timezone/units, **and the OpenRouter key**. The key is
  read only server-side; `GET /api/settings` strips it and `GET /api/openrouter/key`
  returns a masked value plus a live credit check.
* `knowledge` — title/content/tags, the searchable brain; `source` is
  `manual | import | conversation`.
* `messages` — full transcript with `meta.engine` and cited entries in `meta`.
* `tasks` — title/done/dueAt.
* `models` — cached OpenRouter catalogue (several hundred rows, refreshed on
  demand, chunked inserts in one transaction).

Retrieval is deliberately unglamorous: tokenised TF scoring over title/tags/content
with a score floor, no embeddings, no vector column. It is a personal notebook, and
the same function serves both the local brain and the LLM system prompt.

## Backend strategy

| Concern | Decision |
| --- | --- |
| Host | Vercel (Hobby, free) — `*.vercel.app` is HTTPS, which the mic requires |
| Database | Neon free via Vercel integration; `DATABASE_SSL` covers other providers |
| Reasoning | free OpenAI-compatible open-weights endpoint, OpenRouter `:free`, or a tunnelled local Ollama |
| Speech | 100% client-side: Web Speech STT, system/Kokoro/Piper TTS, downloaded voices survive offline |
| Model weights | browser-downloaded per device; never served from our origin |

What that buys: no per-request inference bill, no GPU, and the core app still works
with zero cloud AI accounts configured. What it costs: prompts go to a third-party
free tier unless you use option C, `SpeechRecognition` needs Chrome/Safari (Firefox
has none) and is server-side on Chrome/Safari, and free provider quotas are not
contractual. Details and exact commands: `DEPLOY.md`.

## Known limits

* Single-user, single-row `settings`: no multi-tenant story, no auth. Adding one
  means a users table plus middleware, and the DB-stored API key becomes
  per-user immediately.
* `pg.Pool` in a serverless function is a per-invocation pool; `max: 3` keeps
  Neon from being stampeded, but a busy deployment still wants a pooled
  connection string (port 6543), not the direct one.
* `messages` grows forever — there's a "clear log" but no retention job.
* No tests. `agent.ts` intent regexes and `conversation.ts` phrase matching are the
  two places a small unit-test suite would earn its keep first.
