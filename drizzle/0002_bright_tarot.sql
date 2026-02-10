CREATE TABLE "coach_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"goal" text,
	"duration_weeks" integer,
	"sessions" jsonb NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_message_id" text,
	"source_session_id" text,
	"shared_at" bigint NOT NULL
);
