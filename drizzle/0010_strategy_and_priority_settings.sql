ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "strategy_selection_mode" text DEFAULT 'auto';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "strategy_preset" text DEFAULT 'polarized_80_20';
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "optimization_priority" text DEFAULT 'race_performance';
