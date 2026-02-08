import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { UserSettings, ZONE_COLORS, ZONE_NAMES } from "@/lib/mockData";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const { settings, updateSettings } = useSettings();
  const [formState, setFormState] = useState<UserSettings>(
    JSON.parse(JSON.stringify(settings))
  );

  const handleZoneChange = (
    zone: keyof UserSettings["zones"],
    index: 0 | 1,
    value: string
  ) => {
    const num = parseInt(value) || 0;
    setFormState((prev) => ({
      ...prev,
      zones: {
        ...prev.zones,
        [zone]: prev.zones[zone].map((v: number, i: number) =>
          i === index ? num : v
        ) as [number, number],
      },
    }));
  };

  const handleSave = () => {
    updateSettings(formState);
    toast({
      title: "Settings Saved ✓",
      description: "Your HR zones have been updated successfully.",
    });
  };

  const zoneKeys: (keyof UserSettings["zones"])[] = [
    "z1",
    "z2",
    "z3",
    "z4",
    "z5",
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
        Settings
      </h1>

      {/* Max HR & Resting HR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border-3 border-foreground p-5 bg-background shadow-neo">
          <label className="font-black text-xs uppercase tracking-wider block mb-2">
            Maximum Heart Rate
          </label>
          <input
            type="number"
            value={formState.maxHr}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                maxHr: parseInt(e.target.value) || 0,
              }))
            }
            className="w-full px-4 py-3 border-3 border-foreground font-black text-2xl bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs font-bold text-muted-foreground mt-2">bpm</p>
        </div>
        <div className="border-3 border-foreground p-5 bg-background shadow-neo">
          <label className="font-black text-xs uppercase tracking-wider block mb-2">
            Resting Heart Rate
          </label>
          <input
            type="number"
            value={formState.restingHr}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                restingHr: parseInt(e.target.value) || 0,
              }))
            }
            className="w-full px-4 py-3 border-3 border-foreground font-black text-2xl bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs font-bold text-muted-foreground mt-2">bpm</p>
        </div>
      </div>

      {/* HR Zone Editors */}
      <div className="border-3 border-foreground p-5 bg-background shadow-neo">
        <h3 className="font-black text-lg uppercase tracking-wider mb-4">
          Heart Rate Zones
        </h3>
        <div className="space-y-4">
          {zoneKeys.map((zone, i) => {
            const zoneNum = i + 1;
            return (
              <div key={zone} className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <div
                  className="w-3 h-10 shrink-0"
                  style={{
                    backgroundColor:
                      ZONE_COLORS[zoneNum as keyof typeof ZONE_COLORS],
                  }}
                />
                <span className="font-black text-sm w-28 shrink-0">
                  Z{zoneNum} {ZONE_NAMES[zoneNum as keyof typeof ZONE_NAMES]}
                </span>
                <input
                  type="number"
                  value={formState.zones[zone][0]}
                  onChange={(e) => handleZoneChange(zone, 0, e.target.value)}
                  className="w-20 px-3 py-2 border-3 border-foreground font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary text-center"
                />
                <span className="font-black">—</span>
                <input
                  type="number"
                  value={formState.zones[zone][1]}
                  onChange={(e) => handleZoneChange(zone, 1, e.target.value)}
                  className="w-20 px-3 py-2 border-3 border-foreground font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary text-center"
                />
                <span className="font-bold text-xs text-muted-foreground">
                  bpm
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual zone bar */}
      <div className="border-3 border-foreground p-4 bg-background shadow-neo-sm">
        <p className="font-black text-xs uppercase tracking-wider mb-3">
          Zone Distribution
        </p>
        <div className="flex h-8 border-3 border-foreground overflow-hidden">
          {zoneKeys.map((zone, i) => {
            const zoneNum = i + 1;
            const range = formState.zones[zone][1] - formState.zones[zone][0];
            const totalRange = formState.maxHr - formState.restingHr;
            const width = totalRange > 0 ? (range / totalRange) * 100 : 20;
            return (
              <div
                key={zone}
                className="flex items-center justify-center font-black text-xs"
                style={{
                  width: `${width}%`,
                  backgroundColor:
                    ZONE_COLORS[zoneNum as keyof typeof ZONE_COLORS],
                }}
              >
                Z{zoneNum}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        className="px-8 py-4 rounded-full bg-primary text-primary-foreground font-black text-lg border-3 border-foreground shadow-neo hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all active:shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px]"
      >
        Save Configuration
      </button>
    </div>
  );
};

export default Settings;
