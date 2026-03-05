// ============================================================
// Retired Gear — Persisted to Neon (PostgreSQL)
// ============================================================
//
// The Strava API has no "retired" field for gear, so we manage
// retirement status ourselves. The retiredGearIds array is stored
// alongside the gear record in Neon so it syncs across devices
// and is available to the AI coach.

import {neonGetAthleteGear, neonSyncAthleteGear} from './neonSync';

// ----- Toggle retired status (async, writes to Neon) -----

/**
 * Toggle the retired status of a gear item.
 * Reads the current Neon record, updates retiredGearIds, writes back.
 * Returns the new retired state.
 */
export const toggleRetiredGear = async (
  athleteId: number,
  gearId: string,
): Promise<boolean> => {
  const record = await neonGetAthleteGear(athleteId);
  if (!record) return false;

  const ids = new Set(record.retiredGearIds ?? []);
  const nowRetired = !ids.has(gearId);

  if (nowRetired) {
    ids.add(gearId);
  } else {
    ids.delete(gearId);
  }

  record.retiredGearIds = [...ids];
  await neonSyncAthleteGear(record);

  return nowRetired;
};
