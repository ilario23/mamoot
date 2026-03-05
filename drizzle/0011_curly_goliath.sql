CREATE TABLE "chat_message_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"session_id" text NOT NULL,
	"message_id" text NOT NULL,
	"persona" text NOT NULL,
	"rating" text NOT NULL,
	"reason" text,
	"free_text" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
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
	"deleted_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "block_id" text;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "week_number" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "weekly_preferences" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "strategy_selection_mode" text DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "strategy_preset" text DEFAULT 'polarized_80_20';--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "optimization_priority" text DEFAULT 'race_performance';