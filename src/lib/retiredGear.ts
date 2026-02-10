// ============================================================
// Retired Gear — Persisted to Dexie (IndexedDB) + Neon (PostgreSQL)
// ============================================================
//
// The Strava API has no "retired" field for gear, so we manage
// retirement status ourselves. Previously this lived in localStorage;
// now it's stored alongside the gear record in both Dexie and Neon
// so it syncs across devices and is available to the AI coach.

import {db} from './db';
import {neonSyncAthleteGear} from './neonSync';

const GEAR_KEY = 'athlete-gear';
const LEGACY_STORAGE_KEY = 'runteam-retired-gear';

// ----- Toggle retired status (async, writes to Dexie + Neon) -----

/**
 * Toggle the retired status of a gear item.
 * Reads the current Dexie record, updates retiredGearIds, writes back,
 * and fire-and-forget syncs to Neon.
 * Returns the new retired state.
 */
export const toggleRetiredGear = async (gearId: string): Promise<boolean> => {
  const record = await db.athleteGear.get(GEAR_KEY);
  if (!record) return false;

  const ids = new Set(record.retiredGearIds ?? []);
  const nowRetired = !ids.has(gearId);

  if (nowRetired) {
    ids.add(gearId);
  } else {
    ids.delete(gearId);
  }

  record.retiredGearIds = [...ids];
  await db.athleteGear.put(record);
  neonSyncAthleteGear(record); // fire-and-forget

  return nowRetired;
};

// ----- One-time migration from localStorage to Dexie -----

/**
 * Migrates any retired gear IDs stored in the old localStorage key
 * into the Dexie athlete gear record. Clears localStorage after migration.
 * Safe to call multiple times — no-ops if nothing to migrate.
 */
export const migrateLocalStorageRetiredGear = async (): Promise<void> => {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const legacyIds: string[] = Array.isArray(parsed) ? parsed : [];
    if (legacyIds.length === 0) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }

    const record = await db.athleteGear.get(GEAR_KEY);
    if (!record) return; // No gear record yet — migration will happen on next load

    // Merge legacy IDs with any existing ones (deduplicated)
    const merged = new Set([...(record.retiredGearIds ?? []), ...legacyIds]);
    record.retiredGearIds = [...merged];

    await db.athleteGear.put(record);
    neonSyncAthleteGear(record); // fire-and-forget

    // Clear the legacy key
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Silently ignore — localStorage may be unavailable (SSR)
  }
};
