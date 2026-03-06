CREATE TABLE IF NOT EXISTS "athlete_readiness_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"date" text NOT NULL,
	"hrv" real,
	"sleep_hours" real,
	"resting_hr" integer,
	"readiness_score" integer,
	"session_rpe" integer,
	"adherence_score" real,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athlete_readiness_athlete_idx" ON "athlete_readiness_signals" ("athlete_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athlete_readiness_date_idx" ON "athlete_readiness_signals" ("date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_telemetry_events" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"route" text NOT NULL,
	"event" text NOT NULL,
	"athlete_id" bigint,
	"session_id" text,
	"model" text,
	"prompt_hash" text,
	"prompt_version" text,
	"validator_status" text,
	"repair_reason" text,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" real,
	"payload" jsonb,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_telemetry_trace_idx" ON "ai_telemetry_events" ("trace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_telemetry_route_event_idx" ON "ai_telemetry_events" ("route", "event");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_telemetry_created_idx" ON "ai_telemetry_events" ("created_at");
