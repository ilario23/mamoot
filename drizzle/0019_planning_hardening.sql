CREATE TABLE IF NOT EXISTS "ai_planning_state" (
  "key" text PRIMARY KEY NOT NULL,
  "athlete_id" bigint NOT NULL,
  "session_id" text NOT NULL,
  "state" jsonb NOT NULL,
  "expires_at" bigint NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_planning_state_athlete_session_idx"
  ON "ai_planning_state" ("athlete_id", "session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_planning_state_expires_idx"
  ON "ai_planning_state" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "weekly_zone_rollups" (
  "key" text PRIMARY KEY NOT NULL,
  "athlete_id" bigint NOT NULL,
  "week_start" text NOT NULL,
  "data" jsonb NOT NULL,
  "computed_at" bigint NOT NULL,
  "expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_zone_rollups_athlete_week_idx"
  ON "weekly_zone_rollups" ("athlete_id", "week_start");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "activities_athlete_date_desc_idx"
  ON "activities" ("athlete_id", "date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_breakdowns_athlete_activity_idx"
  ON "zone_breakdowns" ("athlete_id", "activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_plans_athlete_active_created_idx"
  ON "weekly_plans" ("athlete_id", "is_active", "created_at" DESC);
