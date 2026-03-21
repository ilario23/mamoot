import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  cachedGetAllActivities,
  cachedGetActivitiesPage,
  cachedGetActivityDetail,
  cachedGetActivityStreams,
  cachedGetAthleteStats,
  cachedGetAthleteZones,
  cachedGetAthleteGear,
  cachedCalcFitnessData,
  forceRefreshActivities,
  batchGetZoneBreakdowns,
} from '@/lib/stravaCache';
import type {ActivitySummary, StreamPoint} from '@/lib/activityModel';
import type {FitnessDataPoint, AdvancedMetricsDataPoint} from '@/utils/trainingLoad';
import {calcAdvancedMetricsData} from '@/utils/trainingLoad';
import {fetchStarredSegments, fetchSegmentDetail} from '@/lib/strava';
import {aggregateZoneBreakdowns, hashZoneSettings} from '@/lib/zoneCompute';
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
// React Query provides in-memory caching for the browser session.
// The Neon cache layer handles persistent storage and freshness
// checks against the Strava API.

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

const getDashboardAfterDate = (): string => {
  const cutoff = new Date();
  // Keep ~13 months for dashboard trends while reducing payload size.
  cutoff.setDate(cutoff.getDate() - 400);
  return cutoff.toISOString().slice(0, 10);
};

/** Fetch all activities, served from Neon cache when fresh */
export const useActivities = () => {
  const {isAuthenticated, athlete} = useStravaAuth();

  return useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities', athlete?.id],
    queryFn: () => cachedGetAllActivities(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

/** Dashboard-optimized activity query (rolling window only). */
export const useDashboardActivities = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const queryClient = useQueryClient();
  const afterDate = getDashboardAfterDate();

  return useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities', 'dashboard', athlete?.id, afterDate],
    queryFn: () =>
      cachedGetAllActivities(athlete!.id, afterDate, {
        staleWhileRevalidate: true,
        onBackgroundSyncComplete: () => {
          queryClient.invalidateQueries({
            queryKey: ['strava', 'activities'],
          });
        },
      }),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

/**
 * Fast initial load for the Activities page: fetches first `pageSize`
 * activities from Neon immediately, while the full dataset loads in
 * parallel via useActivities(). Once full data is available, switches
 * to using it.
 */
export const useActivitiesPaginated = (pageSize = 20) => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const allActivities = useActivities();

  const firstPage = useQuery<ActivitySummary[]>({
    queryKey: ['strava', 'activities-page', athlete?.id, pageSize],
    queryFn: () => cachedGetActivitiesPage(athlete!.id, pageSize),
    enabled: isAuthenticated && !!athlete?.id && !allActivities.data,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });

  return {
    data: allActivities.data ?? firstPage.data,
    isLoading: firstPage.isLoading && allActivities.isLoading,
    isFullyLoaded: !!allActivities.data,
  };
};

/** Fetch single activity detail — cached forever in Neon */
export const useActivityDetail = (activityId: string | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();

  return useQuery<StravaDetailedActivity>({
    queryKey: ['strava', 'activity', athlete?.id, activityId],
    queryFn: () => cachedGetActivityDetail(athlete!.id, Number(activityId)),
    enabled: isAuthenticated && !!athlete?.id && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

/** Fetch activity streams — cached forever in Neon */
export const useActivityStreams = (activityId: string | undefined) => {
  const {isAuthenticated, athlete} = useStravaAuth();

  return useQuery<StreamPoint[]>({
    queryKey: ['strava', 'streams', athlete?.id, activityId],
    queryFn: () => cachedGetActivityStreams(athlete!.id, Number(activityId)),
    enabled: isAuthenticated && !!athlete?.id && !!activityId,
    staleTime: Infinity,
    gcTime: ONE_DAY,
  });
};

/** Fetch athlete stats — refreshed hourly via Neon cache */
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

/** Fetch athlete HR zones — refreshed daily via Neon cache */
export const useAthleteZones = () => {
  const {isAuthenticated, athlete} = useStravaAuth();

  return useQuery<StravaAthleteZones>({
    queryKey: ['strava', 'zones', athlete?.id],
    queryFn: () => cachedGetAthleteZones(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
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

/** Fetch athlete's gear (bikes + shoes + retired IDs) — refreshed hourly via Neon cache */
export const useAthleteGear = () => {
  const {isAuthenticated, athlete} = useStravaAuth();

  return useQuery<{
    bikes: StravaSummaryGear[];
    shoes: StravaSummaryGear[];
    retiredGearIds: string[];
  }>({
    queryKey: ['strava', 'gear', athlete?.id],
    queryFn: () => cachedGetAthleteGear(athlete!.id),
    enabled: isAuthenticated && !!athlete?.id,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

// ----- Fitness Data (cached, 365-day window) -----

/**
 * Returns the full 365-day fitness dataset (BF/LI/IT) backed by the
 * Neon dashboard cache. On first load it computes from scratch; after
 * that it incrementally appends new days. Settings changes trigger a
 * full recompute.
 *
 * Components should slice the returned array by their own `daysBack`.
 */
export const useFitnessData = () => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities} = useDashboardActivities();

  return useQuery<FitnessDataPoint[]>({
    queryKey: ['dashboard', 'fitness', athlete?.id],
    queryFn: () => cachedCalcFitnessData(athlete!.id, activities!, settings),
    enabled:
      isAuthenticated && !!athlete?.id && !!activities && activities.length > 0,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
  });
};

/** Derived hybrid metrics (CTL/ATL/TSB + ramp/monotony/strain + performance proxies). */
export const useAdvancedMetricsData = (): AdvancedMetricsDataPoint[] => {
  const {data: fitnessData} = useFitnessData();
  const {data: activities} = useDashboardActivities();

  return useMemo(() => {
    if (!fitnessData || fitnessData.length === 0 || !activities) return [];
    return calcAdvancedMetricsData(fitnessData, activities);
  }, [fitnessData, activities]);
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
 * Fetches stream-based zone breakdowns for all activities within a time window,
 * returning aggregated totals. Derives from usePerActivityZoneBreakdowns so
 * that when both hooks use the same `weeks` value, the underlying batch fetch
 * is shared (no duplicate work).
 */
export const useZoneBreakdowns = (weeks: number): UseZoneBreakdownsResult => {
  const {data: breakdownMap, isLoading, progress} =
    usePerActivityZoneBreakdowns(weeks);

  const aggregated = useMemo(() => {
    if (!breakdownMap || breakdownMap.size === 0) return undefined;
    const breakdowns = Array.from(breakdownMap.values());
    return aggregateZoneBreakdowns(breakdowns);
  }, [breakdownMap]);

  return {data: aggregated, isLoading, progress};
};

// ----- Per-Activity Zone Breakdowns (for charts that need per-activity data) -----

// Module-level progress store for zone breakdown fetches.
// Updated from the React Query queryFn, read by components via useZoneProgressSubscription.
const _zoneProgress = new Map<string, ZoneBreakdownProgress>();
const _zoneListeners = new Set<() => void>();

const setZoneProgress = (key: string, done: number, total: number) => {
  _zoneProgress.set(key, {done, total});
  _zoneListeners.forEach((fn) => fn());
};

const useZoneProgressSubscription = (
  key: string,
): ZoneBreakdownProgress => {
  const [progress, setProgress] = useState<ZoneBreakdownProgress>(
    () => _zoneProgress.get(key) ?? {done: 0, total: 0},
  );

  useEffect(() => {
    const handler = () => {
      const current = _zoneProgress.get(key);
      if (current) {
        setProgress((prev) =>
          prev.done === current.done && prev.total === current.total
            ? prev
            : {done: current.done, total: current.total},
        );
      }
    };
    _zoneListeners.add(handler);
    handler();
    return () => {
      _zoneListeners.delete(handler);
    };
  }, [key]);

  return progress;
};

interface UsePerActivityZoneBreakdownsResult {
  /** Map of activityId -> ZoneBreakdown (only for activities that succeeded) */
  data: Map<string, ZoneBreakdown> | undefined;
  isLoading: boolean;
  progress: ZoneBreakdownProgress;
}

/**
 * Returns per-activity zone breakdowns (not aggregated) for activities
 * within a time window. Uses React Query for automatic deduplication —
 * multiple components calling this with the same `weeks` share one fetch.
 */
export const usePerActivityZoneBreakdowns = (
  weeks: number,
): UsePerActivityZoneBreakdownsResult => {
  const {isAuthenticated, athlete} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities, isLoading: activitiesLoading} = useDashboardActivities();

  const zonesHash = useMemo(
    () => hashZoneSettings(settings.zones),
    [settings.zones],
  );

  const progressKey = `${athlete?.id ?? 0}-${weeks}-${zonesHash}`;
  const progress = useZoneProgressSubscription(progressKey);

  const query = useQuery<Map<string, ZoneBreakdown>>({
    queryKey: [
      'dashboard',
      'zone-breakdowns',
      athlete?.id,
      weeks,
      zonesHash,
      activities?.[0]?.id,
    ],
    queryFn: async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

      const filtered = activities!.filter((a) => {
        const actDate = new Date(a.date);
        return actDate >= cutoff && a.avgHr > 0;
      });

      if (filtered.length === 0) return new Map<string, ZoneBreakdown>();

      const activityIds = filtered.map((a) => Number(a.id));

      const breakdownMap = await batchGetZoneBreakdowns(
        athlete!.id,
        activityIds,
        settings.zones,
        (done, total) => setZoneProgress(progressKey, done, total),
      );

      const stringKeyedMap = new Map<string, ZoneBreakdown>();
      for (const [id, breakdown] of breakdownMap) {
        stringKeyedMap.set(String(id), breakdown);
      }
      return stringKeyedMap;
    },
    enabled:
      isAuthenticated &&
      !!athlete?.id &&
      !activitiesLoading &&
      !!activities &&
      activities.length > 0,
    staleTime: ONE_HOUR,
    gcTime: ONE_DAY,
    refetchOnWindowFocus: false,
    structuralSharing: false,
  });

  return {
    data: query.data,
    isLoading: query.isLoading || activitiesLoading,
    progress,
  };
};

/** Hook to force-refresh activities from the API, bypassing cache freshness */
export const useForceRefreshActivities = () => {
  const queryClient = useQueryClient();
  const {athlete} = useStravaAuth();

  const handleForceRefresh = async () => {
    if (!athlete?.id) return;
    const freshData = await forceRefreshActivities(athlete.id);
    queryClient.setQueryData(['strava', 'activities', athlete.id], freshData);
  };

  return handleForceRefresh;
};
