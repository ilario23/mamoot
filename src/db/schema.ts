// ============================================================
// Drizzle ORM Schema — Neon PostgreSQL (primary persistent store)
// ============================================================
//
// Each table stores raw Strava JSON payloads in a `data` JSONB column
// alongside metadata (fetchedAt timestamps, indexes).
// Tables can be normalized later for more powerful analytical queries.

import {
  pgTable,
  bigint,
  integer,
  text,
  jsonb,
  boolean,
} from 'drizzle-orm/pg-core';

// ----- Activities -----
// Maps to CachedActivity (src/lib/db.ts)
export const activities = pgTable('activities', {
  id: bigint('id', {mode: 'number'}).primaryKey(),
  data: jsonb('data').notNull(),
  date: text('date').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

// ----- Activity Details -----
// Maps to CachedActivityDetail
export const activityDetails = pgTable('activity_details', {
  id: bigint('id', {mode: 'number'}).primaryKey(),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

// ----- Activity Streams -----
// Maps to CachedActivityStreams (HR, pace, cadence time-series)
export const activityStreams = pgTable('activity_streams', {
  activityId: bigint('activity_id', {mode: 'number'}).primaryKey(),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

// ----- Athlete Stats -----
// Maps to CachedAthleteStats (recent, YTD, all-time totals)
export const athleteStats = pgTable('athlete_stats', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

// ----- Athlete Zones -----
// Maps to CachedAthleteZones (HR and power zones)
export const athleteZones = pgTable('athlete_zones', {
  key: text('key').primaryKey(),
  data: jsonb('data').notNull(),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

// ----- Athlete Gear -----
// Maps to CachedAthleteGear (bikes and shoes)
export const athleteGear = pgTable('athlete_gear', {
  key: text('key').primaryKey(),
  bikes: jsonb('bikes').notNull(),
  shoes: jsonb('shoes').notNull(),
  retiredGearIds: jsonb('retired_gear_ids').notNull().default([]),
  fetchedAt: bigint('fetched_at', {mode: 'number'}).notNull(),
});

// ----- Zone Breakdowns -----
// Maps to CachedZoneBreakdown (per-zone time/distance)
export const zoneBreakdowns = pgTable('zone_breakdowns', {
  activityId: bigint('activity_id', {mode: 'number'}).primaryKey(),
  settingsHash: text('settings_hash').notNull(),
  zones: jsonb('zones').notNull(),
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

// ----- User Settings -----
// Synced from localStorage to enable server-side AI tool access.
// Stores HR zones, training goal, allergies, dietary preferences, and injuries.
export const userSettings = pgTable('user_settings', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  maxHr: integer('max_hr').notNull(),
  restingHr: integer('resting_hr').notNull(),
  zones: jsonb('zones').notNull(), // {z1: [min,max], ...z6}
  goal: text('goal'),
  allergies: jsonb('allergies').notNull().default([]),
  foodPreferences: text('food_preferences'),
  injuries: jsonb('injuries').notNull().default([]),
  aiModel: text('ai_model'),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ----- Chat Sessions -----
// Maps to CachedChatSession (src/lib/db.ts)
export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  persona: text('persona').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  messageCount: integer('message_count').notNull(),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ----- Chat Messages -----
// Maps to CachedChatMessage (src/lib/db.ts)
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
});

// ----- Activity Labels -----
// Maps to CachedActivityLabel (src/lib/db.ts)
// Rule-based workout classification labels (e.g., "Intervals: 5x1000m @ 4:10/km Z4")
export const activityLabels = pgTable('activity_labels', {
  id: bigint('id', {mode: 'number'}).primaryKey(),
  data: jsonb('data').notNull(), // WorkoutLabel JSON
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

// ----- Dashboard Cache -----
// Stores pre-computed dashboard metrics (fitness EWMA, etc.) with
// continuation state for incremental append on new activities.
// Full recompute is triggered when settingsHash changes (zone/HR changes).
export const dashboardCache = pgTable('dashboard_cache', {
  /** Cache key, e.g. "fitness:{athleteId}" */
  key: text('key').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  /** Hash of (zones + maxHr + restingHr) — mismatch triggers full recompute */
  settingsHash: text('settings_hash').notNull(),
  /** Most recent activity ID — detects new activities for incremental append */
  lastActivityId: bigint('last_activity_id', {mode: 'number'}).notNull(),
  /** Activity count — detects deletions */
  lastActivityCount: integer('last_activity_count').notNull(),
  /** Last processed date (YYYY-MM-DD) for EWMA resumption */
  lastDate: text('last_date').notNull(),
  /** { bf: number, li: number } — EWMA state to resume from */
  continuationState: jsonb('continuation_state').notNull(),
  /** FitnessDataPoint[] — the full 365-day computed result */
  data: jsonb('data').notNull(),
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

// ----- Coach Plans -----
// Maps to CachedCoachPlan (src/lib/db.ts)
// Multiple plans per athlete with an active flag for plan history.
export const coachPlans = pgTable('coach_plans', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  goal: text('goal'),
  durationWeeks: integer('duration_weeks'),
  sessions: jsonb('sessions').notNull(),
  content: text('content').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sourceMessageId: text('source_message_id'),
  sourceSessionId: text('source_session_id'),
  sharedAt: bigint('shared_at', {mode: 'number'}).notNull(),
});
