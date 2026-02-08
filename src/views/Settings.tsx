"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { useSearchParams, useRouter } from "next/navigation";
import { useSettings } from "@/contexts/SettingsContext";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { useForceRefreshActivities } from "@/hooks/useStrava";
import { UserSettings, ZONE_COLORS, ZONE_NAMES } from "@/lib/mockData";
import { getCacheStats, clearAllCache } from "@/lib/db";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Sun, Moon, Link2, Link2Off, Loader2, Database, Trash2, RefreshCw } from "lucide-react";

const Settings = () => {
  const { settings, updateSettings } = useSettings();
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, isLoading: authLoading, athlete, login, logout, handleOAuthCallback } = useStravaAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [formState, setFormState] = useState<UserSettings>(
    JSON.parse(JSON.stringify(settings))
  );
  const [isExchangingCode, setIsExchangingCode] = useState(false);
  const [cacheStats, setCacheStats] = useState<{
    activities: number;
    activityDetails: number;
    activityStreams: number;
    totalRecords: number;
  } | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const forceRefreshActivities = useForceRefreshActivities();

  const loadCacheStats = useCallback(async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch {
      // Silently fail — cache stats are non-critical
    }
  }, []);

  useEffect(() => {
    loadCacheStats();
  }, [loadCacheStats]);

  const handleClearCache = async () => {
    setIsCacheLoading(true);
    try {
      await clearAllCache();
      await loadCacheStats();
      toast({
        title: "Cache Cleared",
        description: "All cached Strava data has been removed. Data will be re-fetched from Strava on next visit.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to clear cache. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCacheLoading(false);
    }
  };

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      await forceRefreshActivities();
      await loadCacheStats();
      toast({
        title: "Activities Refreshed",
        description: "All activities have been re-fetched from Strava.",
      });
    } catch {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh activities from Strava. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle OAuth callback when redirected back from Strava
  useEffect(() => {
    const code = searchParams.get("code");
    const scope = searchParams.get("scope");
    const error = searchParams.get("error");

    if (error) {
      toast({
        title: "Strava Authorization Failed",
        description: "You denied access or an error occurred.",
        variant: "destructive",
      });
      // Clean up URL
      router.replace("/settings", { scroll: false });
      return;
    }

    if (code && !isAuthenticated && !isExchangingCode) {
      setIsExchangingCode(true);
      handleOAuthCallback(code)
        .then(() => {
          toast({
            title: "Strava Connected",
            description: "Your Strava account has been linked successfully.",
          });
        })
        .catch((err) => {
          console.error("OAuth error:", err);
          toast({
            title: "Connection Failed",
            description: "Could not link your Strava account. Please try again.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsExchangingCode(false);
          // Clean up URL params
          router.replace("/settings", { scroll: false });
        });
    }
  }, [searchParams, isAuthenticated, handleOAuthCallback, router, isExchangingCode]);

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
      title: "Settings Saved",
      description: "Your HR zones have been updated successfully.",
    });
  };

  const handleStravaConnect = () => {
    login();
  };

  const handleStravaDisconnect = () => {
    logout();
    toast({
      title: "Strava Disconnected",
      description: "Your Strava account has been unlinked.",
    });
  };

  const handleToggleDarkMode = (checked: boolean) => {
    setTheme(checked ? "dark" : "light");
  };

  const isDark = theme === "dark";

  const zoneKeys: (keyof UserSettings["zones"])[] = [
    "z1",
    "z2",
    "z3",
    "z4",
    "z5",
  ];

  const athleteDisplayName = athlete
    ? `${athlete.firstname} ${athlete.lastname}`
    : "Unknown";

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
        Settings
      </h1>

      {/* Appearance */}
      <div className="border-3 border-border p-5 bg-background shadow-neo">
        <h3 className="font-black text-lg uppercase tracking-wider mb-4">
          Appearance
        </h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isDark ? (
              <Moon className="h-6 w-6" />
            ) : (
              <Sun className="h-6 w-6" />
            )}
            <div>
              <p className="font-black text-sm">Dark Mode</p>
              <p className="text-xs font-bold text-muted-foreground">
                {isDark ? "Dark theme active" : "Light theme active"}
              </p>
            </div>
          </div>
          <Switch
            checked={isDark}
            onCheckedChange={handleToggleDarkMode}
            aria-label="Toggle dark mode"
            className="border-3 border-border"
          />
        </div>
      </div>

      {/* Strava Connection */}
      <div className="border-3 border-border p-5 bg-background shadow-neo">
        <h3 className="font-black text-lg uppercase tracking-wider mb-4">
          Strava Account
        </h3>
        {(authLoading || isExchangingCode) ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="font-bold text-sm">Connecting to Strava...</p>
          </div>
        ) : isAuthenticated && athlete ? (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {athlete.profile_medium ? (
                <img
                  src={athlete.profile_medium}
                  alt={athleteDisplayName}
                  className="w-10 h-10 rounded-full border-3 border-border shadow-neo-sm object-cover"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full border-3 border-border flex items-center justify-center shadow-neo-sm"
                  style={{ backgroundColor: "#FC4C02" }}
                >
                  <Link2 className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-black text-sm">Connected as {athleteDisplayName}</p>
                <p className="text-xs font-bold text-muted-foreground">
                  Syncing activities from Strava
                </p>
              </div>
            </div>
            <button
              onClick={handleStravaDisconnect}
              className="px-5 py-2 bg-destructive text-destructive-foreground font-black text-sm border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              aria-label="Disconnect Strava"
              tabIndex={0}
            >
              <span className="flex items-center gap-2">
                <Link2Off className="h-4 w-4" />
                Disconnect
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-3 border-border bg-muted flex items-center justify-center">
                <Link2Off className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-black text-sm">Not Connected</p>
                <p className="text-xs font-bold text-muted-foreground">
                  Link your Strava account to sync activities
                </p>
              </div>
            </div>
            <button
              onClick={handleStravaConnect}
              className="px-5 py-3 font-black text-sm text-white border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              style={{ backgroundColor: "#FC4C02" }}
              aria-label="Connect with Strava"
              tabIndex={0}
            >
              Connect with Strava
            </button>
          </div>
        )}
      </div>

      {/* Max HR & Resting HR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border-3 border-border p-5 bg-background shadow-neo">
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
            className="w-full px-4 py-3 border-3 border-border font-black text-2xl bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs font-bold text-muted-foreground mt-2">bpm</p>
        </div>
        <div className="border-3 border-border p-5 bg-background shadow-neo">
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
            className="w-full px-4 py-3 border-3 border-border font-black text-2xl bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs font-bold text-muted-foreground mt-2">bpm</p>
        </div>
      </div>

      {/* HR Zone Editors */}
      <div className="border-3 border-border p-5 bg-background shadow-neo">
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
                  className="w-20 px-3 py-2 border-3 border-border font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary text-center"
                />
                <span className="font-black">—</span>
                <input
                  type="number"
                  value={formState.zones[zone][1]}
                  onChange={(e) => handleZoneChange(zone, 1, e.target.value)}
                  className="w-20 px-3 py-2 border-3 border-border font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary text-center"
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
      <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
        <p className="font-black text-xs uppercase tracking-wider mb-3">
          Zone Distribution
        </p>
        <div className="flex h-8 border-3 border-border overflow-hidden">
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
        className="px-8 py-4 rounded-full bg-primary text-primary-foreground font-black text-lg border-3 border-border shadow-neo hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all active:shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px]"
      >
        Save Configuration
      </button>
    </div>
  );
};

export default Settings;
