import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {UserSettings, defaultSettings, DEFAULT_MODEL} from '@/lib/mockData';

const LS_KEY = 'mamoot-settings';

interface SettingsContextType {
  settings: UserSettings;
  /** Whether settings have been loaded from Neon (source of truth). */
  isLoadingSettings: boolean;
  /** Update settings: writes to Neon first, then updates local state + cache. */
  updateSettings: (newSettings: UserSettings) => Promise<void>;
  /** Load settings from Neon once athleteId is known. Called by the bridge in providers. */
  loadSettings: (athleteId: number) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

/** Read localStorage cache (optimistic initial value). Never throws. */
const readCache = (): UserSettings | null => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return migrateSettings(JSON.parse(raw));
  } catch {
    return null;
  }
};

/** Write to localStorage cache. Never throws. */
const writeCache = (settings: UserSettings): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable — non-critical
  }
};

/** Migrate saved settings: 5→6 zones, add missing fields */
const migrateSettings = (parsed: unknown): UserSettings => {
  const s = parsed as UserSettings;

  // Validate essential structure — if zones or HR data is missing, bail out
  if (!s || typeof s.maxHr !== 'number' || !s.zones) {
    return defaultSettings;
  }

  if (!s.zones?.z6) {
    const z5 = s.zones?.z5;
    if (!z5) return defaultSettings;
    const z5Max = z5[1];
    s.zones.z5 = [z5[0], Math.round((z5Max + s.maxHr) / 2)];
    s.zones.z6 = [s.zones.z5[1] + 1, s.maxHr];
  }
  if (s.goal === undefined) s.goal = '';
  if (s.allergies === undefined) s.allergies = [];
  if (s.foodPreferences === undefined) s.foodPreferences = '';
  if (s.injuries === undefined) s.injuries = [];
  if (s.aiModel === undefined) s.aiModel = DEFAULT_MODEL;
  if (s.trainingBalance === undefined) s.trainingBalance = 50;
  return s;
};

/** Convert a Neon row into a UserSettings object. */
const neonRowToSettings = (row: Record<string, unknown>): UserSettings => {
  return migrateSettings({
    maxHr: row.maxHr ?? row.max_hr,
    restingHr: row.restingHr ?? row.resting_hr,
    zones: row.zones,
    goal: row.goal ?? '',
    allergies: row.allergies ?? [],
    foodPreferences: row.foodPreferences ?? row.food_preferences ?? '',
    injuries: row.injuries ?? [],
    aiModel: row.aiModel ?? row.ai_model ?? DEFAULT_MODEL,
    trainingBalance: row.trainingBalance ?? row.training_balance ?? 50,
  });
};

/** POST settings to Neon. Rejects on failure so callers can handle errors. */
const saveToNeon = async (
  athleteId: number,
  settings: UserSettings,
): Promise<void> => {
  // First, read the current row to preserve weight/city (synced from Strava profile)
  let existingWeight: number | null = null;
  let existingCity: string | null = null;
  try {
    const res = await fetch(`/api/db/user-settings?athleteId=${athleteId}`);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        existingWeight = data.weight ?? null;
        existingCity = data.city ?? null;
      }
    }
  } catch {
    // Non-blocking — proceed without existing profile data
  }

  const res = await fetch('/api/db/user-settings', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      athleteId,
      maxHr: settings.maxHr,
      restingHr: settings.restingHr,
      zones: settings.zones,
      goal: settings.goal ?? null,
      allergies: settings.allergies ?? [],
      foodPreferences: settings.foodPreferences ?? null,
      injuries: settings.injuries ?? [],
      aiModel: settings.aiModel ?? null,
      trainingBalance: settings.trainingBalance ?? 50,
      weight: existingWeight,
      city: existingCity,
      updatedAt: Date.now(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save settings: ${res.status}`);
  }
};

/** GET settings from Neon. Returns null if no row exists. */
const fetchFromNeon = async (
  athleteId: number,
): Promise<UserSettings | null> => {
  const res = await fetch(
    `/api/db/user-settings?athleteId=${athleteId}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch settings: ${res.status}`);
  }
  const data = await res.json();
  if (!data) return null;
  return neonRowToSettings(data);
};

export function SettingsProvider({children}: {children: ReactNode}) {
  // Start with cached localStorage value (optimistic) or defaults
  const [settings, setSettings] = useState<UserSettings>(
    () => readCache() ?? defaultSettings,
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [athleteId, setAthleteId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  /**
   * Load settings from Neon (source of truth).
   * - If Neon has data → use it, update cache.
   * - If Neon has no data (new user) → push current defaults to Neon.
   * - If Neon is unreachable → keep whatever we have (cached or defaults).
   */
  const loadSettings = useCallback(async (id: number) => {
    // Prevent re-loading if already done for this athlete
    setAthleteId((prev) => {
      if (prev === id) return prev;
      return id;
    });
    setLoaded((prev) => {
      if (prev) return prev; // already loaded, skip
      return false;
    });

    setIsLoadingSettings(true);
    try {
      const neonSettings = await fetchFromNeon(id);

      if (neonSettings) {
        // Neon has settings → use them as source of truth
        setSettings(neonSettings);
        writeCache(neonSettings);
      } else {
        // New user: no row in Neon → seed Neon with current settings
        const current = readCache() ?? defaultSettings;
        setSettings(current);
        writeCache(current);
        await saveToNeon(id, current).catch((err) => {
          console.error('[Settings] Failed to seed Neon for new user:', err);
        });
      }
    } catch (err) {
      // Neon unreachable — keep cached/default settings, don't overwrite Neon
      console.error('[Settings] Failed to load from Neon, using cache:', err);
    } finally {
      setIsLoadingSettings(false);
      setLoaded(true);
    }
  }, []);

  /**
   * Save settings: write to Neon first (awaited), then update state + cache.
   * Throws if Neon write fails so the UI can show an error.
   */
  const updateSettings = useCallback(
    async (newSettings: UserSettings) => {
      if (athleteId) {
        await saveToNeon(athleteId, newSettings);
      }
      setSettings(newSettings);
      writeCache(newSettings);
    },
    [athleteId],
  );

  return (
    <SettingsContext.Provider
      value={{settings, isLoadingSettings, updateSettings, loadSettings}}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error('useSettings must be used within a SettingsProvider');
  return context;
}
