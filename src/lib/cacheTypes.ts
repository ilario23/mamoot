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

// ----- Dashboard cache persistence -----

export interface CachedDashboardContinuationState {
  /** Last BF (Base Fitness) EWMA value */
  bf: number;
  /** Last LI (Load Impact) EWMA value */
  li: number;
}

export interface CachedDashboardCache {
  /** Cache key, e.g. "fitness:{athleteId}" */
  key: string;
  /** Strava athlete ID */
  athleteId: number;
  /** Hash of (zones + maxHr + restingHr) — mismatch triggers full recompute */
  settingsHash: string;
  /** Most recent activity ID — detects new activities for incremental append */
  lastActivityId: number;
  /** Activity count — detects deletions */
  lastActivityCount: number;
  /** Last processed date (YYYY-MM-DD) for EWMA resumption */
  lastDate: string;
  /** EWMA state to resume from */
  continuationState: CachedDashboardContinuationState;
  /** FitnessDataPoint[] — the full 365-day computed result */
  data: import('@/utils/trainingLoad').FitnessDataPoint[];
  /** Unix ms timestamp */
  computedAt: number;
}

// ----- Chat persistence -----

export interface CachedChatSession {
  /** UUID primary key */
  id: string;
  /** Strava athlete ID */
  athleteId: number;
  /** Persona: "coach" | "nutritionist" | "physio" | "orchestrator" */
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

export type ChatFeedbackRating = 'helpful' | 'not_helpful';

export type ChatFeedbackReason =
  | 'helpful'
  | 'unsafe'
  | 'too_generic'
  | 'not_actionable'
  | 'wrong_context'
  | 'other';

export interface CachedChatMessageFeedback {
  /** UUID primary key */
  id: string;
  /** Strava athlete ID */
  athleteId: number;
  /** FK to CachedChatSession.id */
  sessionId: string;
  /** FK to CachedChatMessage.id */
  messageId: string;
  /** Persona used when this response was produced */
  persona: string;
  /** "helpful" or "not_helpful" */
  rating: ChatFeedbackRating;
  /** Short taxonomy code */
  reason: ChatFeedbackReason | null;
  /** Optional user free text comment */
  freeText: string | null;
  /** Unix ms timestamp */
  createdAt: number;
  /** Unix ms timestamp */
  updatedAt: number;
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

// ----- Weekly plan persistence -----

export interface PhysioExercise {
  name: string;
  sets?: string;
  reps?: string;
  tempo?: string;
  notes?: string;
}

export interface UnifiedSession {
  /** Day label, e.g. "Monday" */
  day: string;
  /** ISO date, e.g. "2026-02-23" */
  date: string;
  /** Running component (from Coach) */
  run?: {
    type: string;
    description: string;
    duration?: string;
    targetPace?: string;
    targetZone?: string;
    notes?: string;
  };
  /** Strength/mobility component (from Physio) */
  physio?: {
    type: string;
    exercises: PhysioExercise[];
    duration?: string;
    notes?: string;
  };
  /** Day-level combined notes */
  notes?: string;
  /** Optional completed activity metadata used for retrospective matching */
  actualActivity?: {
    id: string;
    name: string;
    type: string;
    distanceKm: number;
    durationSec: number;
    date: string;
  };
  /** Snapshot of block-week intent when this plan was generated */
  blockIntent?: {
    blockId: string;
    weekNumber: number;
    goalEvent: string;
    goalDate: string;
    weekType: string;
    volumeTargetKm: number;
    intensityLevel: string;
    keyWorkouts: string[];
  };
}

export interface CachedWeeklyPlan {
  /** UUID primary key */
  id: string;
  /** Strava athlete ID */
  athleteId: number;
  /** ISO Monday date, e.g. "2026-02-23" */
  weekStart: string;
  /** Short title for the plan */
  title: string;
  /** Brief overview */
  summary: string | null;
  /** Target race/goal */
  goal: string | null;
  /** Combined running + physio sessions for each day */
  sessions: UnifiedSession[];
  /** Full markdown rendering for display */
  content: string;
  /** Whether this is the currently active plan */
  isActive: boolean;
  /** FK to training_blocks.id — links this week to a macro plan */
  blockId: string | null;
  /** 1-indexed week number within the training block */
  weekNumber: number | null;
  /** Unix ms timestamp when the plan was created */
  createdAt: number;
}

// ----- Training Blocks (Macro Periodization) -----

export interface TrainingPhase {
  name: string;
  weekNumbers: number[];
  focus: string;
  volumeDirection: 'build' | 'hold' | 'reduce';
}

export interface WeekOutline {
  weekNumber: number;
  phase: string;
  weekType: 'build' | 'recovery' | 'peak' | 'taper' | 'race' | 'base' | 'off-load';
  volumeTargetKm: number;
  intensityLevel: 'low' | 'moderate' | 'high';
  keyWorkouts: string[];
  notes: string;
}

export interface CachedTrainingBlock {
  id: string;
  athleteId: number;
  goalEvent: string;
  goalDate: string;
  totalWeeks: number;
  startDate: string;
  phases: TrainingPhase[];
  weekOutlines: WeekOutline[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// ----- Orchestrator tracking persistence -----

export type OrchestratorGoalStatus = 'active' | 'on_hold' | 'done';

export interface CachedOrchestratorGoal {
  id: string;
  athleteId: number;
  sessionId: string;
  title: string;
  detail: string | null;
  status: OrchestratorGoalStatus;
  createdAt: number;
  updatedAt: number;
}

export type OrchestratorPlanItemStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'done';

export interface CachedOrchestratorPlanItem {
  id: string;
  athleteId: number;
  sessionId: string;
  title: string;
  detail: string | null;
  status: OrchestratorPlanItemStatus;
  ownerPersona: string | null;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
}

export type OrchestratorBlockerStatus = 'open' | 'resolved';

export interface CachedOrchestratorBlocker {
  id: string;
  athleteId: number;
  sessionId: string;
  title: string;
  detail: string | null;
  status: OrchestratorBlockerStatus;
  linkedPlanItemId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type OrchestratorHandoffStatus =
  | 'pending'
  | 'accepted'
  | 'done'
  | 'cancelled';

export interface CachedOrchestratorHandoff {
  id: string;
  athleteId: number;
  sessionId: string;
  targetPersona: 'coach' | 'nutritionist' | 'physio';
  title: string;
  detail: string | null;
  status: OrchestratorHandoffStatus;
  createdAt: number;
  updatedAt: number;
}
