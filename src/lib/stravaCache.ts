// ============================================================
// Strava Three-Tier Cache-Through Layer
// ============================================================
//
// Tier 1 — Dexie (IndexedDB)  : instant, offline, per-browser
// Tier 2 — Neon  (PostgreSQL)  : persistent, multi-device, server-side
// Tier 3 — Strava API          : source of truth, rate-limited
//
// Read flow:  Dexie → Neon → Strava API
// Write flow: Dexie (sync) + Neon (fire-and-forget)

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

// ----- Neon backfill tracking -----
// When Dexie has data from before Neon was set up, we backfill Neon
// on the first Dexie hit per session so the remote DB gets populated.
// Uses sessionStorage so the backfill runs once per browser session.

const BACKFILL_KEY = 'neon-backfill';

const needsBackfill = (table: string): boolean => {
  try {
    const done = sessionStorage.getItem(`${BACKFILL_KEY}:${table}`);
    return done !== 'true';
  } catch {
    return false; // SSR or sessionStorage unavailable — skip
  }
};

const markBackfilled = (table: string): void => {
  try {
    sessionStorage.setItem(`${BACKFILL_KEY}:${table}`, 'true');
  } catch {
    // ignore
  }
};

// ----- Activities (list) -----

/**
 * Returns all activities, transformed to app format.
 * Three-tier: Dexie → Neon → Strava API.
 */
export const cachedGetAllActivities = async (): Promise<ActivitySummary[]> => {
  // ── Tier 1: Dexie (instant, offline) ──
  const cachedCount = await db.activities.count();

  if (cachedCount > 0) {
    const newest = await db.activities.orderBy('fetchedAt').last();

    if (newest && isFresh(newest.fetchedAt, STALE.activities)) {
      const all = await db.activities.orderBy('date').reverse().toArray();

      // Backfill Neon once per session (fire-and-forget)
      if (needsBackfill('activities')) {
        markBackfilled('activities');
        neonSyncActivities(all);
      }

      return all.map((record) => transformActivity(record.data));
    }
  }

  // ── Tier 2: Neon (persistent, multi-device) ──
  const neonData = await neonGetActivities();

  if (neonData) {
    const newestNeon = neonData.reduce((a, b) =>
      a.fetchedAt > b.fetchedAt ? a : b,
    );

    if (isFresh(newestNeon.fetchedAt, STALE.activities)) {
      // Hydrate Dexie from Neon
      await db.activities.bulkPut(neonData);
      const all = await db.activities.orderBy('date').reverse().toArray();
      return all.map((record) => transformActivity(record.data));
    }
  }

  // ── Tier 3: Strava API (source of truth) ──
  const raw = await fetchAllActivities();
  const now = Date.now();

  const records = raw.map((activity) => ({
    id: activity.id,
    data: activity,
    date: activity.start_date_local.split('T')[0],
    fetchedAt: now,
  }));

  // Write to both caches
  await db.activities.bulkPut(records);
  neonSyncActivities(records);

  const all = await db.activities.orderBy('date').reverse().toArray();
  return all.map((record) => transformActivity(record.data));
};

// ----- Activity Detail -----

/**
 * Returns a single detailed activity.
 * Three-tier: Dexie → Neon → Strava API.
 * Historical activities never change, so once cached they stay forever.
 */
export const cachedGetActivityDetail = async (
  activityId: number,
): Promise<StravaDetailedActivity> => {
  // ── Tier 1: Dexie ──
  const cached = await db.activityDetails.get(activityId);

  if (cached && isFresh(cached.fetchedAt, STALE.activityDetail)) {
    neonSyncActivityDetail(cached); // backfill Neon (fire-and-forget)
    return cached.data;
  }

  // ── Tier 2: Neon ──
  const neonData = await neonGetActivityDetail(activityId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.activityDetail)) {
    await db.activityDetails.put(neonData);
    return neonData.data;
  }

  // ── Tier 3: Strava API ──
  const detail = await fetchActivityDetail(activityId);
  const record = {id: activityId, data: detail, fetchedAt: Date.now()};

  await db.activityDetails.put(record);
  neonSyncActivityDetail(record);

  return detail;
};

// ----- Activity Streams -----

/**
 * Returns stream data for an activity, transformed to StreamPoint[].
 * Three-tier: Dexie → Neon → Strava API.
 * Streams never change for historical activities.
 */
export const cachedGetActivityStreams = async (
  activityId: number,
): Promise<StreamPoint[]> => {
  // ── Tier 1: Dexie ──
  const cached = await db.activityStreams.get(activityId);

  if (cached && isFresh(cached.fetchedAt, STALE.activityStreams)) {
    neonSyncActivityStreams(cached); // backfill Neon (fire-and-forget)
    return transformStreams(cached.data);
  }

  // ── Tier 2: Neon ──
  const neonData = await neonGetActivityStreams(activityId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.activityStreams)) {
    await db.activityStreams.put(neonData);
    return transformStreams(neonData.data);
  }

  // ── Tier 3: Strava API ──
  const raw = await fetchActivityStreams(activityId);
  const record = {activityId, data: raw, fetchedAt: Date.now()};

  await db.activityStreams.put(record);
  neonSyncActivityStreams(record);

  return transformStreams(raw);
};

// ----- Athlete Stats -----

/**
 * Returns athlete aggregate stats (recent, ytd, all-time totals).
 * Three-tier: Dexie → Neon → Strava API. Refetch after 1 hour.
 */
export const cachedGetAthleteStats = async (
  athleteId: number,
): Promise<StravaAthleteStats> => {
  // ── Tier 1: Dexie ──
  const cached = await db.athleteStats.get(athleteId);

  if (cached && isFresh(cached.fetchedAt, STALE.athleteStats)) {
    neonSyncAthleteStats(cached); // backfill Neon (fire-and-forget)
    return cached.data;
  }

  // ── Tier 2: Neon ──
  const neonData = await neonGetAthleteStats(athleteId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteStats)) {
    await db.athleteStats.put(neonData);
    return neonData.data;
  }

  // ── Tier 3: Strava API ──
  const stats = await fetchAthleteStats(athleteId);
  const record = {athleteId, data: stats, fetchedAt: Date.now()};

  await db.athleteStats.put(record);
  neonSyncAthleteStats(record);

  return stats;
};

// ----- Athlete Zones -----

/**
 * Returns heart rate (and optionally power) zones.
 * Three-tier: Dexie → Neon → Strava API. Refetch after 24 hours.
 */
export const cachedGetAthleteZones = async (): Promise<StravaAthleteZones> => {
  const ZONES_KEY = 'athlete-zones';

  // ── Tier 1: Dexie ──
  const cached = await db.athleteZones.get(ZONES_KEY);

  if (cached && isFresh(cached.fetchedAt, STALE.athleteZones)) {
    neonSyncAthleteZones(cached); // backfill Neon (fire-and-forget)
    return cached.data;
  }

  // ── Tier 2: Neon ──
  const neonData = await neonGetAthleteZones(ZONES_KEY);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteZones)) {
    await db.athleteZones.put(neonData);
    return neonData.data;
  }

  // ── Tier 3: Strava API ──
  const zones = await fetchAthleteZones();
  const record = {key: ZONES_KEY, data: zones, fetchedAt: Date.now()};

  await db.athleteZones.put(record);
  neonSyncAthleteZones(record);

  return zones;
};

// ----- Athlete Gear -----

/**
 * Returns athlete's bikes and shoes, fetched from GET /athlete.
 * Three-tier: Dexie → Neon → Strava API. Refetch after 1 hour.
 */
export const cachedGetAthleteGear = async (): Promise<{
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
}> => {
  const GEAR_KEY = 'athlete-gear';

  // ── Tier 1: Dexie ──
  const cached = await db.athleteGear.get(GEAR_KEY);

  if (cached && isFresh(cached.fetchedAt, STALE.athleteGear)) {
    neonSyncAthleteGear(cached); // backfill Neon (fire-and-forget)
    return {bikes: cached.bikes, shoes: cached.shoes};
  }

  // ── Tier 2: Neon ──
  const neonData = await neonGetAthleteGear(GEAR_KEY);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteGear)) {
    await db.athleteGear.put(neonData);
    return {bikes: neonData.bikes, shoes: neonData.shoes};
  }

  // ── Tier 3: Strava API ──
  const profile = await fetchAthleteWithGear();
  const bikes = profile.bikes ?? [];
  const shoes = profile.shoes ?? [];
  const record = {key: GEAR_KEY, bikes, shoes, fetchedAt: Date.now()};

  await db.athleteGear.put(record);
  neonSyncAthleteGear(record);

  return {bikes, shoes};
};

// ----- Zone Breakdowns -----

/**
 * Returns a zone breakdown for a single activity.
 * Three-tier: Dexie → Neon → compute from streams.
 * Checks settingsHash to invalidate on zone config changes.
 */
export const cachedGetZoneBreakdown = async (
  activityId: number,
  zones: UserSettings['zones'],
): Promise<ZoneBreakdown> => {
  const currentHash = hashZoneSettings(zones);

  // ── Tier 1: Dexie ──
  const cached = await db.zoneBreakdowns.get(activityId);

  if (cached && cached.settingsHash === currentHash) {
    neonSyncZoneBreakdown(cached); // backfill Neon (fire-and-forget)
    return {zones: cached.zones, settingsHash: cached.settingsHash};
  }

  // ── Tier 2: Neon ──
  const neonData = await neonGetZoneBreakdown(activityId);

  if (neonData && neonData.settingsHash === currentHash) {
    await db.zoneBreakdowns.put(neonData);
    return {zones: neonData.zones, settingsHash: neonData.settingsHash};
  }

  // ── Tier 3: Compute from streams (streams use their own three-tier) ──
  const stream = await cachedGetActivityStreams(activityId);
  const breakdown = computeZoneBreakdown(stream, zones);
  const record = {
    activityId,
    settingsHash: breakdown.settingsHash,
    zones: breakdown.zones,
    computedAt: Date.now(),
  };

  await db.zoneBreakdowns.put(record);
  neonSyncZoneBreakdown(record);

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
 * Writes to both Dexie and Neon. Useful for a manual "sync" button.
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

  await db.activities.bulkPut(records);
  neonSyncActivities(records);

  const all = await db.activities.orderBy('date').reverse().toArray();
  return all.map((record) => transformActivity(record.data));
};
