const settingsInflight = new Map<number, Promise<Record<string, unknown> | null>>();
const settingsCache = new Map<number, {value: Record<string, unknown> | null; cachedAt: number}>();
const CACHE_TTL_MS = 5000;

export const clearUserSettingsRowCache = (athleteId?: number): void => {
  if (typeof athleteId === 'number') {
    settingsCache.delete(athleteId);
    return;
  }
  settingsCache.clear();
};

export const fetchUserSettingsRow = async (
  athleteId: number,
): Promise<Record<string, unknown> | null> => {
  const cached = settingsCache.get(athleteId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const existing = settingsInflight.get(athleteId);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const res = await fetch(`/api/db/user-settings?athleteId=${athleteId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch settings: ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown> | null;
    settingsCache.set(athleteId, {value: data, cachedAt: Date.now()});
    return data;
  })();

  settingsInflight.set(athleteId, request);
  try {
    return await request;
  } finally {
    settingsInflight.delete(athleteId);
  }
};

