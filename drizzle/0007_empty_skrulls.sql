CREATE TABLE "physio_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"phase" text,
	"strength_sessions_per_week" integer,
	"sessions" jsonb NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"source_session_id" text,
	"shared_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "weight" real;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "training_balance" integer DEFAULT 50 NOT NULL;