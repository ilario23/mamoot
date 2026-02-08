import { createContext, useContext, useState, ReactNode } from "react";
import { UserSettings, defaultSettings } from "@/lib/mockData";

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (newSettings: UserSettings) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

/** Migrate saved settings that only have 5 zones to the 6-zone model */
const migrateSettings = (parsed: unknown): UserSettings => {
  const s = parsed as UserSettings;
  if (!s.zones?.z6) {
    const z5Max = s.zones.z5[1];
    s.zones.z5 = [s.zones.z5[0], Math.round((z5Max + s.maxHr) / 2)];
    s.zones.z6 = [s.zones.z5[1] + 1, s.maxHr];
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
