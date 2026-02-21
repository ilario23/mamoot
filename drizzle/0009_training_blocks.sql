CREATE TABLE "training_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"goal_event" text NOT NULL,
	"goal_date" text NOT NULL,
	"total_weeks" integer NOT NULL,
	"start_date" text NOT NULL,
	"phases" jsonb NOT NULL,
	"week_outlines" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "block_id" text;
--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "week_number" integer;
