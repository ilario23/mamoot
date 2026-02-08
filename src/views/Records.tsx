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
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          Records
        </h1>
        <div className="border-3 border-foreground p-8 bg-background shadow-neo text-center">
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
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          Records
        </h1>
        <div className="border-3 border-foreground p-8 bg-background shadow-neo flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // --- No activities ---
  if (!activities || activities.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          Records
        </h1>
        <div className="border-3 border-foreground p-8 bg-background shadow-neo text-center">
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
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
        Records
      </h1>

      {/* Sync progress (shown while syncing or when rate limited) */}
      <SyncProgress state={syncState} />

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <ActivityTypeFilter
          availableTypes={availableTypes}
          value={selectedType}
          onChange={handleTypeChange}
        />
        <TimePeriodSelector value={period} onChange={handlePeriodChange} />
      </div>

      {/* Record cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {records.map((record, idx) => (
          <RecordCard
            key={buckets[idx].key}
            record={record}
            bucket={buckets[idx]}
            activityType={selectedType}
          />
        ))}
      </div>

      {/* Pace progression chart */}
      <PaceProgressionChart
        progressions={progressions}
        activityType={selectedType}
      />
    </div>
  );
};

export default Records;
