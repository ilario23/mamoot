CREATE TABLE IF NOT EXISTS "training_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"week_start" text NOT NULL,
	"adherence" integer NOT NULL,
	"effort" integer NOT NULL,
	"fatigue" integer NOT NULL,
	"soreness" integer NOT NULL,
	"mood" integer NOT NULL,
	"confidence" integer NOT NULL,
	"notes" text,
	"source" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_feedback_athlete_idx" ON "training_feedback" ("athlete_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_feedback_week_idx" ON "training_feedback" ("week_start");
