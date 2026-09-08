# TALA

TALA is a phone-first, voice-driven personal assistant with continuous conversation, tasks, a searchable knowledge base, configurable personality, streaming replies, and open-source browser speech engines.

Hermes Agent is now the primary agent runtime when configured. The existing local/Ollama path remains available as a fallback while Hermes is being brought online.

## Requirements

A machine with Node.js, PostgreSQL, and a `DATABASE_URL` environment variable.

For the Hermes path, install and run Hermes Agent separately on the same machine or network. TALA talks to Hermes through its OpenAI-compatible API server; Hermes remains responsible for agent tools, skills, memory, delegation, and model execution.

## Hermes Agent

Enable the Hermes API server in `~/.hermes/.env`:

```sh
API_SERVER_ENABLED=true
API_SERVER_KEY=change-me
```

Then start Hermes:

```sh
hermes gateway
```

By default Hermes listens on:

```text
http://127.0.0.1:8642
```

Configure TALA with server-side environment variables:

```sh
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_KEY=change-me
HERMES_MODEL=hermes-agent
HERMES_SESSION_KEY=tala:main:web:owner
```

Optional TALA identity override:

```sh
TALA_SYSTEM_PROMPT="You are TALA, the user's persistent personal agent."
```

`HERMES_API_KEY` stays on the Next.js server and is never sent to the phone/browser.

When `HERMES_API_KEY` is present, `/api/chat` routes TALA conversations through Hermes and streams the response back to the existing voice UI. If Hermes is not configured or cannot be reached before a response starts, the legacy TALA local/Ollama path remains available as a fallback.

## Local model fallback

- **Ollama:** Run `ollama serve` on the same machine, then choose an installed Ollama model in Setup. This path is fully local, open-source, free to run, and uses no external inference API.
- The older OpenRouter integration remains in the repository for compatibility but is not required for the open-source Hermes + local-model path.

Voice recognition and text-to-speech currently run in the browser, so they add zero server inference cost.

## Start

Point `DATABASE_URL` at PostgreSQL, then run:

```sh
npm install && npx drizzle-kit migrate && npm run dev
```

No Docker is required.

## Phone installation

TALA is an installable phone-first PWA. Add it to the phone home screen; microphone, speech, and downloaded voices are offline-capable where the browser supports them.
