CREATE TABLE "orchestrator_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text NOT NULL,
	"owner_persona" text,
	"due_date" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_blockers" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"session_id" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text NOT NULL,
	"linked_plan_item_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestrator_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"athlete_id" bigint NOT NULL,
	"session_id" text NOT NULL,
	"target_persona" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
