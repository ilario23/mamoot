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

// ----- Database definition -----

const db = new Dexie('RunZoneAICache') as Dexie & {
  activities: EntityTable<CachedActivity, 'id'>;
  activityDetails: EntityTable<CachedActivityDetail, 'id'>;
  activityStreams: EntityTable<CachedActivityStreams, 'activityId'>;
  athleteStats: EntityTable<CachedAthleteStats, 'athleteId'>;
  athleteZones: EntityTable<CachedAthleteZones, 'key'>;
};

db.version(1).stores({
  // Primary key listed first, then indexed fields
  activities: 'id, date, fetchedAt',
  activityDetails: 'id',
  activityStreams: 'activityId',
  athleteStats: 'athleteId',
  athleteZones: 'key',
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
  ]);
};
