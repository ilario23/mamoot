// ============================================================
// Dexie.js Local Database — IndexedDB persistence for Strava data
// ============================================================

import Dexie, {type EntityTable} from 'dexie';
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
// Each record wraps the raw Strava data with a `fetchedAt` timestamp
// so the cache layer can decide when data is stale.

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

// ----- Database definition -----

const db = new Dexie('RunZoneAICache') as Dexie & {
  activities: EntityTable<CachedActivity, 'id'>;
  activityDetails: EntityTable<CachedActivityDetail, 'id'>;
  activityStreams: EntityTable<CachedActivityStreams, 'activityId'>;
  athleteStats: EntityTable<CachedAthleteStats, 'athleteId'>;
  athleteZones: EntityTable<CachedAthleteZones, 'key'>;
  athleteGear: EntityTable<CachedAthleteGear, 'key'>;
  zoneBreakdowns: EntityTable<CachedZoneBreakdown, 'activityId'>;
  chatSessions: EntityTable<CachedChatSession, 'id'>;
  chatMessages: EntityTable<CachedChatMessage, 'id'>;
};

db.version(1).stores({
  // Primary key listed first, then indexed fields
  activities: 'id, date, fetchedAt',
  activityDetails: 'id',
  activityStreams: 'activityId',
  athleteStats: 'athleteId',
  athleteZones: 'key',
});

db.version(2).stores({
  activities: 'id, date, fetchedAt',
  activityDetails: 'id',
  activityStreams: 'activityId',
  athleteStats: 'athleteId',
  athleteZones: 'key',
  athleteGear: 'key',
});

db.version(3).stores({
  activities: 'id, date, fetchedAt',
  activityDetails: 'id',
  activityStreams: 'activityId',
  athleteStats: 'athleteId',
  athleteZones: 'key',
  athleteGear: 'key',
  zoneBreakdowns: 'activityId, settingsHash',
});

db.version(4).stores({
  activities: 'id, date, fetchedAt',
  activityDetails: 'id',
  activityStreams: 'activityId',
  athleteStats: 'athleteId',
  athleteZones: 'key',
  athleteGear: 'key',
  zoneBreakdowns: 'activityId, settingsHash',
  chatSessions: 'id, [athleteId+persona], updatedAt',
  chatMessages: 'id, sessionId, createdAt',
});

export {db};

// ----- Cache size helper -----

export const getCacheStats = async (): Promise<{
  activities: number;
  activityDetails: number;
  activityStreams: number;
  totalRecords: number;
}> => {
  const [activities, activityDetails, activityStreams] = await Promise.all([
    db.activities.count(),
    db.activityDetails.count(),
    db.activityStreams.count(),
  ]);

  return {
    activities,
    activityDetails,
    activityStreams,
    totalRecords: activities + activityDetails + activityStreams,
  };
};

export const clearAllCache = async (): Promise<void> => {
  await Promise.all([
    db.activities.clear(),
    db.activityDetails.clear(),
    db.activityStreams.clear(),
    db.athleteStats.clear(),
    db.athleteZones.clear(),
    db.athleteGear.clear(),
    db.zoneBreakdowns.clear(),
    db.chatSessions.clear(),
    db.chatMessages.clear(),
  ]);
};
