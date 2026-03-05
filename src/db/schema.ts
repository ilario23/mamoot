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
  real,
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
  /** Athlete body weight in kg (from Strava profile). Used for g/kg nutrition dosing. */
  weight: real('weight'),
  /** Athlete city (from Strava profile). Used for weather-aware hydration advice. */
  city: text('city'),
  /** Training focus: 20 = run-centric, 80 = gym-centric, 50 = balanced. */
  trainingBalance: integer('training_balance').notNull().default(50),
  /** Free-text preferences/constraints for weekly plan generation (set via Coach chat or Weekly Plan page). */
  weeklyPreferences: text('weekly_preferences'),
  /** Strategy mode used when generating plans: auto-select or manual preset. */
  strategySelectionMode: text('strategy_selection_mode').default('auto'),
  /** Manual strategy preset selection for plan generation. */
  strategyPreset: text('strategy_preset').default('polarized_80_20'),
  /** Optimization priority used to steer generated plans. */
  optimizationPriority: text('optimization_priority').default('race_performance'),
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

// ----- Chat Message Feedback -----
// Explicit quality labels for assistant responses (thumbs up/down + reason).
export const chatMessageFeedback = pgTable('chat_message_feedback', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  sessionId: text('session_id').notNull(),
  messageId: text('message_id').notNull(),
  persona: text('persona').notNull(),
  rating: text('rating').notNull(), // "helpful" | "not_helpful"
  reason: text('reason'), // short taxonomy code
  freeText: text('free_text'),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
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

// ----- Best Efforts Cache -----
// Stores the athlete's 6-month personal bests per standard distance.
// Used by the activity-report route to conditionally include best efforts
// only when the current activity is close to these bests.
// Invalidated when the activity_details row count changes (new sync / deletion).
export const bestEffortsCache = pgTable('best_efforts_cache', {
  athleteId: bigint('athlete_id', {mode: 'number'}).primaryKey(),
  /** { "400m": 68, "1k": 195, "5k": 1200, ... } — elapsed_time in seconds */
  bests: jsonb('bests').notNull(),
  /** Total activity_details count when last computed — triggers recompute on mismatch */
  activityCount: integer('activity_count').notNull(),
  computedAt: bigint('computed_at', {mode: 'number'}).notNull(),
});

// ----- Training Blocks -----
// Periodized multi-week macro plans (e.g. 14-week marathon block).
// Contains phases (Base, Build, Taper…) and per-week outlines with
// volume targets, intensity levels, and key workouts.
export const trainingBlocks = pgTable('training_blocks', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  /** Goal event name, e.g. "Berlin Marathon" */
  goalEvent: text('goal_event').notNull(),
  /** ISO date of the goal event, e.g. "2026-09-27" */
  goalDate: text('goal_date').notNull(),
  totalWeeks: integer('total_weeks').notNull(),
  /** ISO Monday date for the first week, e.g. "2026-06-29" */
  startDate: text('start_date').notNull(),
  /** TrainingPhase[] — named phases with week ranges */
  phases: jsonb('phases').notNull(),
  /** WeekOutline[] — per-week volume/intensity/workout targets */
  weekOutlines: jsonb('week_outlines').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  /** Soft-delete timestamp. Null means the block is visible/active in history. */
  deletedAt: bigint('deleted_at', {mode: 'number'}),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ----- Weekly Plans -----
// Unified weekly plans combining Coach (running) and Physio (strength/mobility).
// Generated by the orchestrator pipeline. Replaces separate coach_plans and physio_plans.
export const weeklyPlans = pgTable('weekly_plans', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  /** ISO Monday date for this plan week, e.g. "2026-02-23" */
  weekStart: text('week_start').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  goal: text('goal'),
  /** UnifiedSession[] — combined running + physio sessions for each day */
  sessions: jsonb('sessions').notNull(),
  /** Full markdown rendering for display */
  content: text('content').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  /** FK to training_blocks.id — links this week to a macro plan */
  blockId: text('block_id'),
  /** 1-indexed week number within the training block */
  weekNumber: integer('week_number'),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
});

// ----- Orchestrator Goals -----
// High-level objectives tracked in the master orchestrator chat.
export const orchestratorGoals = pgTable('orchestrator_goals', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  sessionId: text('session_id').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  status: text('status').notNull(), // "active" | "on_hold" | "done"
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ----- Orchestrator Plan Items -----
// Actionable tasks tracked by the orchestrator and execution personas.
export const orchestratorPlanItems = pgTable('orchestrator_plan_items', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  sessionId: text('session_id').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  status: text('status').notNull(), // "todo" | "in_progress" | "blocked" | "done"
  ownerPersona: text('owner_persona'),
  dueDate: text('due_date'),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ----- Orchestrator Blockers -----
// Open issues that prevent plan completion.
export const orchestratorBlockers = pgTable('orchestrator_blockers', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  sessionId: text('session_id').notNull(),
  title: text('title').notNull(),
  detail: text('detail'),
  status: text('status').notNull(), // "open" | "resolved"
  linkedPlanItemId: text('linked_plan_item_id'),
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});

// ----- Orchestrator Handoffs -----
// Explicit coordination tasks sent from orchestrator to specialist personas.
export const orchestratorHandoffs = pgTable('orchestrator_handoffs', {
  id: text('id').primaryKey(),
  athleteId: bigint('athlete_id', {mode: 'number'}).notNull(),
  sessionId: text('session_id').notNull(),
  targetPersona: text('target_persona').notNull(), // "coach" | "nutritionist" | "physio"
  title: text('title').notNull(),
  detail: text('detail'),
  status: text('status').notNull(), // "pending" | "accepted" | "done" | "cancelled"
  createdAt: bigint('created_at', {mode: 'number'}).notNull(),
  updatedAt: bigint('updated_at', {mode: 'number'}).notNull(),
});
