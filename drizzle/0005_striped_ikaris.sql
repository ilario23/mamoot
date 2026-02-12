CREATE TABLE "dashboard_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"settings_hash" text NOT NULL,
	"last_activity_id" bigint NOT NULL,
	"last_activity_count" integer NOT NULL,
	"last_date" text NOT NULL,
	"continuation_state" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" bigint NOT NULL
);
