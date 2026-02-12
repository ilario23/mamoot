import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import {UserSettings, defaultSettings, DEFAULT_MODEL} from '@/lib/mockData';

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (newSettings: UserSettings) => void;
  /** Sync settings to Neon for server-side AI tool access. Call once athleteId is known. */
  syncToNeon: (athleteId: number) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

/** Migrate saved settings: 5→6 zones, add goal field if missing */
const migrateSettings = (parsed: unknown): UserSettings => {
  const s = parsed as UserSettings;
  if (!s.zones?.z6) {
    const z5Max = s.zones.z5[1];
    s.zones.z5 = [s.zones.z5[0], Math.round((z5Max + s.maxHr) / 2)];
    s.zones.z6 = [s.zones.z5[1] + 1, s.maxHr];
  }
  // Add goal field if missing (pre-AI coach users)
  if (s.goal === undefined) {
    s.goal = '';
  }
  // Add nutrition & injury fields if missing
  if (s.allergies === undefined) {
    s.allergies = [];
  }
  if (s.foodPreferences === undefined) {
    s.foodPreferences = '';
  }
  if (s.injuries === undefined) {
    s.injuries = [];
  }
  // Add AI model field if missing
  if (s.aiModel === undefined) {
    s.aiModel = DEFAULT_MODEL;
  }
  return s;
};

/** Fire-and-forget POST to sync settings to Neon */
const pushSettingsToNeon = (
  athleteId: number,
  settings: UserSettings,
): void => {
  fetch('/api/db/user-settings', {
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
      updatedAt: Date.now(),
    }),
  }).catch((err) => {
    console.error('[SettingsSync] Failed to sync to Neon:', err);
  });
};

export function SettingsProvider({children}: {children: ReactNode}) {
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem('mamoot-settings');
      if (!saved) return defaultSettings;
      return migrateSettings(JSON.parse(saved));
    } catch {
      return defaultSettings;
    }
  });

  // Track the athleteId for fire-and-forget syncs
  const athleteIdRef = useRef<number | null>(null);
  const backfilledRef = useRef(false);

  const updateSettings = useCallback((newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem('mamoot-settings', JSON.stringify(newSettings));

    // Fire-and-forget sync to Neon
    if (athleteIdRef.current) {
      pushSettingsToNeon(athleteIdRef.current, newSettings);
    }
  }, []);

  const syncToNeon = useCallback(
    (athleteId: number) => {
      athleteIdRef.current = athleteId;

      // Backfill on first call: push current settings so Neon has them
      if (!backfilledRef.current) {
        backfilledRef.current = true;
        pushSettingsToNeon(athleteId, settings);
      }
    },
    [settings],
  );

  return (
    <SettingsContext.Provider value={{settings, updateSettings, syncToNeon}}>
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
