// ============================================================
// Retired Gear — Local State (localStorage)
// The Strava API has no "retired" field for gear, so we manage
// retirement status entirely on the client side.
// ============================================================

const STORAGE_KEY = 'runteam-retired-gear';

/** Get the set of gear IDs marked as retired */
export const getRetiredGearIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

/** Check if a specific gear item is retired */
export const isGearRetired = (gearId: string): boolean => {
  return getRetiredGearIds().has(gearId);
};

/** Toggle the retired status of a gear item. Returns the new retired state. */
export const toggleRetiredGear = (gearId: string): boolean => {
  const ids = getRetiredGearIds();

  if (ids.has(gearId)) {
    ids.delete(gearId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    return false;
  }

  ids.add(gearId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  return true;
};
