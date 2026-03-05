ALTER TABLE "chat_message_feedback"
ADD COLUMN IF NOT EXISTS "route" text;
--> statement-breakpoint
ALTER TABLE "chat_message_feedback"
ADD COLUMN IF NOT EXISTS "model" text;
--> statement-breakpoint
ALTER TABLE "chat_message_feedback"
ADD COLUMN IF NOT EXISTS "trace_id" text;
