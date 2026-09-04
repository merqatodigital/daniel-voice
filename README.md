# TALA

TALA is a phone-first, voice-driven personal assistant with continuous conversation, tasks, a searchable knowledge base, configurable personality, streaming LLM replies, and open-source browser speech engines. The core app works without a cloud AI account.

## Requirements

A machine with Node.js, a PostgreSQL instance, and a `DATABASE_URL` environment variable pointing at that database. That is everything required for the open-source path.

## LLM options

- **OpenRouter:** Paste a key into the Setup panel. The key is stored in PostgreSQL, never returned to the browser, and is used only by the server.
- **Ollama:** Run `ollama serve` on the same machine, then choose an installed Ollama model in Setup. This path is fully local, open-source, free to run, and uses no external API.

Voice recognition and text-to-speech run in the browser, so they add zero server cost.

## Start

Point `DATABASE_URL` at PostgreSQL, then run:

```sh
npm install && npx drizzle-kit migrate && npm run dev
```

No Docker is required.

## Phone installation

TALA is an installable phone-first PWA. Add it to the phone home screen; microphone, speech, and downloaded voices are offline-capable where the browser supports them.
