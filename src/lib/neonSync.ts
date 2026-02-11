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

export const neonGetActivities = async (): Promise<CachedActivity[] | null> =>
  getFromNeon<CachedActivity[]>('activities');

export const neonSyncActivities = async (records: CachedActivity[]): Promise<void> => {
  await postToNeon('activities', records);
};

// ---- Activity Details (single) ----

export const neonGetActivityDetail = async (
  id: number,
): Promise<CachedActivityDetail | null> =>
  getFromNeon<CachedActivityDetail>('activity-details', id);

export const neonSyncActivityDetail = async (record: CachedActivityDetail): Promise<void> => {
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
  ids: number[],
): Promise<CachedActivityDetail[]> => {
  if (ids.length === 0) return [];

  const results: CachedActivityDetail[] = [];

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const pks = chunk.join(',');
    try {
      const res = await fetch(`${API}/activity-details?pks=${pks}`);
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
  ids: number[],
): Promise<CachedActivityLabel[]> => {
  if (ids.length === 0) return [];

  const results: CachedActivityLabel[] = [];

  for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
    const pks = chunk.join(',');
    try {
      const res = await fetch(`${API}/activity-labels?pks=${pks}`);
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
export const neonSyncActivityLabel = async (record: CachedActivityLabel): Promise<void> => {
  await postToNeon('activity-labels', record);
};

// ---- Activity Streams (single) ----

export const neonGetActivityStreams = async (
  activityId: number,
): Promise<CachedActivityStreams | null> =>
  getFromNeon<CachedActivityStreams>('activity-streams', activityId);

export const neonSyncActivityStreams = async (
  record: CachedActivityStreams,
): Promise<void> => {
  await postToNeon('activity-streams', record);
};

// ---- Athlete Stats (single) ----

export const neonGetAthleteStats = async (
  athleteId: number,
): Promise<CachedAthleteStats | null> =>
  getFromNeon<CachedAthleteStats>('athlete-stats', athleteId);

export const neonSyncAthleteStats = async (record: CachedAthleteStats): Promise<void> => {
  await postToNeon('athlete-stats', record);
};

// ---- Athlete Zones (single by key) ----

export const neonGetAthleteZones = async (
  key: string,
): Promise<CachedAthleteZones | null> =>
  getFromNeon<CachedAthleteZones>('athlete-zones', key);

export const neonSyncAthleteZones = async (record: CachedAthleteZones): Promise<void> => {
  await postToNeon('athlete-zones', record);
};

// ---- Athlete Gear (single by key) ----

export const neonGetAthleteGear = async (
  key: string,
): Promise<CachedAthleteGear | null> =>
  getFromNeon<CachedAthleteGear>('athlete-gear', key);

export const neonSyncAthleteGear = async (record: CachedAthleteGear): Promise<void> => {
  await postToNeon('athlete-gear', record);
};

// ---- Zone Breakdowns (single) ----

export const neonGetZoneBreakdown = async (
  activityId: number,
): Promise<CachedZoneBreakdown | null> =>
  getFromNeon<CachedZoneBreakdown>('zone-breakdowns', activityId);

export const neonSyncZoneBreakdown = async (record: CachedZoneBreakdown): Promise<void> => {
  await postToNeon('zone-breakdowns', record);
};

// ---- Zone Breakdowns (bulk) ----

/** Fetch all zone breakdowns from Neon. */
export const neonGetAllZoneBreakdowns = async (): Promise<CachedZoneBreakdown[]> => {
  try {
    const res = await fetch(`${API}/zone-breakdowns`);
    if (!res.ok) return [];
    const data: CachedZoneBreakdown[] = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

// ---- Activity Labels (single) ----

/** Fetch a single activity label from Neon. */
export const neonGetActivityLabel = async (
  id: number,
): Promise<CachedActivityLabel | null> =>
  getFromNeon<CachedActivityLabel>('activity-labels', id);
