// ============================================================
// Strava Two-Tier Cache-Through Layer
// ============================================================
//
// Tier 1 — Neon (PostgreSQL)  : persistent, multi-device, server-side
// Tier 2 — Strava API         : source of truth, rate-limited
//
// Read flow:  Neon → Strava API
// Write flow: Neon (awaitable)
//
// React Query provides in-memory caching for the browser session.

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
  StravaDetailedActivity,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaSummaryGear,
} from './strava';
import type {ActivitySummary, StreamPoint, UserSettings} from './mockData';
import {computeZoneBreakdown, hashZoneSettings} from './zoneCompute';
import type {ZoneBreakdown} from './zoneCompute';
import {
  neonGetActivities,
  neonSyncActivities,
  neonGetActivityDetail,
  neonSyncActivityDetail,
  neonGetActivityStreams,
  neonSyncActivityStreams,
  neonGetAthleteStats,
  neonSyncAthleteStats,
  neonGetAthleteZones,
  neonSyncAthleteZones,
  neonGetAthleteGear,
  neonSyncAthleteGear,
  neonGetZoneBreakdown,
  neonSyncZoneBreakdown,
} from './neonSync';

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
 * Two-tier: Neon → Strava API.
 */
export const cachedGetAllActivities = async (): Promise<ActivitySummary[]> => {
  // ── Tier 1: Neon (persistent, multi-device) ──
  const neonData = await neonGetActivities();

  if (neonData && neonData.length > 0) {
    const newestNeon = neonData.reduce((a, b) =>
      a.fetchedAt > b.fetchedAt ? a : b,
    );

    if (isFresh(newestNeon.fetchedAt, STALE.activities)) {
      const sorted = [...neonData].sort((a, b) => (b.date > a.date ? 1 : a.date > b.date ? -1 : 0));
      return sorted.map((record) => transformActivity(record.data));
    }
  }

  // ── Tier 2: Strava API (source of truth) ──
  const raw = await fetchAllActivities();
  const now = Date.now();

  const records = raw.map((activity) => ({
    id: activity.id,
    data: activity,
    date: activity.start_date_local.split('T')[0],
    fetchedAt: now,
  }));

  // Write to Neon
  await neonSyncActivities(records);

  const sorted = [...records].sort((a, b) => (b.date > a.date ? 1 : a.date > b.date ? -1 : 0));
  return sorted.map((record) => transformActivity(record.data));
};

// ----- Activity Detail -----

/**
 * Returns a single detailed activity.
 * Two-tier: Neon → Strava API.
 * Historical activities never change, so once cached they stay forever.
 */
export const cachedGetActivityDetail = async (
  activityId: number,
): Promise<StravaDetailedActivity> => {
  // ── Tier 1: Neon ──
  const neonData = await neonGetActivityDetail(activityId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.activityDetail)) {
    return neonData.data;
  }

  // ── Tier 2: Strava API ──
  const detail = await fetchActivityDetail(activityId);
  const record = {id: activityId, data: detail, fetchedAt: Date.now()};

  await neonSyncActivityDetail(record);

  return detail;
};

// ----- Activity Streams -----

/**
 * Returns stream data for an activity, transformed to StreamPoint[].
 * Two-tier: Neon → Strava API.
 * Streams never change for historical activities.
 */
export const cachedGetActivityStreams = async (
  activityId: number,
): Promise<StreamPoint[]> => {
  // ── Tier 1: Neon ──
  const neonData = await neonGetActivityStreams(activityId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.activityStreams)) {
    return transformStreams(neonData.data);
  }

  // ── Tier 2: Strava API ──
  const raw = await fetchActivityStreams(activityId);
  const record = {activityId, data: raw, fetchedAt: Date.now()};

  await neonSyncActivityStreams(record);

  return transformStreams(raw);
};

// ----- Athlete Stats -----

/**
 * Returns athlete aggregate stats (recent, ytd, all-time totals).
 * Two-tier: Neon → Strava API. Refetch after 1 hour.
 */
export const cachedGetAthleteStats = async (
  athleteId: number,
): Promise<StravaAthleteStats> => {
  // ── Tier 1: Neon ──
  const neonData = await neonGetAthleteStats(athleteId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteStats)) {
    return neonData.data;
  }

  // ── Tier 2: Strava API ──
  const stats = await fetchAthleteStats(athleteId);
  const record = {athleteId, data: stats, fetchedAt: Date.now()};

  await neonSyncAthleteStats(record);

  return stats;
};

// ----- Athlete Zones -----

/**
 * Returns heart rate (and optionally power) zones.
 * Two-tier: Neon → Strava API. Refetch after 24 hours.
 */
export const cachedGetAthleteZones = async (): Promise<StravaAthleteZones> => {
  const ZONES_KEY = 'athlete-zones';

  // ── Tier 1: Neon ──
  const neonData = await neonGetAthleteZones(ZONES_KEY);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteZones)) {
    return neonData.data;
  }

  // ── Tier 2: Strava API ──
  const zones = await fetchAthleteZones();
  const record = {key: ZONES_KEY, data: zones, fetchedAt: Date.now()};

  await neonSyncAthleteZones(record);

  return zones;
};

// ----- Athlete Gear -----

/**
 * Returns athlete's bikes and shoes, fetched from GET /athlete.
 * Two-tier: Neon → Strava API. Refetch after 1 hour.
 */
export const cachedGetAthleteGear = async (): Promise<{
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
  retiredGearIds: string[];
}> => {
  const GEAR_KEY = 'athlete-gear';

  // ── Tier 1: Neon ──
  const neonData = await neonGetAthleteGear(GEAR_KEY);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteGear)) {
    // Ensure retiredGearIds is populated (backward compat with old records)
    if (!neonData.retiredGearIds) neonData.retiredGearIds = [];
    return {bikes: neonData.bikes, shoes: neonData.shoes, retiredGearIds: neonData.retiredGearIds};
  }

  // ── Tier 2: Strava API ──
  // Preserve user-defined retiredGearIds from existing cache
  const existingRetiredIds = neonData?.retiredGearIds ?? [];
  const profile = await fetchAthleteWithGear();
  const bikes = profile.bikes ?? [];
  const shoes = profile.shoes ?? [];
  const record = {key: GEAR_KEY, bikes, shoes, retiredGearIds: existingRetiredIds, fetchedAt: Date.now()};

  await neonSyncAthleteGear(record);

  return {bikes, shoes, retiredGearIds: existingRetiredIds};
};

// ----- Zone Breakdowns -----

/**
 * Returns a zone breakdown for a single activity.
 * Two-tier: Neon → compute from streams.
 * Checks settingsHash to invalidate on zone config changes.
 */
export const cachedGetZoneBreakdown = async (
  activityId: number,
  zones: UserSettings['zones'],
): Promise<ZoneBreakdown> => {
  const currentHash = hashZoneSettings(zones);

  // ── Tier 1: Neon ──
  const neonData = await neonGetZoneBreakdown(activityId);

  if (neonData && neonData.settingsHash === currentHash) {
    return {zones: neonData.zones, settingsHash: neonData.settingsHash};
  }

  // ── Tier 2: Compute from streams (streams use their own two-tier) ──
  const stream = await cachedGetActivityStreams(activityId);
  const breakdown = computeZoneBreakdown(stream, zones);
  const record = {
    activityId,
    settingsHash: breakdown.settingsHash,
    zones: breakdown.zones,
    computedAt: Date.now(),
  };

  await neonSyncZoneBreakdown(record);

  return breakdown;
};

/**
 * Processes multiple activity IDs with a concurrency limiter.
 * Returns a Map of activityId -> ZoneBreakdown.
 * Calls onProgress after each activity is processed.
 */
export const batchGetZoneBreakdowns = async (
  activityIds: number[],
  zones: UserSettings['zones'],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, ZoneBreakdown>> => {
  const results = new Map<number, ZoneBreakdown>();
  const total = activityIds.length;
  let done = 0;

  const MAX_CONCURRENCY = 5;

  // Process in batches of MAX_CONCURRENCY
  for (let i = 0; i < activityIds.length; i += MAX_CONCURRENCY) {
    const batch = activityIds.slice(i, i + MAX_CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const breakdown = await cachedGetZoneBreakdown(id, zones);
        return {id, breakdown};
      }),
    );

    for (const result of batchResults) {
      done++;
      if (result.status === 'fulfilled') {
        results.set(result.value.id, result.value.breakdown);
      }
      // Silently skip failed activities (e.g. no stream data available)
    }

    onProgress?.(done, total);
  }

  return results;
};

// ----- Force refresh helpers -----

/**
 * Force-refresh all activities from the API, ignoring cache freshness.
 * Writes to Neon. Useful for a manual "sync" button.
 */
export const forceRefreshActivities = async (): Promise<ActivitySummary[]> => {
  const raw = await fetchAllActivities();
  const now = Date.now();

  const records = raw.map((activity) => ({
    id: activity.id,
    data: activity,
    date: activity.start_date_local.split('T')[0],
    fetchedAt: now,
  }));

  await neonSyncActivities(records);

  const sorted = [...records].sort((a, b) => (b.date > a.date ? 1 : a.date > b.date ? -1 : 0));
  return sorted.map((record) => transformActivity(record.data));
};
