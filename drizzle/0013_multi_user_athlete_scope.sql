ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_details" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_streams" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_labels" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "zone_breakdowns" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "athlete_zones" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "athlete_gear" ADD COLUMN IF NOT EXISTS "athlete_id" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "activities"
SET "athlete_id" = COALESCE(NULLIF((("data"::jsonb -> 'athlete' ->> 'id')), '')::bigint, 0)
WHERE "athlete_id" = 0;
--> statement-breakpoint
UPDATE "activity_details"
SET "athlete_id" = COALESCE(NULLIF((("data"::jsonb -> 'athlete' ->> 'id')), '')::bigint, 0)
WHERE "athlete_id" = 0;
--> statement-breakpoint
UPDATE "activity_streams" s
SET "athlete_id" = a."athlete_id"
FROM "activities" a
WHERE s."athlete_id" = 0
  AND a."id" = s."activity_id";
--> statement-breakpoint
UPDATE "activity_labels" l
SET "athlete_id" = a."athlete_id"
FROM "activities" a
WHERE l."athlete_id" = 0
  AND a."id" = l."id";
--> statement-breakpoint
UPDATE "zone_breakdowns" z
SET "athlete_id" = a."athlete_id"
FROM "activities" a
WHERE z."athlete_id" = 0
  AND a."id" = z."activity_id";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_athlete_date_idx" ON "activities" ("athlete_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_details_athlete_id_idx" ON "activity_details" ("athlete_id","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_streams_athlete_id_idx" ON "activity_streams" ("athlete_id","activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_labels_athlete_id_idx" ON "activity_labels" ("athlete_id","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_breakdowns_athlete_id_idx" ON "zone_breakdowns" ("athlete_id","activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athlete_zones_athlete_id_idx" ON "athlete_zones" ("athlete_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athlete_gear_athlete_id_idx" ON "athlete_gear" ("athlete_id");
