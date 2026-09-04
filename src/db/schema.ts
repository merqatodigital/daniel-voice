import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

/** Single-user profile/settings row (id = 1 by convention). */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userName: text("user_name").notNull().default("Sir"),
  agentName: text("agent_name").notNull().default("TALA"),
  attitude: text("attitude").notNull().default("butler"),
  customAttitude: text("custom_attitude").notNull().default(""),
  voiceGender: text("voice_gender").notNull().default("male"),
  // "system" | "piper" | "kokoro"
  voiceEngine: text("voice_engine").notNull().default("system"),
  // Open-source voice id, e.g. "en_US-ryan-medium" or "af_heart"
  voiceId: text("voice_id").notNull().default(""),
  // Kokoro model precision: "q8" (86MB) | "fp32" (326MB, best quality)
  kokoroDtype: text("kokoro_dtype").notNull().default("q8"),
  voiceRate: integer("voice_rate").notNull().default(100), // percent
  voicePitch: integer("voice_pitch").notNull().default(100), // percent
  voiceURI: text("voice_uri").notNull().default(""),
  speakReplies: boolean("speak_replies").notNull().default(true),
  wakeWord: text("wake_word").notNull().default("tala"),
  // "continuous" (always on) | "wake" (wait for wake word) | "tap" (manual)
  listenMode: text("listen_mode").notNull().default("continuous"),
  // Auto-close the mic after this many seconds of silence in continuous mode.
  silenceTimeoutSec: integer("silence_timeout_sec").notNull().default(45),
  // ---- OpenRouter ----
  // Stored server-side only; never returned to the client in full.
  openrouterKey: text("openrouter_key").notNull().default(""),
  openrouterModel: text("openrouter_model").notNull().default(""),
  // Backend preference: auto prefers local Ollama, then optional cloud providers.
  llmBackend: text("llm_backend").notNull().default("auto"),
  ollamaUrl: text("ollama_url").notNull().default("http://127.0.0.1:11434"),
  ollamaModel: text("ollama_model").notNull().default(""),
  // "auto" = local brain first then LLM, "always" = always use the LLM, "off"
  llmMode: text("llm_mode").notNull().default("auto"),
  timezone: text("timezone").notNull().default("local"),
  units: text("units").notNull().default("metric"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Knowledge base entries the agent can reference. */
export const knowledge = pgTable("knowledge", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").notNull().default(""),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Conversation log. */
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(), // user | agent
  content: text("content").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Tasks / reminders the assistant manages. */
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  dueAt: timestamp("due_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Cached OpenRouter model catalogue — refreshed on demand. */
export const models = pgTable("models", {
  id: text("id").primaryKey(), // e.g. "anthropic/claude-3-haiku"
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  contextLength: integer("context_length").notNull().default(0),
  promptPrice: text("prompt_price").notNull().default("0"),
  completionPrice: text("completion_price").notNull().default("0"),
  isFree: boolean("is_free").notNull().default(false),
  provider: text("provider").notNull().default(""),
  modalities: text("modalities").notNull().default("text"),
  createdAt: integer("created_at").notNull().default(0),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
export type Knowledge = typeof knowledge.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ModelRow = typeof models.$inferSelect;
