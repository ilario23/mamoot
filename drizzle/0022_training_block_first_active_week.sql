ALTER TABLE "training_blocks" ADD COLUMN IF NOT EXISTS "first_active_week_number" integer DEFAULT 1 NOT NULL;
