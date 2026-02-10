"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { useSearchParams, useRouter } from "next/navigation";
import { useSettings } from "@/contexts/SettingsContext";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { useForceRefreshActivities } from "@/hooks/useStrava";
import { UserSettings, ZONE_COLORS, ZONE_NAMES, type Injury } from "@/lib/mockData";
import { getCacheStats, clearAllCache } from "@/lib/db";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Sun, Moon, Link2, Link2Off, Loader2, Database, Trash2, RefreshCw, X, Plus } from "lucide-react";

const COMMON_ALLERGIES = ["Gluten", "Dairy", "Nuts", "Shellfish", "Soy", "Eggs"];

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
  const [allergyInput, setAllergyInput] = useState("");
  const forceRefreshActivities = useForceRefreshActivities();

  const handleAddAllergy = (allergy: string) => {
    const trimmed = allergy.trim();
    if (!trimmed) return;
    const exists = (formState.allergies ?? []).some(
      (a) => a.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return;
    setFormState((prev) => ({
      ...prev,
      allergies: [...(prev.allergies ?? []), trimmed],
    }));
    setAllergyInput("");
  };

  const handleRemoveAllergy = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      allergies: (prev.allergies ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleAllergyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddAllergy(allergyInput);
    }
  };

  const handleAddInjury = () => {
    setFormState((prev) => ({
      ...prev,
      injuries: [...(prev.injuries ?? []), { name: "", notes: "" }],
    }));
  };

  const handleUpdateInjury = (
    index: number,
    field: keyof Injury,
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      injuries: (prev.injuries ?? []).map((injury, i) =>
        i === index ? { ...injury, [field]: value } : injury
      ),
    }));
  };

  const handleRemoveInjury = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      injuries: (prev.injuries ?? []).filter((_, i) => i !== index),
    }));
  };

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
      description: "Your personal information has been updated successfully.",
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
    "z6",
  ];

  const athleteDisplayName = athlete
    ? `${athlete.firstname} ${athlete.lastname}`
    : "Unknown";

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
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

      {/* ── Personal Information ── */}
      <div className="border-3 border-border p-5 bg-background shadow-neo space-y-6">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Personal Information
        </h3>

        {/* Training Goal */}
        <div>
          <label className="font-black text-xs uppercase tracking-wider block mb-2">
            Training Goal
          </label>
          <p className="text-xs font-bold text-muted-foreground mb-3">
            Set your current training goal so the AI coaching team can give you personalized advice.
          </p>
          <input
            type="text"
            value={formState.goal ?? ""}
            onChange={(e) =>
              setFormState((prev) => ({ ...prev, goal: e.target.value }))
            }
            placeholder="e.g., Sub-50 10K in May, First marathon in October, Build aerobic base..."
            aria-label="Training goal"
            className="w-full px-4 py-3 border-3 border-border font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Max HR & Resting HR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
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
          <div>
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
        <div>
          <label className="font-black text-xs uppercase tracking-wider block mb-4">
            Heart Rate Zones
          </label>
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
        <div className="border-3 border-border p-4 bg-background">
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
      </div>

      {/* ── Nutrition Profile ── */}
      <div className="border-3 border-border p-5 bg-background shadow-neo space-y-6">
        <div>
          <h3 className="font-black text-lg uppercase tracking-wider">
            Nutrition Profile
          </h3>
          <p className="text-xs font-bold text-muted-foreground mt-1">
            This information is shared with the Nutritionist to personalize dietary advice.
          </p>
        </div>

        {/* Allergies */}
        <div>
          <label className="font-black text-xs uppercase tracking-wider block mb-2">
            Allergies
          </label>

          {/* Current allergy tags */}
          {(formState.allergies ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {(formState.allergies ?? []).map((allergy, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-destructive/10 text-destructive font-bold text-xs border-3 border-destructive/30"
                >
                  {allergy}
                  <button
                    type="button"
                    onClick={() => handleRemoveAllergy(index)}
                    className="hover:text-destructive/80 transition-colors"
                    aria-label={`Remove ${allergy} allergy`}
                    tabIndex={0}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Input for adding custom allergy */}
          <div className="flex gap-2">
            <input
              type="text"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={handleAllergyKeyDown}
              placeholder="Type an allergy and press Enter..."
              aria-label="Add allergy"
              className="flex-1 px-4 py-2 border-3 border-border font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              onClick={() => handleAddAllergy(allergyInput)}
              className="px-4 py-2 bg-primary text-primary-foreground font-black text-sm border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              aria-label="Add allergy"
              tabIndex={0}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Quick-add common allergies */}
          <div className="mt-3">
            <p className="text-xs font-bold text-muted-foreground mb-2">
              Common allergies:
            </p>
            <div className="flex flex-wrap gap-2">
              {COMMON_ALLERGIES.filter(
                (a) =>
                  !(formState.allergies ?? []).some(
                    (existing) => existing.toLowerCase() === a.toLowerCase()
                  )
              ).map((allergy) => (
                <button
                  key={allergy}
                  type="button"
                  onClick={() => handleAddAllergy(allergy)}
                  className="px-3 py-1 border-3 border-border font-bold text-xs bg-muted hover:bg-muted/80 transition-colors shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                  aria-label={`Add ${allergy} allergy`}
                  tabIndex={0}
                >
                  + {allergy}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Food Preferences */}
        <div>
          <label className="font-black text-xs uppercase tracking-wider block mb-2">
            Food Preferences
          </label>
          <p className="text-xs font-bold text-muted-foreground mb-3">
            Describe your dietary preferences, restrictions, or eating style.
          </p>
          <textarea
            value={formState.foodPreferences ?? ""}
            onChange={(e) =>
              setFormState((prev) => ({ ...prev, foodPreferences: e.target.value }))
            }
            placeholder="e.g., Vegetarian, high-protein diet, Mediterranean style, no red meat, prefer whole foods..."
            aria-label="Food preferences"
            rows={3}
            className="w-full px-4 py-3 border-3 border-border font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50 resize-y"
          />
        </div>
      </div>

      {/* ── Injuries ── */}
      <div className="border-3 border-border p-5 bg-background shadow-neo space-y-6">
        <div>
          <h3 className="font-black text-lg uppercase tracking-wider">
            Injuries
          </h3>
          <p className="text-xs font-bold text-muted-foreground mt-1">
            This information is shared with Coach and Physio to adapt training and recovery recommendations.
          </p>
        </div>

        {/* Injury list */}
        {(formState.injuries ?? []).length > 0 && (
          <div className="space-y-4">
            {(formState.injuries ?? []).map((injury, index) => (
              <div
                key={index}
                className="border-3 border-border p-4 bg-muted/30 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <input
                      type="text"
                      value={injury.name}
                      onChange={(e) =>
                        handleUpdateInjury(index, "name", e.target.value)
                      }
                      placeholder="Injury name (e.g., Left knee pain, Achilles tightness)"
                      aria-label={`Injury ${index + 1} name`}
                      className="w-full px-4 py-2 border-3 border-border font-bold text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
                    />
                    <textarea
                      value={injury.notes ?? ""}
                      onChange={(e) =>
                        handleUpdateInjury(index, "notes", e.target.value)
                      }
                      placeholder="Optional notes (e.g., Since January, worse on downhills, improving with stretching)"
                      aria-label={`Injury ${index + 1} notes`}
                      rows={2}
                      className="w-full px-4 py-2 border-3 border-border font-bold text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50 resize-y"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveInjury(index)}
                    className="p-2 bg-destructive text-destructive-foreground border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] shrink-0"
                    aria-label={`Remove injury ${index + 1}`}
                    tabIndex={0}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAddInjury}
          className="flex items-center gap-2 px-5 py-2.5 bg-muted font-black text-sm border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          aria-label="Add injury"
          tabIndex={0}
        >
          <Plus className="h-4 w-4" />
          Add Injury
        </button>
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
