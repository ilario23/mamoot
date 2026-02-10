"use client";

import { useState, useMemo } from "react";
import { useActivities } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { useSyncActivityDetails } from "@/hooks/useSyncActivityDetails";
import {
  computeRecords,
  computeAllProgressions,
  getAvailableActivityTypes,
  BUCKETS_BY_TYPE,
} from "@/lib/records";
import type { TimePeriod } from "@/lib/records";
import type { ActivityType } from "@/lib/mockData";
import RecordCard from "@/components/records/RecordCard";
import TimePeriodSelector from "@/components/records/TimePeriodSelector";
import ActivityTypeFilter from "@/components/records/ActivityTypeFilter";
import PaceProgressionChart from "@/components/records/PaceProgressionChart";
import SyncProgress from "@/components/records/SyncProgress";
import CollapsibleSection from "@/components/ui/collapsible-section";
import { Loader2 } from "lucide-react";

const Records = () => {
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();

  // Background sync: fetch activity details to extract best_efforts
  const syncState = useSyncActivityDetails(activities, isAuthenticated);

  const [period, setPeriod] = useState<TimePeriod>("all");
  const [activeType, setActiveType] = useState<ActivityType>("Run");

  // Determine which activity types exist in the data
  const availableTypes = useMemo(() => {
    if (!activities || activities.length === 0) return [] as ActivityType[];
    return getAvailableActivityTypes(activities);
  }, [activities]);

  // Auto-select the first available type if current selection has no data
  const selectedType = useMemo(() => {
    if (availableTypes.length === 0) return activeType;
    if (availableTypes.includes(activeType)) return activeType;
    return availableTypes[0];
  }, [availableTypes, activeType]);

  // Compute records using best_efforts (for Run) or activity buckets (for others)
  const records = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    return computeRecords(
      syncState.bestEfforts,
      activities,
      selectedType,
      period
    );
  }, [syncState.bestEfforts, activities, selectedType, period]);

  // Compute progression data for the chart
  const progressions = useMemo(() => {
    if (!activities || activities.length === 0) return {};
    return computeAllProgressions(
      syncState.bestEfforts,
      activities,
      selectedType,
      period
    );
  }, [syncState.bestEfforts, activities, selectedType, period]);

  const buckets = BUCKETS_BY_TYPE[selectedType];

  // --- Not authenticated ---
  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Records
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
          <p className="font-black text-lg">
            Connect Strava to see your records
          </p>
          <p className="text-sm font-bold text-muted-foreground mt-2">
            Go to Settings to link your Strava account
          </p>
        </div>
      </div>
    );
  }

  // --- Loading activities list ---
  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Records
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // --- No activities ---
  if (!activities || activities.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Records
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
          <p className="font-black text-lg">No activities found</p>
          <p className="text-sm font-bold text-muted-foreground mt-2">
            Record some activities on Strava to see your personal bests here
          </p>
        </div>
      </div>
    );
  }

  const handleTypeChange = (type: ActivityType) => {
    setActiveType(type);
  };

  const handlePeriodChange = (p: TimePeriod) => {
    setPeriod(p);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page title */}
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
        Records
      </h1>

      {/* Sync progress (shown while syncing or when rate limited) */}
      <SyncProgress state={syncState} />

      {/* Filters row — sticky on mobile */}
      <div className="sticky top-0 z-10 bg-background py-2 -mx-3 px-3 md:static md:mx-0 md:px-0 md:py-0">
        <div className="flex flex-row items-center gap-3 md:gap-4 flex-wrap md:justify-between">
          <ActivityTypeFilter
            availableTypes={availableTypes}
            value={selectedType}
            onChange={handleTypeChange}
          />
          <TimePeriodSelector value={period} onChange={handlePeriodChange} />
        </div>
      </div>

      {/* Record cards grid — always 2 cols on mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {records.map((record, idx) => (
          <RecordCard
            key={buckets[idx].key}
            record={record}
            bucket={buckets[idx]}
            activityType={selectedType}
          />
        ))}
      </div>

      {/* Pace progression chart — collapsible on mobile */}
      <CollapsibleSection
        title="Pace Progression"
        subtitle="Historical pace trends by distance"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        <PaceProgressionChart
          progressions={progressions}
          activityType={selectedType}
          embedded
        />
      </CollapsibleSection>
    </div>
  );
};

export default Records;
