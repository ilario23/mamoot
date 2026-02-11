// ============================================================
// Neon Sync — Client-side helpers for the remote database
// ============================================================
//
// Provides typed read/write functions that call /api/db/[table].
// - Reads are awaitable and return null on error (Neon is optional).
// - Writes are fire-and-forget so they never block the UI.
//
// This module is only imported by stravaCache.ts (client-side).

import type {
  CachedActivity,
  CachedActivityDetail,
  CachedActivityStreams,
  CachedAthleteStats,
  CachedAthleteZones,
  CachedAthleteGear,
  CachedZoneBreakdown,
} from './db';

const API = '/api/db';

// ---- Internal helpers ----

/** Fire-and-forget POST to Neon. Never throws, never blocks. */
const postToNeon = (table: string, data: unknown): void => {
  fetch(`${API}/${table}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  }).catch(() => {
    // Silently ignore — Neon sync is best-effort
  });
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

export const neonSyncActivities = (records: CachedActivity[]): void => {
  postToNeon('activities', records);
};

// ---- Activity Details (single) ----

export const neonGetActivityDetail = async (
  id: number,
): Promise<CachedActivityDetail | null> =>
  getFromNeon<CachedActivityDetail>('activity-details', id);

export const neonSyncActivityDetail = (record: CachedActivityDetail): void => {
  postToNeon('activity-details', record);
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
      // Neon is best-effort — skip this chunk on failure
    }
  }

  return results;
};

/**
 * Fire-and-forget bulk write of activity details to Neon.
 * The POST endpoint already accepts arrays.
 */
export const neonSyncActivityDetailsBulk = (
  records: CachedActivityDetail[],
): void => {
  if (records.length === 0) return;
  postToNeon('activity-details', records);
};

// ---- Activity Streams (single) ----

export const neonGetActivityStreams = async (
  activityId: number,
): Promise<CachedActivityStreams | null> =>
  getFromNeon<CachedActivityStreams>('activity-streams', activityId);

export const neonSyncActivityStreams = (
  record: CachedActivityStreams,
): void => {
  postToNeon('activity-streams', record);
};

// ---- Athlete Stats (single) ----

export const neonGetAthleteStats = async (
  athleteId: number,
): Promise<CachedAthleteStats | null> =>
  getFromNeon<CachedAthleteStats>('athlete-stats', athleteId);

export const neonSyncAthleteStats = (record: CachedAthleteStats): void => {
  postToNeon('athlete-stats', record);
};

// ---- Athlete Zones (single by key) ----

export const neonGetAthleteZones = async (
  key: string,
): Promise<CachedAthleteZones | null> =>
  getFromNeon<CachedAthleteZones>('athlete-zones', key);

export const neonSyncAthleteZones = (record: CachedAthleteZones): void => {
  postToNeon('athlete-zones', record);
};

// ---- Athlete Gear (single by key) ----

export const neonGetAthleteGear = async (
  key: string,
): Promise<CachedAthleteGear | null> =>
  getFromNeon<CachedAthleteGear>('athlete-gear', key);

export const neonSyncAthleteGear = (record: CachedAthleteGear): void => {
  postToNeon('athlete-gear', record);
};

// ---- Zone Breakdowns (single) ----

export const neonGetZoneBreakdown = async (
  activityId: number,
): Promise<CachedZoneBreakdown | null> =>
  getFromNeon<CachedZoneBreakdown>('zone-breakdowns', activityId);

export const neonSyncZoneBreakdown = (record: CachedZoneBreakdown): void => {
  postToNeon('zone-breakdowns', record);
};
