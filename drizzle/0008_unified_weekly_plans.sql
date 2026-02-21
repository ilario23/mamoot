CREATE TABLE "weekly_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"week_start" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"goal" text,
	"sessions" jsonb NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
DROP TABLE "coach_plans";
--> statement-breakpoint
DROP TABLE "physio_plans";
