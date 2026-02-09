// ============================================================
// Strava Cache-Through Layer
// Checks Dexie (IndexedDB) first, falls back to Strava API,
// then persists the response locally.
// ============================================================

import {db} from './db';
import {
  fetchAllActivities,
  fetchActivityDetail,
  fetchActivityStreams,
  fetchAthleteStats,
  fetchAthleteZones,
  fetchAthleteWithGear,
  transformActivity,
  transformStreams,
} from './strava';
import type {
  StravaSummaryActivity,
  StravaDetailedActivity,
  StravaStream,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaSummaryGear,
} from './strava';
import type {ActivitySummary, StreamPoint} from './mockData';

// ----- Staleness thresholds (ms) -----

const STALE = {
  /** Activity list: refetch after 1 hour */
  activities: 60 * 60 * 1000,
  /** Activity detail: never expires (historical data) */
  activityDetail: Infinity,
  /** Activity streams: never expires (historical data) */
  activityStreams: Infinity,
  /** Athlete stats: refetch after 1 hour */
  athleteStats: 60 * 60 * 1000,
  /** Athlete zones: refetch after 24 hours */
  athleteZones: 24 * 60 * 60 * 1000,
  /** Athlete gear: refetch after 1 hour */
  athleteGear: 60 * 60 * 1000,
} as const;

const isFresh = (fetchedAt: number, maxAge: number): boolean => {
  if (maxAge === Infinity) return true;
  return Date.now() - fetchedAt < maxAge;
};

// ----- Activities (list) -----

/**
 * Returns all activities, transformed to app format.
 * Strategy: if we have cached activities and the most recent fetch is fresh,
 * return from cache. Otherwise, fetch from API and merge into the cache.
 */
export const cachedGetAllActivities = async (): Promise<ActivitySummary[]> => {
  const cachedCount = await db.activities.count();

  if (cachedCount > 0) {
    // Check the freshness of the most recently fetched record
    const newest = await db.activities.orderBy('fetchedAt').last();

    if (newest && isFresh(newest.fetchedAt, STALE.activities)) {
      // Cache is fresh — return everything from Dexie
      const all = await db.activities.orderBy('date').reverse().toArray();
      return all.map((record) => transformActivity(record.data));
    }
  }

  // Cache miss or stale — fetch from API
  const raw = await fetchAllActivities();
  const now = Date.now();

  // Bulk-put into Dexie (upsert by primary key)
  await db.activities.bulkPut(
    raw.map((activity) => ({
      id: activity.id,
      data: activity,
      date: activity.start_date_local.split('T')[0],
      fetchedAt: now,
    })),
  );

  // Return from the (now up-to-date) cache so ordering is consistent
  const all = await db.activities.orderBy('date').reverse().toArray();
  return all.map((record) => transformActivity(record.data));
};

// ----- Activity Detail -----

/**
 * Returns a single detailed activity.
 * Historical activities never change, so once cached they stay forever.
 */
export const cachedGetActivityDetail = async (
  activityId: number,
): Promise<StravaDetailedActivity> => {
  const cached = await db.activityDetails.get(activityId);

  if (cached && isFresh(cached.fetchedAt, STALE.activityDetail)) {
    return cached.data;
  }

  // Fetch from API and store
  const detail = await fetchActivityDetail(activityId);
  await db.activityDetails.put({
    id: activityId,
    data: detail,
    fetchedAt: Date.now(),
  });

  return detail;
};

// ----- Activity Streams -----

/**
 * Returns stream data for an activity, transformed to StreamPoint[].
 * Streams never change for historical activities.
 */
export const cachedGetActivityStreams = async (
  activityId: number,
): Promise<StreamPoint[]> => {
  const cached = await db.activityStreams.get(activityId);

  if (cached && isFresh(cached.fetchedAt, STALE.activityStreams)) {
    return transformStreams(cached.data);
  }

  // Fetch from API and store raw streams
  const raw = await fetchActivityStreams(activityId);
  await db.activityStreams.put({
    activityId,
    data: raw,
    fetchedAt: Date.now(),
  });

  return transformStreams(raw);
};

// ----- Athlete Stats -----

/**
 * Returns athlete aggregate stats (recent, ytd, all-time totals).
 * These update when new activities are recorded, so we refetch after 1 hour.
 */
export const cachedGetAthleteStats = async (
  athleteId: number,
): Promise<StravaAthleteStats> => {
  const cached = await db.athleteStats.get(athleteId);

  if (cached && isFresh(cached.fetchedAt, STALE.athleteStats)) {
    return cached.data;
  }

  const stats = await fetchAthleteStats(athleteId);
  await db.athleteStats.put({
    athleteId,
    data: stats,
    fetchedAt: Date.now(),
  });

  return stats;
};

// ----- Athlete Zones -----

/**
 * Returns heart rate (and optionally power) zones.
 * These rarely change — refetch after 24 hours.
 */
export const cachedGetAthleteZones = async (): Promise<StravaAthleteZones> => {
  const ZONES_KEY = 'athlete-zones';
  const cached = await db.athleteZones.get(ZONES_KEY);

  if (cached && isFresh(cached.fetchedAt, STALE.athleteZones)) {
    return cached.data;
  }

  const zones = await fetchAthleteZones();
  await db.athleteZones.put({
    key: ZONES_KEY,
    data: zones,
    fetchedAt: Date.now(),
  });

  return zones;
};

// ----- Athlete Gear -----

/**
 * Returns athlete's bikes and shoes, fetched from GET /athlete.
 * Gear rarely changes — refetch after 1 hour.
 */
export const cachedGetAthleteGear = async (): Promise<{
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
}> => {
  const GEAR_KEY = 'athlete-gear';
  const cached = await db.athleteGear.get(GEAR_KEY);

  if (cached && isFresh(cached.fetchedAt, STALE.athleteGear)) {
    return {bikes: cached.bikes, shoes: cached.shoes};
  }

  // Fetch full athlete profile (includes bikes & shoes arrays)
  const profile = await fetchAthleteWithGear();
  const bikes = profile.bikes ?? [];
  const shoes = profile.shoes ?? [];

  await db.athleteGear.put({
    key: GEAR_KEY,
    bikes,
    shoes,
    fetchedAt: Date.now(),
  });

  return {bikes, shoes};
};

// ----- Force refresh helpers -----

/**
 * Force-refresh all activities from the API, ignoring cache freshness.
 * Useful for a manual "sync" button.
 */
export const forceRefreshActivities = async (): Promise<ActivitySummary[]> => {
  const raw = await fetchAllActivities();
  const now = Date.now();

  await db.activities.bulkPut(
    raw.map((activity) => ({
      id: activity.id,
      data: activity,
      date: activity.start_date_local.split('T')[0],
      fetchedAt: now,
    })),
  );

  const all = await db.activities.orderBy('date').reverse().toArray();
  return all.map((record) => transformActivity(record.data));
};
