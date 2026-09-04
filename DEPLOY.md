# Deploying TALA to Vercel (free, open-source path)

Two hard facts drive every decision below:

1. **TALA needs Postgres.** `src/db/index.ts` throws without `DATABASE_URL`, so the
   build fails until a database is attached.
2. **You cannot run `ollama serve` on Vercel.** Serverless functions have no
   persistent process, no GPU, no `127.0.0.1:11434`, and a short wall clock. Vercel
   is a *host*, not a *machine*.

So the backend is: **Postgres on a free managed tier, plus open-weights models
served either by a free OpenAI-compatible API or by your own Ollama box reachable
over a tunnel.** Voice (STT + TTS) runs entirely in the browser, so it costs
nothing per request at any scale.

## Recommended: ~15 minutes, $0/month

### 1. Database (Neon free)

Vercel → Project → **Integrations → Neon** (or the `vercel` CLI flow). Neon's free
plan is 100 CU-hours/month and 0.5 GB — this app writes a few KB per conversation
turn, so it won't get close. The integration injects `DATABASE_URL` at build and
runtime, and its pooled connection string is already TLS-required.

Prefer another provider? **Supabase** free (500 MB) works too: copy its *connection
pool* URI (port 6543) and set `DATABASE_SSL=true`.

Normal caveat of free Neon: **scale-to-zero**. After ~5 idle minutes the first
request pays a ~500 ms–2 s cold start. Nothing breaks; the health banner just
catches up.

### 2. LLM — pick one

| Option | Cost | Models | What you set |
| --- | --- | --- | --- |
| **A. Free OpenAI-compatible API** | $0 | open weights: Llama 3.3 70B, Qwen3, Gemma, DeepSeek-distilled | `OPENAI_API_KEY` + `OPENAI_BASE_URL` + `OPENAI_MODEL` |
| **B. OpenRouter free models** | $0 | rotating `:free` lineup; ~50 req/day (1,000/day after a one-time $10 top-up) | paste key in **Setup** (stored in Postgres) *or* `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` |
| **C. Your own Ollama, tunnelled** | $0, needs an always-on box | anything you can run locally, private by default | `OLLAMA_URL` + `OLLAMA_MODEL` |

**A** is the pragmatic free default. Free and paid OpenAI-compatible endpoints take
an identical request shape, so it is a base-URL swap:

```
# Groq — fast, generous on the small models
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile

# Cerebras
OPENAI_BASE_URL=https://api.cerebras.ai/v1
OPENAI_MODEL=llama3.1-8b

# SambaNova
OPENAI_BASE_URL=https://api.sambanova.ai/v1
OPENAI_MODEL=Meta-Llama-3.3-70B-Instruct
```

These are third-party free tiers: no SLA, quotas move without notice, and prompts
leave your network. If any of that bothers you, use **C**.

### 3. Set the env and deploy

```bash
npm i -g vercel
vercel link                       # pick the GitHub repo
vercel env add OPENAI_API_KEY     # then each of the others as you go
vercel env add OPENAI_BASE_URL
vercel env add OPENAI_MODEL
vercel                            # preview deployment
vercel --prod                     # production on <project>.vercel.app
```

`DATABASE_URL` comes from the Neon integration. If you wired Postgres up manually,
add it the same way, then run migrations **once from your machine** against the
pooled URL:

```bash
DATABASE_URL="postgres://user:***@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  npx drizzle-kit migrate
```

Optional: pin your free model so a fresh browser install has nothing to configure.
It pre-seeds the OpenRouter picker and overrides the `127.0.0.1` Ollama default:

```bash
vercel env add OPENROUTER_MODEL
vercel env add TALA_PIPER_BASE
```

### 4. Verify

```bash
curl -s https://<project>.vercel.app/api/health | python3 -m json.tool
```

Expect `db: true`, `hasLLM: true`, and `ok: true`. Then on the phone:

1. Open the URL in **Chrome on Android or Safari on iOS** (Firefox has no
   `SpeechRecognition`), Share → **Add to Home Screen**.
2. Tap the orb, allow the microphone, say a sentence, then "remind me to stretch".
   `tasks` should gain a row and `messages` should hold both turns.
3. Setup → Voice Lab → download a Piper voice → **turn on airplane mode** → talk to
   it. The local brain answers and speaks from the downloaded voice with no network.
   The *typed* path works offline too; spoken wake-word input does not, because
   Chrome/Safari do recognition server-side (Chrome 139+ can do it on-device for
   some languages).

That is the actual win of this architecture: hosting costs nothing, the model is
optional, and the voice stack is free because it lives on the phone.

## Option C: keep Ollama, make it reachable from Vercel

Vercel must be able to *call* your daemon. Do not port-forward 11434; use a tunnel.

```bash
# Ollama must listen beyond loopback
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

* **Tailscale Funnel** (free): `tailscale funnel 11434` → gives
  `https://<machine>.<tailnet>.ts.net`.
* **Cloudflare Tunnel** (free): `cloudflared tunnel --url http://localhost:11434`
  for a quick test; use a named tunnel with a Cloudflare Access policy for anything
  that will live past today. Treat the public URL as a secret — an open Ollama
  endpoint is an open GPU and an open spend button.

Then `vercel env add OLLAMA_URL https://…` and `vercel env add OLLAMA_MODEL
llama3.1:8b`. `planLlmStream()` prefers the env pair when the DB still points at
`127.0.0.1`, and `/api/health` probes the same URL, so the status banner reflects
reality instead of claiming "no local model".

Latency budget: a 70B model on a consumer GPU over a tunnel will take several
seconds to first token, and a long generation can still hit the Vercel function
limit. Keep `OPENAI_MODEL`-style small models as the production answer and Ollama
as the private/offline answer.

## Full self-host escape hatch

If you decide you want *everything* open-source on one box, nothing here is
Vercel-specific: `npm run build && npm start` behind Caddy on a LAN machine (or a
$5 VPS) with a local Postgres and local Ollama. Same code, same `/api/health`, and
`ollamaUrl` goes back to `http://127.0.0.1:11434`. The Vercel route is just the
zero-maintenance half of that.

## Vercel plan notes (Hobby, as of Sept 2026)

| Item | Free/Hobby limit | Relevance here |
| --- | --- | --- |
| Function duration | 300 s max (set to 60 s for `/api/chat`) | long LLM streams |
| Edge requests | 1M/month | fine for one user |
| Data transfer | 100 GB/month | TTS/model weights download to the *browser*, not through us |
| Commercial use | not allowed | keep it personal, or use Pro |
| Custom domain | 50 allowed | `tala.<yourdomain>.com` needs `DATABASE_URL` re-check only |

Hobby is licensed for non-commercial personal use — fine for your own assistant,
not for selling it.

## Rollback

```bash
vercel rollback                       # back to previous production build
vercel env rm OPENAI_API_KEY          # drop a key without redeploying code
```

Removing `OPENAI_MODEL`/`OPENAI_API_KEY` degrades TALA to its local brain plus
whatever key you paste in Setup; the app keeps answering commands either way.
