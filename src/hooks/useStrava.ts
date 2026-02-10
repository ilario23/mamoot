import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  cachedGetAllActivities,
  cachedGetActivityDetail,
  cachedGetActivityStreams,
  cachedGetAthleteStats,
  cachedGetAthleteZones,
  cachedGetAthleteGear,
  forceRefreshActivities,
  batchGetZoneBreakdowns,
} from '@/lib/stravaCache';
import type {ActivitySummary, StreamPoint} from '@/lib/mockData';
import {fetchStarredSegments, fetchSegmentDetail} from '@/lib/strava';
import {aggregateZoneBreakdowns} from '@/lib/zoneCompute';
import type {AggregatedZoneTotals, ZoneBreakdown} from '@/lib/zoneCompute';
import {useSettings} from '@/contexts/SettingsContext';
import type {
  StravaDetailedActivity,
  StravaAthleteStats,
  StravaAthleteZones,
  StravaStarredSegment,
  StravaSegmentDetail,
  StravaSummaryGear,
} from '@/lib/strava';

// ----- Stale time constants -----
// These are React Query stale times. Since the real persistence is in
// Dexie/IndexedDB, we set long stale times here so React Query almost
// never triggers a background refetch on its own. The Dexie cache layer
// handles freshness checks against the API.

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

/** Fetch all activities, served from IndexedDB cache when fresh */
export const useActivities = () => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities'],
    queryFn: cachedGetAllActivities,
    enabled: isAuthenticated,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

/** Fetch single activity detail — cached forever in IndexedDB */
export const useActivityDetail = (activityId: string | undefined) => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<StravaDetailedActivity>({
    queryKey: ['strava', 'activity', activityId],
    queryFn: () => cachedGetActivityDetail(Number(activityId)),
    enabled: isAuthenticated && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

/** Fetch activity streams — cached forever in IndexedDB */
export const useActivityStreams = (activityId: string | undefined) => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<StreamPoint[]>({
    queryKey: ['strava', 'streams', activityId],
    queryFn: () => cachedGetActivityStreams(Number(activityId)),
    enabled: isAuthenticated && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

/** Fetch athlete stats — refreshed hourly via IndexedDB cache */
export const useAthleteStats = () => {
  const {isAuthenticated, athlete} = useStravaAuth();

  return useQuery<StravaAthleteStats>({
    queryKey: ['strava', 'stats', athlete?.id],
    queryFn: () => cachedGetAthleteStats(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
  });
};

/** Fetch athlete HR zones — refreshed daily via IndexedDB cache */
export const useAthleteZones = () => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<StravaAthleteZones>({
    queryKey: ['strava', 'zones'],
    queryFn: cachedGetAthleteZones,
    enabled: isAuthenticated,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
  });
};

/** Fetch athlete's starred segments — refreshed hourly */
export const useStarredSegments = () => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<StravaStarredSegment[]>({
    queryKey: ['strava', 'starred-segments'],
    queryFn: fetchStarredSegments,
    enabled: isAuthenticated,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

/** Fetch segment detail (includes polyline for map) — cached forever since segments don't change */
export const useSegmentDetail = (segmentId: number | null) => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<StravaSegmentDetail>({
    queryKey: ['strava', 'segment', segmentId],
    queryFn: () => fetchSegmentDetail(segmentId!),
    enabled: isAuthenticated && segmentId !== null,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

/** Fetch athlete's gear (bikes + shoes + retired IDs) — refreshed hourly via IndexedDB cache */
export const useAthleteGear = () => {
  const {isAuthenticated} = useStravaAuth();

  return useQuery<{bikes: StravaSummaryGear[]; shoes: StravaSummaryGear[]; retiredGearIds: string[]}>({
    queryKey: ['strava', 'gear'],
    queryFn: cachedGetAthleteGear,
    enabled: isAuthenticated,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

// ----- Zone Breakdowns (stream-based) -----

interface ZoneBreakdownProgress {
  done: number;
  total: number;
}

interface UseZoneBreakdownsResult {
  data: AggregatedZoneTotals | undefined;
  isLoading: boolean;
  /** Progress of stream fetching (only relevant on first load) */
  progress: ZoneBreakdownProgress;
}

/**
 * Fetches stream-based zone breakdowns for all activities within a time window.
 * On first load this may take a while as streams are fetched from Strava.
 * Once cached, subsequent loads are instant.
 */
export const useZoneBreakdowns = (weeks: number): UseZoneBreakdownsResult => {
  const {isAuthenticated} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities, isLoading: activitiesLoading} = useActivities();

  const [result, setResult] = useState<AggregatedZoneTotals | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<ZoneBreakdownProgress>({done: 0, total: 0});

  // Track the current computation so we can abort stale ones
  const abortRef = useRef(0);

  const handleProgress = useCallback((done: number, total: number) => {
    setProgress({done, total});
  }, []);

  useEffect(() => {
    if (!isAuthenticated || activitiesLoading || !activities) {
      setIsLoading(activitiesLoading);
      return;
    }

    const runId = ++abortRef.current;

    const compute = async () => {
      setIsLoading(true);
      setProgress({done: 0, total: 0});

      const now = new Date();
      const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

      // Filter to activities in range that have HR data
      const filtered = activities.filter((a) => {
        const actDate = new Date(a.date);
        return actDate >= cutoff && a.avgHr > 0;
      });

      if (filtered.length === 0) {
        if (abortRef.current === runId) {
          setResult(undefined);
          setIsLoading(false);
          setProgress({done: 0, total: 0});
        }
        return;
      }

      const activityIds = filtered.map((a) => Number(a.id));

      try {
        const breakdownMap = await batchGetZoneBreakdowns(
          activityIds,
          settings.zones,
          (done, total) => {
            if (abortRef.current === runId) {
              handleProgress(done, total);
            }
          },
        );

        // Only apply if this is still the current computation
        if (abortRef.current !== runId) return;

        const breakdowns = Array.from(breakdownMap.values());
        const aggregated = aggregateZoneBreakdowns(breakdowns);

        setResult(aggregated);
      } catch {
        // On error, clear results
        if (abortRef.current === runId) {
          setResult(undefined);
        }
      } finally {
        if (abortRef.current === runId) {
          setIsLoading(false);
        }
      }
    };

    compute();
  }, [isAuthenticated, activitiesLoading, activities, weeks, settings.zones, handleProgress]);

  return {data: result, isLoading, progress};
};

// ----- Per-Activity Zone Breakdowns (for charts that need per-activity data) -----

interface UsePerActivityZoneBreakdownsResult {
  /** Map of activityId -> ZoneBreakdown (only for activities that succeeded) */
  data: Map<string, ZoneBreakdown> | undefined;
  isLoading: boolean;
  progress: ZoneBreakdownProgress;
}

/**
 * Returns per-activity zone breakdowns (not aggregated) for activities
 * within a time window. Useful for charts that need to group by week/date.
 */
export const usePerActivityZoneBreakdowns = (weeks: number): UsePerActivityZoneBreakdownsResult => {
  const {isAuthenticated} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities, isLoading: activitiesLoading} = useActivities();

  const [result, setResult] = useState<Map<string, ZoneBreakdown> | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<ZoneBreakdownProgress>({done: 0, total: 0});

  const abortRef = useRef(0);

  const handleProgress = useCallback((done: number, total: number) => {
    setProgress({done, total});
  }, []);

  useEffect(() => {
    if (!isAuthenticated || activitiesLoading || !activities) {
      setIsLoading(activitiesLoading);
      return;
    }

    const runId = ++abortRef.current;

    const compute = async () => {
      setIsLoading(true);
      setProgress({done: 0, total: 0});

      const now = new Date();
      const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

      const filtered = activities.filter((a) => {
        const actDate = new Date(a.date);
        return actDate >= cutoff && a.avgHr > 0;
      });

      if (filtered.length === 0) {
        if (abortRef.current === runId) {
          setResult(new Map());
          setIsLoading(false);
          setProgress({done: 0, total: 0});
        }
        return;
      }

      const activityIds = filtered.map((a) => Number(a.id));

      try {
        const breakdownMap = await batchGetZoneBreakdowns(
          activityIds,
          settings.zones,
          (done, total) => {
            if (abortRef.current === runId) {
              handleProgress(done, total);
            }
          },
        );

        if (abortRef.current !== runId) return;

        // Convert numeric keys to string keys to match ActivitySummary.id
        const stringKeyedMap = new Map<string, ZoneBreakdown>();
        for (const [id, breakdown] of breakdownMap) {
          stringKeyedMap.set(String(id), breakdown);
        }

        setResult(stringKeyedMap);
      } catch {
        if (abortRef.current === runId) {
          setResult(undefined);
        }
      } finally {
        if (abortRef.current === runId) {
          setIsLoading(false);
        }
      }
    };

    compute();
  }, [isAuthenticated, activitiesLoading, activities, weeks, settings.zones, handleProgress]);

  return {data: result, isLoading, progress};
};

/** Hook to force-refresh activities from the API, bypassing cache freshness */
export const useForceRefreshActivities = () => {
  const queryClient = useQueryClient();

  const handleForceRefresh = async () => {
    const freshData = await forceRefreshActivities();
    queryClient.setQueryData(['strava', 'activities'], freshData);
  };

  return handleForceRefresh;
};
