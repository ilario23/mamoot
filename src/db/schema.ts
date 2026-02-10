// ============================================================
// Drizzle ORM Schema — Neon PostgreSQL (mirrors Dexie local cache)
// ============================================================
//
// Each table stores raw Strava JSON payloads in a `data` JSONB column
// alongside metadata (fetchedAt timestamps, indexes). This mirrors the
// existing Dexie/IndexedDB structure for a smooth migration path.
// Tables can be normalized later for more powerful analytical queries.

import {pgTable, bigint, integer, text, jsonb} from 'drizzle-orm/pg-core';

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
