CREATE TABLE "knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"context_length" integer DEFAULT 0 NOT NULL,
	"prompt_price" text DEFAULT '0' NOT NULL,
	"completion_price" text DEFAULT '0' NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"modalities" text DEFAULT 'text' NOT NULL,
	"created_at" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_name" text DEFAULT 'Sir' NOT NULL,
	"agent_name" text DEFAULT 'TALA' NOT NULL,
	"attitude" text DEFAULT 'butler' NOT NULL,
	"custom_attitude" text DEFAULT '' NOT NULL,
	"voice_gender" text DEFAULT 'male' NOT NULL,
	"voice_engine" text DEFAULT 'system' NOT NULL,
	"voice_id" text DEFAULT '' NOT NULL,
	"kokoro_dtype" text DEFAULT 'q8' NOT NULL,
	"voice_rate" integer DEFAULT 100 NOT NULL,
	"voice_pitch" integer DEFAULT 100 NOT NULL,
	"voice_uri" text DEFAULT '' NOT NULL,
	"speak_replies" boolean DEFAULT true NOT NULL,
	"wake_word" text DEFAULT 'tala' NOT NULL,
	"listen_mode" text DEFAULT 'continuous' NOT NULL,
	"silence_timeout_sec" integer DEFAULT 45 NOT NULL,
	"openrouter_key" text DEFAULT '' NOT NULL,
	"openrouter_model" text DEFAULT '' NOT NULL,
	"llm_backend" text DEFAULT 'auto' NOT NULL,
	"ollama_url" text DEFAULT 'http://127.0.0.1:11434' NOT NULL,
	"ollama_model" text DEFAULT '' NOT NULL,
	"llm_mode" text DEFAULT 'auto' NOT NULL,
	"timezone" text DEFAULT 'local' NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"due_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
