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
  fetchActivitiesSinceEpoch,
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
import type {ActivitySummary, StreamPoint, UserSettings} from './activityModel';
import {computeZoneBreakdown, hashZoneSettings} from './zoneCompute';
import type {ZoneBreakdown} from './zoneCompute';
import {
  calcFitnessData,
  appendFitnessData,
  hashTrainingSettings,
} from '@/utils/trainingLoad';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import {
  neonGetActivities,
  neonGetRecentActivities,
  neonGetActivitiesPaginated,
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
  neonGetZoneBreakdownsBulk,
  neonGetActivityStreamsBulk,
  neonGetDashboardCache,
  neonSyncDashboardCache,
  neonSyncAthleteProfile,
} from './neonSync';
import type {CachedActivity} from './cacheTypes';

// ----- Perf (dev + light sampling) -----

const CACHE_PERF_SAMPLE = 0.02;

const logCachePerf = (label: string, ms: number) => {
  if (
    process.env.NODE_ENV === 'development' ||
    Math.random() < CACHE_PERF_SAMPLE
  ) {
    console.info(`[cachePerf] ${label}: ${ms.toFixed(0)}ms`);
  }
};

const withCachePerf = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    return await fn();
  } finally {
    const t1 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    logCachePerf(label, t1 - t0);
  }
};

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

const sortNeonToSummaries = (neonData: CachedActivity[]): ActivitySummary[] => {
  const sorted = [...neonData].sort((a, b) =>
    b.date > a.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return sorted.map((record) => transformActivity(record.data));
};

const backgroundActivitiesSyncInFlight = new Set<number>();
const backgroundActivitiesCallbacks = new Map<number, Set<() => void>>();

export type CachedActivitiesOptions = {
  /** Dashboard: return Neon immediately when stale; sync in background */
  staleWhileRevalidate?: boolean;
  onBackgroundSyncComplete?: () => void;
};

export const scheduleBackgroundActivitiesSync = (
  athleteId: number,
  onComplete?: () => void,
): void => {
  if (onComplete) {
    let set = backgroundActivitiesCallbacks.get(athleteId);
    if (!set) {
      set = new Set();
      backgroundActivitiesCallbacks.set(athleteId, set);
    }
    set.add(onComplete);
  }
  if (backgroundActivitiesSyncInFlight.has(athleteId)) return;
  backgroundActivitiesSyncInFlight.add(athleteId);
  void (async () => {
    try {
      await withCachePerf('activities.backgroundSync', () =>
        syncActivitiesFromStravaForAthlete(athleteId, 'incremental'),
      );
      const cbs = backgroundActivitiesCallbacks.get(athleteId);
      backgroundActivitiesCallbacks.delete(athleteId);
      cbs?.forEach((cb) => {
        try {
          cb();
        } catch {
          /* noop */
        }
      });
    } finally {
      backgroundActivitiesSyncInFlight.delete(athleteId);
    }
  })();
};

async function touchLatestActivityFetchedAt(athleteId: number): Promise<void> {
  const latest = await neonGetActivitiesPaginated(athleteId, 1, 0);
  if (!latest?.[0]) return;
  await neonSyncActivities([
    {
      ...latest[0],
      fetchedAt: Date.now(),
    },
  ]);
}

async function syncActivitiesFromStravaForAthlete(
  athleteId: number,
  mode: 'incremental' | 'full',
): Promise<void> {
  const now = Date.now();
  if (mode === 'full') {
    const raw = await fetchAllActivities();
    const records = raw.map((activity) => ({
      id: activity.id,
      athleteId,
      data: activity,
      date: activity.start_date_local.split('T')[0],
      fetchedAt: now,
    }));
    await neonSyncActivities(records);
    return;
  }

  const latest = await neonGetActivitiesPaginated(athleteId, 1, 0);
  if (!latest || latest.length === 0) {
    await syncActivitiesFromStravaForAthlete(athleteId, 'full');
    return;
  }

  const startStr = latest[0].data.start_date as string;
  const afterEpoch = Math.max(
    0,
    Math.floor(new Date(startStr).getTime() / 1000) - 1,
  );

  const raw = await fetchActivitiesSinceEpoch(afterEpoch);
  if (raw.length === 0) {
    await touchLatestActivityFetchedAt(athleteId);
    return;
  }

  const records = raw.map((activity) => ({
    id: activity.id,
    athleteId,
    data: activity,
    date: activity.start_date_local.split('T')[0],
    fetchedAt: now,
  }));
  await neonSyncActivities(records);
}

// ----- Activities (list) -----

/**
 * Returns all activities, transformed to app format.
 * Two-tier: Neon → Strava API.
 *
 * @param afterDate  Optional YYYY-MM-DD cutoff — when provided, the Neon
 *                   read only returns activities on or after this date,
 *                   reducing payload size for dashboard views.
 *                   Incremental Strava sync loads new activities when Neon exists.
 */
export const cachedGetAllActivities = async (
  athleteId: number,
  afterDate?: string,
  options?: CachedActivitiesOptions,
): Promise<ActivitySummary[]> => {
  const neonData = await withCachePerf('activities.neonRead', async () =>
    afterDate
      ? await neonGetRecentActivities(athleteId, afterDate)
      : await neonGetActivities(athleteId),
  );

  const swr = Boolean(options?.staleWhileRevalidate && afterDate);

  if (neonData && neonData.length > 0) {
    const newestNeon = neonData.reduce((a, b) =>
      a.fetchedAt > b.fetchedAt ? a : b,
    );

    if (isFresh(newestNeon.fetchedAt, STALE.activities)) {
      return sortNeonToSummaries(neonData);
    }

    if (swr) {
      scheduleBackgroundActivitiesSync(
        athleteId,
        options?.onBackgroundSyncComplete,
      );
      return sortNeonToSummaries(neonData);
    }
  }

  const mode: 'incremental' | 'full' =
    neonData && neonData.length > 0 ? 'incremental' : 'full';

  await withCachePerf(
    mode === 'incremental' ? 'activities.syncIncremental' : 'activities.syncFull',
    () => syncActivitiesFromStravaForAthlete(athleteId, mode),
  );

  const neonAfter = afterDate
    ? await neonGetRecentActivities(athleteId, afterDate)
    : await neonGetActivities(athleteId);

  if (!neonAfter || neonAfter.length === 0) {
    return [];
  }

  return sortNeonToSummaries(neonAfter);
};

/**
 * Fast path: fetch a page of activities from Neon (newest-first).
 * Skips staleness checks — returns whatever is cached to speed up
 * initial render while the full dataset loads via cachedGetAllActivities.
 */
export const cachedGetActivitiesPage = async (
  athleteId: number,
  limit: number,
  offset = 0,
): Promise<ActivitySummary[]> => {
  const neonData = await neonGetActivitiesPaginated(athleteId, limit, offset);
  if (!neonData || neonData.length === 0) return [];
  return neonData.map((record) => transformActivity(record.data));
};

// ----- Activity Detail -----

/**
 * Returns a single detailed activity.
 * Two-tier: Neon → Strava API.
 * Historical activities never change, so once cached they stay forever.
 */
export const cachedGetActivityDetail = async (
  athleteId: number,
  activityId: number,
): Promise<StravaDetailedActivity> => {
  // ── Tier 1: Neon ──
  const neonData = await neonGetActivityDetail(athleteId, activityId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.activityDetail)) {
    return neonData.data;
  }

  // ── Tier 2: Strava API ──
  const detail = await fetchActivityDetail(activityId);
  const record = {id: activityId, athleteId, data: detail, fetchedAt: Date.now()};

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
  athleteId: number,
  activityId: number,
): Promise<StreamPoint[]> => {
  // ── Tier 1: Neon ──
  const neonData = await neonGetActivityStreams(athleteId, activityId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.activityStreams)) {
    return transformStreams(neonData.data);
  }

  // ── Tier 2: Strava API ──
  const raw = await fetchActivityStreams(activityId);
  const record = {activityId, athleteId, data: raw, fetchedAt: Date.now()};

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
export const cachedGetAthleteZones = async (
  athleteId: number,
): Promise<StravaAthleteZones> => {
  const ZONES_KEY = `athlete-zones:${athleteId}`;

  // ── Tier 1: Neon ──
  const neonData = await neonGetAthleteZones(athleteId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteZones)) {
    return neonData.data;
  }

  // ── Tier 2: Strava API ──
  const zones = await fetchAthleteZones();
  const record = {key: ZONES_KEY, athleteId, data: zones, fetchedAt: Date.now()};

  await neonSyncAthleteZones(record);

  return zones;
};

// ----- Athlete Gear -----

/**
 * Returns athlete's bikes and shoes, fetched from GET /athlete.
 * Two-tier: Neon → Strava API. Refetch after 1 hour.
 */
export const cachedGetAthleteGear = async (athleteId: number): Promise<{
  bikes: StravaSummaryGear[];
  shoes: StravaSummaryGear[];
  retiredGearIds: string[];
}> => {
  const GEAR_KEY = `athlete-gear:${athleteId}`;

  // ── Tier 1: Neon ──
  const neonData = await neonGetAthleteGear(athleteId);

  if (neonData && isFresh(neonData.fetchedAt, STALE.athleteGear)) {
    // Ensure retiredGearIds is populated (backward compat with old records)
    if (!neonData.retiredGearIds) neonData.retiredGearIds = [];
    return {
      bikes: neonData.bikes,
      shoes: neonData.shoes,
      retiredGearIds: neonData.retiredGearIds,
    };
  }

  // ── Tier 2: Strava API ──
  // Preserve user-defined retiredGearIds from existing cache
  const existingRetiredIds = neonData?.retiredGearIds ?? [];
  const profile = await fetchAthleteWithGear();
  const bikes = profile.bikes ?? [];
  const shoes = profile.shoes ?? [];
  const record = {
    key: GEAR_KEY,
    athleteId,
    bikes,
    shoes,
    retiredGearIds: existingRetiredIds,
    fetchedAt: Date.now(),
  };

  await neonSyncAthleteGear(record);

  // Sync weight and city from Strava profile to user_settings (fire-and-forget)
  neonSyncAthleteProfile(
    profile.id,
    profile.weight ?? null,
    profile.city ?? null,
  ).catch(() => {});

  return {bikes, shoes, retiredGearIds: existingRetiredIds};
};

// ----- Zone Breakdowns -----

/**
 * Returns a zone breakdown for a single activity.
 * Two-tier: Neon → compute from streams.
 * Checks settingsHash to invalidate on zone config changes.
 */
export const cachedGetZoneBreakdown = async (
  athleteId: number,
  activityId: number,
  zones: UserSettings['zones'],
): Promise<ZoneBreakdown> => {
  const currentHash = hashZoneSettings(zones);

  // ── Tier 1: Neon ──
  const neonData = await neonGetZoneBreakdown(athleteId, activityId);

  if (neonData && neonData.settingsHash === currentHash) {
    return {zones: neonData.zones, settingsHash: neonData.settingsHash};
  }

  // ── Tier 2: Compute from streams (streams use their own two-tier) ──
  const stream = await cachedGetActivityStreams(athleteId, activityId);
  const breakdown = computeZoneBreakdown(stream, zones);
  const record = {
    activityId,
    athleteId,
    settingsHash: breakdown.settingsHash,
    zones: breakdown.zones,
    computedAt: Date.now(),
  };

  await neonSyncZoneBreakdown(record);

  return breakdown;
};

// ----- In-flight deduplication for batch zone breakdowns -----
// When multiple components request the same batch concurrently (e.g.
// VolumeChart and PaceZoneDistribution both requesting 4-week zone data),
// reuse the same underlying promise instead of doing the work twice.

const inflight = new Map<string, Promise<Map<number, ZoneBreakdown>>>();

/**
 * Processes multiple activity IDs with bulk Neon fetching + concurrency limiter
 * for cache misses. Returns a Map of activityId -> ZoneBreakdown.
 *
 * Includes automatic request deduplication: concurrent calls with the same
 * activity IDs + zone settings share a single in-flight request.
 *
 * Optimized flow:
 *   1. Bulk-fetch ALL zone breakdowns from Neon in one request
 *   2. Return cached entries whose settingsHash matches
 *   3. Only compute (fetch streams + calculate) for missing/stale entries
 */
export const batchGetZoneBreakdowns = async (
  athleteId: number,
  activityIds: number[],
  zones: UserSettings['zones'],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, ZoneBreakdown>> => {
  const currentHash = hashZoneSettings(zones);
  const dedupeKey = `${currentHash}:${[...activityIds].sort().join(',')}`;

  // If there's already an in-flight request for the same data, reuse it
  const existing = inflight.get(dedupeKey);
  if (existing) {
    const result = await existing;
    // Still call onProgress to keep the UI in sync
    onProgress?.(result.size, activityIds.length);
    return result;
  }

  const promise = batchGetZoneBreakdownsInternal(
    athleteId,
    activityIds,
    zones,
    onProgress,
  );
  inflight.set(dedupeKey, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(dedupeKey);
  }
};

const batchGetZoneBreakdownsInternal = async (
  athleteId: number,
  activityIds: number[],
  zones: UserSettings['zones'],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<number, ZoneBreakdown>> =>
  withCachePerf('zones.batchBreakdowns', async () => {
  const results = new Map<number, ZoneBreakdown>();
  const total = activityIds.length;
  const currentHash = hashZoneSettings(zones);

  // ── Step 1: Bulk-fetch all zone breakdowns from Neon in one request ──
  const cachedBreakdowns = await neonGetZoneBreakdownsBulk(athleteId, activityIds);
  const cachedMap = new Map(
    cachedBreakdowns.map((b) => [b.activityId, b]),
  );

  // ── Step 2: Separate cache hits from misses ──
  const missingIds: number[] = [];

  for (const id of activityIds) {
    const cached = cachedMap.get(id);
    if (cached && cached.settingsHash === currentHash) {
      results.set(id, {zones: cached.zones, settingsHash: cached.settingsHash});
    } else {
      missingIds.push(id);
    }
  }

  // Report initial progress (cached entries are "done")
  let done = results.size;
  onProgress?.(done, total);

  if (missingIds.length === 0) return results;

  // ── Step 3: Bulk-fetch cached streams from Neon for all missing IDs ──
  const cachedStreams = await neonGetActivityStreamsBulk(athleteId, missingIds);
  const streamMap = new Map(
    cachedStreams.map((s) => [s.activityId, s]),
  );

  // ── Step 4: Compute missing zone breakdowns with concurrency limiter ──
  // Activities with cached streams skip the Strava API call entirely.
  const MAX_CONCURRENCY = 5;

  for (let i = 0; i < missingIds.length; i += MAX_CONCURRENCY) {
    const batch = missingIds.slice(i, i + MAX_CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        // Use pre-fetched stream from Neon if available, otherwise fall back
        // to the full two-tier cachedGetActivityStreams (which hits Strava)
        const cachedStream = streamMap.get(id);
        let stream: StreamPoint[];
        if (cachedStream) {
          stream = transformStreams(cachedStream.data);
        } else {
          stream = await cachedGetActivityStreams(athleteId, id);
        }

        const breakdown = computeZoneBreakdown(stream, zones);
        const record = {
          activityId: id,
          athleteId,
          settingsHash: breakdown.settingsHash,
          zones: breakdown.zones,
          computedAt: Date.now(),
        };
        // Fire-and-forget write to Neon (don't block progress)
        neonSyncZoneBreakdown(record);

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
  });

// ----- Dashboard Fitness Cache (3-way: hit / append / recompute) -----

/** Maximum computation window — UI components slice as needed */
const FITNESS_DAYS_BACK = 365;

/**
 * Returns cached fitness data (BF/LI/IT) for the dashboard.
 *
 * Three-way strategy:
 *   1. CACHE HIT:    settingsHash matches + no new activities → instant return
 *   2. APPEND:       settingsHash matches + new activities    → resume EWMA, append
 *   3. RECOMPUTE:    settingsHash mismatch or no cache        → full recalculation
 *
 * Always computes the full 365-day window. UI slices by daysBack client-side.
 */
export const cachedCalcFitnessData = async (
  athleteId: number,
  activities: ActivitySummary[],
  settings: UserSettings,
): Promise<FitnessDataPoint[]> =>
  withCachePerf('fitness.cachedCalcFitnessData', async () => {
  const currentHash = hashTrainingSettings(
    settings.zones,
    settings.maxHr,
    settings.restingHr,
  );
  const latestId = activities[0]?.id ? Number(activities[0].id) : 0;
  const actCount = activities.length;
  const cacheKey = `fitness:${athleteId}`;

  // ── Load existing cache from Neon ──
  const cached = await neonGetDashboardCache(cacheKey);

  if (cached) {
    // PATH 1: Cache hit — nothing changed
    if (
      cached.settingsHash === currentHash &&
      cached.lastActivityId === latestId &&
      cached.lastActivityCount === actCount
    ) {
      // Still extend rest days to today if needed
      const todayStr = new Date().toISOString().slice(0, 10);
      if (cached.lastDate === todayStr) {
        return cached.data;
      }

      // Need to fill rest days from lastDate+1 to today (no new activities)
      const prevState = {
        ...cached.continuationState,
        lastDate: cached.lastDate,
      };
      const result = appendFitnessData(
        [], // no new activities
        prevState,
        cached.data,
        settings.restingHr,
        settings.maxHr,
        FITNESS_DAYS_BACK,
        settings.zones,
      );

      // Persist updated cache (store only bf/li in continuationState; lastDate is a separate column)
      const {bf, li} = result.continuation;
      await neonSyncDashboardCache({
        key: cacheKey,
        athleteId,
        settingsHash: currentHash,
        lastActivityId: latestId,
        lastActivityCount: actCount,
        lastDate: result.continuation.lastDate,
        continuationState: {bf, li},
        data: result.data,
        computedAt: Date.now(),
      });

      return result.data;
    }

    // PATH 2: Incremental append — same settings, new activities
    if (cached.settingsHash === currentHash) {
      const newActivities = activities.filter((a) => a.date > cached.lastDate);
      const prevState = {
        ...cached.continuationState,
        lastDate: cached.lastDate,
      };

      const result = appendFitnessData(
        newActivities,
        prevState,
        cached.data,
        settings.restingHr,
        settings.maxHr,
        FITNESS_DAYS_BACK,
        settings.zones,
      );

      // Persist updated cache
      const {bf, li} = result.continuation;
      await neonSyncDashboardCache({
        key: cacheKey,
        athleteId,
        settingsHash: currentHash,
        lastActivityId: latestId,
        lastActivityCount: actCount,
        lastDate: result.continuation.lastDate,
        continuationState: {bf, li},
        data: result.data,
        computedAt: Date.now(),
      });

      return result.data;
    }
  }

  // PATH 3: Full recompute — no cache or settings changed
  const result = calcFitnessData(
    activities,
    settings.restingHr,
    settings.maxHr,
    FITNESS_DAYS_BACK,
    settings.zones,
  );

  // Persist full result
  const {bf, li} = result.continuation;
  await neonSyncDashboardCache({
    key: cacheKey,
    athleteId,
    settingsHash: currentHash,
    lastActivityId: latestId,
    lastActivityCount: actCount,
    lastDate: result.continuation.lastDate,
    continuationState: {bf, li},
    data: result.data,
    computedAt: Date.now(),
  });

  return result.data;
  });

// ----- Force refresh helpers -----

/**
 * Force-refresh all activities from the API, ignoring cache freshness.
 * Writes to Neon. Useful for a manual "sync" button.
 */
export const forceRefreshActivities = async (
  athleteId: number,
): Promise<ActivitySummary[]> => {
  const raw = await fetchAllActivities();
  const now = Date.now();

  const records = raw.map((activity) => ({
    id: activity.id,
    athleteId,
    data: activity,
    date: activity.start_date_local.split('T')[0],
    fetchedAt: now,
  }));

  await neonSyncActivities(records);

  const sorted = [...records].sort((a, b) =>
    b.date > a.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return sorted.map((record) => transformActivity(record.data));
};
