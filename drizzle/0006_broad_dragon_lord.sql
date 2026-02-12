CREATE TABLE "best_efforts_cache" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"bests" jsonb NOT NULL,
	"activity_count" integer NOT NULL,
	"computed_at" bigint NOT NULL
);
