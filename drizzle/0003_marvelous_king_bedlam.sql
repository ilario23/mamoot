CREATE TABLE "user_settings" (
	"athlete_id" bigint PRIMARY KEY NOT NULL,
	"max_hr" integer NOT NULL,
	"resting_hr" integer NOT NULL,
	"zones" jsonb NOT NULL,
	"goal" text,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"food_preferences" text,
	"injuries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_model" text,
	"updated_at" bigint NOT NULL
);
