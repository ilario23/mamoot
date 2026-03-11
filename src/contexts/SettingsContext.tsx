import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  UserSettings,
  defaultSettings,
  DEFAULT_MODEL,
  createDefaultPaceZones,
} from '@/lib/activityModel';
import {clearUserSettingsRowCache, fetchUserSettingsRow} from '@/lib/userSettingsSync';
import {dbFetch} from '@/lib/dbClient';

const LS_KEY = 'mamoot-settings';
const getSettingsStorageKey = (athleteId: number): string =>
  `${LS_KEY}:${athleteId}`;

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
const readCache = (athleteId: number): UserSettings | null => {
  try {
    const raw =
      localStorage.getItem(getSettingsStorageKey(athleteId))
      ?? localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return migrateSettings(JSON.parse(raw));
  } catch {
    return null;
  }
};

/** Write to localStorage cache. Never throws. */
const writeCache = (athleteId: number, settings: UserSettings): void => {
  try {
    localStorage.setItem(getSettingsStorageKey(athleteId), JSON.stringify(settings));
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
  if (!s.paceZones) {
    s.paceZones = createDefaultPaceZones();
  } else {
    const defaults = createDefaultPaceZones();
    s.paceZones = {
      z1: {...defaults.z1, ...(s.paceZones.z1 ?? {})},
      z2: {...defaults.z2, ...(s.paceZones.z2 ?? {})},
      z3: {...defaults.z3, ...(s.paceZones.z3 ?? {})},
      z4: {...defaults.z4, ...(s.paceZones.z4 ?? {})},
      z5: {...defaults.z5, ...(s.paceZones.z5 ?? {})},
      z6: {...defaults.z6, ...(s.paceZones.z6 ?? {})},
    };
  }
  if (s.goal === undefined) s.goal = '';
  if (s.allergies === undefined) s.allergies = [];
  if (s.foodPreferences === undefined) s.foodPreferences = '';
  if (s.injuries === undefined) s.injuries = [];
  if (s.aiModel === undefined) s.aiModel = DEFAULT_MODEL;
  if (s.trainingBalance === undefined) s.trainingBalance = 50;
  if (s.strategySelectionMode === undefined) s.strategySelectionMode = 'auto';
  if (s.strategyPreset === undefined) s.strategyPreset = 'polarized_80_20';
  if (s.optimizationPriority === undefined)
    s.optimizationPriority = 'race_performance';
  return s;
};

/** Convert a Neon row into a UserSettings object. */
const neonRowToSettings = (row: Record<string, unknown>): UserSettings => {
  return migrateSettings({
    maxHr: row.maxHr ?? row.max_hr,
    restingHr: row.restingHr ?? row.resting_hr,
    zones: row.zones,
    paceZones: row.paceZones ?? row.pace_zones,
    goal: row.goal ?? '',
    allergies: row.allergies ?? [],
    foodPreferences: row.foodPreferences ?? row.food_preferences ?? '',
    injuries: row.injuries ?? [],
    aiModel: row.aiModel ?? row.ai_model ?? DEFAULT_MODEL,
    trainingBalance: row.trainingBalance ?? row.training_balance ?? 50,
    strategySelectionMode:
      row.strategySelectionMode ?? row.strategy_selection_mode ?? 'auto',
    strategyPreset:
      row.strategyPreset ?? row.strategy_preset ?? 'polarized_80_20',
    optimizationPriority:
      row.optimizationPriority ??
      row.optimization_priority ??
      'race_performance',
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
    const data = await fetchUserSettingsRow(athleteId);
    if (data) {
      existingWeight = (data.weight as number | null | undefined) ?? null;
      existingCity = (data.city as string | null | undefined) ?? null;
    }
  } catch {
    // Non-blocking — proceed without existing profile data
  }

  const res = await dbFetch('/api/db/user-settings', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      athleteId,
      maxHr: settings.maxHr,
      restingHr: settings.restingHr,
      zones: settings.zones,
      paceZones: settings.paceZones,
      goal: settings.goal ?? null,
      allergies: settings.allergies ?? [],
      foodPreferences: settings.foodPreferences ?? null,
      injuries: settings.injuries ?? [],
      aiModel: settings.aiModel ?? null,
      trainingBalance: settings.trainingBalance ?? 50,
      strategySelectionMode: settings.strategySelectionMode ?? 'auto',
      strategyPreset: settings.strategyPreset ?? 'polarized_80_20',
      optimizationPriority: settings.optimizationPriority ?? 'race_performance',
      weight: existingWeight,
      city: existingCity,
      updatedAt: Date.now(),
    }),
  }, athleteId);
  if (!res.ok) {
    throw new Error(`Failed to save settings: ${res.status}`);
  }
  clearUserSettingsRowCache(athleteId);
};

/** GET settings from Neon. Returns null if no row exists. */
const fetchFromNeon = async (
  athleteId: number,
): Promise<UserSettings | null> => {
  const data = await fetchUserSettingsRow(athleteId);
  if (!data) return null;
  return neonRowToSettings(data);
};

export function SettingsProvider({children}: {children: ReactNode}) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [athleteId, setAthleteId] = useState<number | null>(null);
  const [loadedAthleteId, setLoadedAthleteId] = useState<number | null>(null);

  /**
   * Load settings from Neon (source of truth).
   * - If Neon has data → use it, update cache.
   * - If Neon has no data (new user) → push current defaults to Neon.
   * - If Neon is unreachable → keep whatever we have (cached or defaults).
   */
  const loadSettings = useCallback(async (id: number) => {
    if (loadedAthleteId === id) return;
    setAthleteId(id);

    setIsLoadingSettings(true);
    try {
      const neonSettings = await fetchFromNeon(id);

      if (neonSettings) {
        // Neon has settings → use them as source of truth
        setSettings(neonSettings);
        writeCache(id, neonSettings);
      } else {
        // New user: no row in Neon → seed Neon with current settings
        const current = readCache(id) ?? defaultSettings;
        setSettings(current);
        writeCache(id, current);
        await saveToNeon(id, current).catch((err) => {
          console.error('[Settings] Failed to seed Neon for new user:', err);
        });
      }
    } catch (err) {
      // Neon unreachable — keep cached/default settings, don't overwrite Neon
      console.error('[Settings] Failed to load from Neon, using cache:', err);
    } finally {
      setIsLoadingSettings(false);
      setLoadedAthleteId(id);
    }
  }, [loadedAthleteId]);

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
      if (athleteId) {
        writeCache(athleteId, newSettings);
      }
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
