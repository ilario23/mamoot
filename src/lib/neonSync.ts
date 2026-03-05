// ============================================================
// Neon Sync — Client-side helpers for the remote database
// ============================================================
//
// Provides typed read/write functions that call /api/db/[table].
// - Reads are awaitable and return null on error (graceful degradation).
// - Writes are awaitable and throw on error so callers can handle failures.
//
// Neon is the primary persistent store. Strava is the source of truth.

import type {
  CachedActivity,
  CachedActivityDetail,
  CachedActivityLabel,
  CachedActivityStreams,
  CachedAthleteStats,
  CachedAthleteZones,
  CachedAthleteGear,
  CachedZoneBreakdown,
  CachedDashboardCache,
} from './cacheTypes';

const API = '/api/db';

// ---- Internal helpers ----

/** Awaitable POST to Neon. Resolves silently on success, logs on failure. */
const postToNeon = async (table: string, data: unknown): Promise<void> => {
  try {
    const res = await fetch(`${API}/${table}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.warn(`[neonSync] POST /${table} failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[neonSync] POST /${table} error:`, err);
  }
};

/** Awaitable GET from Neon. Returns parsed JSON or null on any error. */
const getFromNeon = async <T>(
  table: string,
  pk?: string | number,
): Promise<T | null> => {
  try {
    const url = pk != null ? `${API}/${table}?pk=${pk}` : `${API}/${table}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // For array endpoints, return null if empty
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

// ---- Activities (bulk) ----

export const neonGetActivities = async (
  athleteId: number,
): Promise<CachedActivity[] | null> =>
  getFromNeon<CachedActivity[]>(`activities?athleteId=${athleteId}`);

/**
 * Fetch activities from Neon with an optional date filter.
 * @param afterDate  YYYY-MM-DD string — only activities on or after this date
 */
export const neonGetRecentActivities = async (
  athleteId: number,
  afterDate: string,
): Promise<CachedActivity[] | null> => {
  try {
    const res = await fetch(
      `${API}/activities?athleteId=${athleteId}&after=${afterDate}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

/**
 * Fetch a page of activities from Neon, sorted newest-first.
 * Bypasses staleness checks — returns whatever is cached.
 */
export const neonGetActivitiesPaginated = async (
  athleteId: number,
  limit: number,
  offset = 0,
): Promise<CachedActivity[] | null> => {
  try {
    const res = await fetch(
      `${API}/activities?athleteId=${athleteId}&limit=${limit}&offset=${offset}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

export const neonSyncActivities = async (
  records: CachedActivity[],
): Promise<void> => {
  await postToNeon('activities', records);
};

// ---- Activity Details (single) ----

export const neonGetActivityDetail = async (
  athleteId: number,
  id: number,
): Promise<CachedActivityDetail | null> =>
  getFromNeon<CachedActivityDetail>(
    `activity-details?athleteId=${athleteId}&pk=${id}`,
  );

export const neonSyncActivityDetail = async (
  record: CachedActivityDetail,
): Promise<void> => {
  await postToNeon('activity-details', record);
};

// ---- Activity Details (bulk) ----

/** Max IDs per chunk to stay within URL length limits */
const BULK_CHUNK_SIZE = 200;

/**
 * Fetch multiple activity details from Neon in one (or few) round-trips.
 * Returns whatever Neon has — callers handle missing IDs.
 */
export const neonGetActivityDetailsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedActivityDetail[]> => {
  if (ids.length === 0) return [];

  const results: CachedActivityDetail[] = [];

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const pks = chunk.join(',');
    try {
      const res = await fetch(
        `${API}/activity-details?athleteId=${athleteId}&pks=${pks}`,
      );
      if (!res.ok) continue;
      const data: CachedActivityDetail[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch {
      // Skip this chunk on failure
    }
  }

  return results;
};

/**
 * Awaitable bulk write of activity details to Neon.
 * The POST endpoint already accepts arrays.
 */
export const neonSyncActivityDetailsBulk = async (
  records: CachedActivityDetail[],
): Promise<void> => {
  if (records.length === 0) return;
  await postToNeon('activity-details', records);
};

// ---- Activity Labels (bulk) ----

/** Fetch multiple activity labels from Neon in one (or few) round-trips. */
export const neonGetActivityLabelsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedActivityLabel[]> => {
  if (ids.length === 0) return [];

  const results: CachedActivityLabel[] = [];

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const pks = chunk.join(',');
    try {
      const res = await fetch(
        `${API}/activity-labels?athleteId=${athleteId}&pks=${pks}`,
      );
      if (!res.ok) continue;
      const data: CachedActivityLabel[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch {
      // Skip this chunk on failure
    }
  }

  return results;
};

/** Awaitable bulk write of activity labels to Neon. */
export const neonSyncActivityLabelsBulk = async (
  records: CachedActivityLabel[],
): Promise<void> => {
  if (records.length === 0) return;
  await postToNeon('activity-labels', records);
};

/** Awaitable write of a single activity label to Neon. */
export const neonSyncActivityLabel = async (
  record: CachedActivityLabel,
): Promise<void> => {
  await postToNeon('activity-labels', record);
};

// ---- Activity Streams (single) ----

export const neonGetActivityStreams = async (
  athleteId: number,
  activityId: number,
): Promise<CachedActivityStreams | null> =>
  getFromNeon<CachedActivityStreams>(
    `activity-streams?athleteId=${athleteId}&pk=${activityId}`,
  );

export const neonSyncActivityStreams = async (
  record: CachedActivityStreams,
): Promise<void> => {
  await postToNeon('activity-streams', record);
};

// ---- Activity Streams (bulk) ----

/**
 * Fetch multiple activity streams from Neon in one (or few) round-trips.
 * Returns whatever Neon has — callers handle missing IDs.
 */
export const neonGetActivityStreamsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedActivityStreams[]> => {
  if (ids.length === 0) return [];

  const results: CachedActivityStreams[] = [];

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const pks = chunk.join(',');
    try {
      const res = await fetch(
        `${API}/activity-streams?athleteId=${athleteId}&pks=${pks}`,
      );
      if (!res.ok) continue;
      const data: CachedActivityStreams[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch {
      // Skip this chunk on failure
    }
  }

  return results;
};

// ---- Athlete Stats (single) ----

export const neonGetAthleteStats = async (
  athleteId: number,
): Promise<CachedAthleteStats | null> =>
  getFromNeon<CachedAthleteStats>('athlete-stats', athleteId);

export const neonSyncAthleteStats = async (
  record: CachedAthleteStats,
): Promise<void> => {
  await postToNeon('athlete-stats', record);
};

// ---- Athlete Zones (single by key) ----

export const neonGetAthleteZones = async (
  athleteId: number,
): Promise<CachedAthleteZones | null> =>
  getFromNeon<CachedAthleteZones>(`athlete-zones?athleteId=${athleteId}`);

export const neonSyncAthleteZones = async (
  record: CachedAthleteZones,
): Promise<void> => {
  await postToNeon('athlete-zones', record);
};

// ---- Athlete Gear (single by key) ----

export const neonGetAthleteGear = async (
  athleteId: number,
): Promise<CachedAthleteGear | null> =>
  getFromNeon<CachedAthleteGear>(`athlete-gear?athleteId=${athleteId}`);

export const neonSyncAthleteGear = async (
  record: CachedAthleteGear,
): Promise<void> => {
  await postToNeon('athlete-gear', record);
};

// ---- Zone Breakdowns (single) ----

export const neonGetZoneBreakdown = async (
  athleteId: number,
  activityId: number,
): Promise<CachedZoneBreakdown | null> =>
  getFromNeon<CachedZoneBreakdown>(
    `zone-breakdowns?athleteId=${athleteId}&pk=${activityId}`,
  );

export const neonSyncZoneBreakdown = async (
  record: CachedZoneBreakdown,
): Promise<void> => {
  await postToNeon('zone-breakdowns', record);
};

// ---- Zone Breakdowns (bulk) ----

/** Fetch all zone breakdowns from Neon for one athlete. */
export const neonGetAllZoneBreakdowns = async (
  athleteId: number,
): Promise<CachedZoneBreakdown[]> => {
  try {
    const res = await fetch(`${API}/zone-breakdowns?athleteId=${athleteId}`);
    if (!res.ok) return [];
    const data: CachedZoneBreakdown[] = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

/**
 * Fetch multiple zone breakdowns from Neon in one (or few) round-trips.
 * Returns whatever Neon has — callers handle missing IDs.
 */
export const neonGetZoneBreakdownsBulk = async (
  athleteId: number,
  ids: number[],
): Promise<CachedZoneBreakdown[]> => {
  if (ids.length === 0) return [];

  const results: CachedZoneBreakdown[] = [];

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const pks = chunk.join(',');
    try {
      const res = await fetch(
        `${API}/zone-breakdowns?athleteId=${athleteId}&pks=${pks}`,
      );
      if (!res.ok) continue;
      const data: CachedZoneBreakdown[] = await res.json();
      if (Array.isArray(data)) results.push(...data);
    } catch {
      // Skip this chunk on failure
    }
  }

  return results;
};

// ---- Dashboard Cache (single by key) ----

export const neonGetDashboardCache = async (
  key: string,
): Promise<CachedDashboardCache | null> =>
  getFromNeon<CachedDashboardCache>('dashboard-cache', key);

export const neonSyncDashboardCache = async (
  record: CachedDashboardCache,
): Promise<void> => {
  await postToNeon('dashboard-cache', record);
};

// ---- Activity Labels (single) ----

/** Fetch a single activity label from Neon. */
export const neonGetActivityLabel = async (
  athleteId: number,
  id: number,
): Promise<CachedActivityLabel | null> =>
  getFromNeon<CachedActivityLabel>(
    `activity-labels?athleteId=${athleteId}&pk=${id}`,
  );

// ---- User Settings — partial update (weight + city from Strava profile) ----

/**
 * Update only the weight and city fields on an existing user_settings row.
 * Uses PATCH for partial update. If no row exists yet, this is a no-op
 * (the full settings sync from SettingsLoader will create the row first).
 */
export const neonSyncAthleteProfile = async (
  athleteId: number,
  weight: number | null,
  city: string | null,
): Promise<void> => {
  try {
    const res = await fetch(`${API}/user-settings`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        athleteId,
        weight: weight ?? null,
        city: city ?? null,
      }),
    });
    if (!res.ok) {
      console.warn(`[neonSync] PATCH /user-settings (profile) failed: ${res.status}`);
    }
  } catch (err) {
    console.warn('[neonSync] PATCH /user-settings (profile) error:', err);
  }
};
