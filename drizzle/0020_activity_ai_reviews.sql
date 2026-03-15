CREATE TABLE IF NOT EXISTS "activity_ai_reviews" (
  "athlete_id" bigint NOT NULL,
  "activity_id" bigint NOT NULL,
  "model" text NOT NULL,
  "report_text" text NOT NULL,
  "raw_detail_text" text,
  "usage_json" jsonb,
  "weather_json" jsonb,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  CONSTRAINT "activity_ai_reviews_pk" PRIMARY KEY("athlete_id","activity_id","model")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_ai_reviews_athlete_activity_idx"
  ON "activity_ai_reviews" ("athlete_id", "activity_id");
