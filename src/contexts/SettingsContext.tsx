import { createContext, useContext, useState, ReactNode } from "react";
import { UserSettings, defaultSettings } from "@/lib/mockData";

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (newSettings: UserSettings) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

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
  return s;
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem("runteam-settings");
      if (!saved) return defaultSettings;
      return migrateSettings(JSON.parse(saved));
    } catch {
      return defaultSettings;
    }
  });

  const updateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem("runteam-settings", JSON.stringify(newSettings));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error("useSettings must be used within a SettingsProvider");
  return context;
}
