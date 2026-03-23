ALTER TABLE "training_blocks"
ADD COLUMN "plan_env" text NOT NULL DEFAULT 'prod';

ALTER TABLE "weekly_plans"
ADD COLUMN "plan_env" text NOT NULL DEFAULT 'prod';

CREATE INDEX "training_blocks_athlete_plan_env_created_at_idx"
ON "training_blocks" ("athlete_id", "plan_env", "created_at" DESC);

CREATE INDEX "training_blocks_athlete_plan_env_active_idx"
ON "training_blocks" ("athlete_id", "plan_env", "is_active");

CREATE INDEX "weekly_plans_athlete_plan_env_created_at_idx"
ON "weekly_plans" ("athlete_id", "plan_env", "created_at" DESC);

CREATE INDEX "weekly_plans_athlete_plan_env_active_idx"
ON "weekly_plans" ("athlete_id", "plan_env", "is_active");
