// ============================================================
// Cache Record Types — Shared type definitions for Neon storage
// ============================================================
//
// These interfaces define the shape of records stored in Neon
// (PostgreSQL). They wrap raw Strava data with metadata like
// `fetchedAt` so the cache layer can decide when data is stale.

import type {
  StravaSummaryActivity,
  StravaDetailedActivity,
  StravaStream,
  StravaStreamSet,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaSummaryGear,
} from './strava';

// ----- Cached record wrappers -----

export interface CachedActivity {
  /** Strava activity ID (primary key) */
  id: number;
  /** Full raw Strava summary payload */
  data: StravaSummaryActivity;
  /** ISO date string derived from start_date_local for indexing */
  date: string;
  /** Unix ms timestamp of when this record was cached */
  fetchedAt: number;
}

export interface CachedActivityDetail {
  /** Strava activity ID (primary key) */
  id: number;
  /** Full raw Strava detailed activity payload */
  data: StravaDetailedActivity;
  /** Unix ms timestamp */
  fetchedAt: number;
}

export interface CachedActivityStreams {
  /** Strava activity ID (primary key) */
  activityId: number;
  /** Full raw streams (array or keyed object from older cached entries) */
  data: StravaStream[] | StravaStreamSet;
  /** Unix ms timestamp */
  fetchedAt: number;
}

export interface CachedAthleteStats {
  /** Athlete ID (primary key) */
  athleteId: number;
  /** Full raw stats payload */
  data: StravaAthleteStats;
  /** Unix ms timestamp */
  fetchedAt: number;
}

export interface CachedAthleteZones {
  /** Static key — we only store one zones record per athlete */
  key: string;
  /** Full raw zones payload */
  data: StravaAthleteZones;
  /** Unix ms timestamp */
  fetchedAt: number;
}

export interface CachedAthleteGear {
  /** Static key — one gear record per athlete */
  key: string;
  /** Bikes and shoes arrays from the athlete profile */
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
  /** IDs of gear the user has marked as retired (not from Strava) */
  retiredGearIds: string[];
  /** Unix ms timestamp */
  fetchedAt: number;
}

export interface CachedZoneBreakdown {
  /** Strava activity ID (primary key) */
  activityId: number;
  /** Hash of zone settings used for computation — invalidates on settings change */
  settingsHash: string;
  /** Per-zone time (seconds) and distance (km) */
  zones: Record<number, {time: number; distance: number}>;
  /** Unix ms timestamp of when this breakdown was computed */
  computedAt: number;
}

// ----- Chat persistence -----

export interface CachedChatSession {
  /** UUID primary key */
  id: string;
  /** Strava athlete ID */
  athleteId: number;
  /** Persona: "coach" | "nutritionist" | "physio" */
  persona: string;
  /** Auto-generated from first user message */
  title: string;
  /** Compressed memory of older messages */
  summary: string | null;
  /** Number of messages in this session */
  messageCount: number;
  /** Unix ms timestamp */
  createdAt: number;
  /** Unix ms timestamp */
  updatedAt: number;
}

export interface CachedChatMessage {
  /** UUID primary key (matches useChat msg.id) */
  id: string;
  /** FK to CachedChatSession.id */
  sessionId: string;
  /** "user" | "assistant" */
  role: string;
  /** Message text content */
  content: string;
  /** Unix ms timestamp */
  createdAt: number;
}

// ----- Activity label persistence -----

export interface CachedActivityLabel {
  /** Strava activity ID (primary key) */
  id: number;
  /** Structured workout label produced by the rule-based classifier */
  label: import('./workoutLabel').WorkoutLabel;
  /** Unix ms timestamp of when this label was computed */
  computedAt: number;
}

// ----- Coach plan persistence -----

export interface PlanSession {
  day: string;
  /** ISO date for this session, e.g. "2026-02-10" */
  date?: string;
  type: string;
  description: string;
  duration?: string;
  targetPace?: string;
  targetZone?: string;
  notes?: string;
}

export interface CachedCoachPlan {
  /** UUID primary key */
  id: string;
  /** Strava athlete ID */
  athleteId: number;
  /** Short title for the plan */
  title: string;
  /** Brief overview */
  summary: string | null;
  /** Target race/goal */
  goal: string | null;
  /** How many weeks the plan spans */
  durationWeeks: number | null;
  /** Structured array of workout sessions */
  sessions: PlanSession[];
  /** Full markdown rendering for display */
  content: string;
  /** Whether this is the currently active plan */
  isActive: boolean;
  /** FK to chat_messages.id that produced this plan */
  sourceMessageId: string | null;
  /** FK to chat_sessions.id where the plan was created */
  sourceSessionId: string | null;
  /** Unix ms timestamp when the plan was shared */
  sharedAt: number;
}
