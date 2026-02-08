import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {
  cachedGetAllActivities,
  cachedGetActivityDetail,
  cachedGetActivityStreams,
  cachedGetAthleteStats,
  cachedGetAthleteZones,
  forceRefreshActivities,
} from '@/lib/stravaCache';
import type {ActivitySummary, StreamPoint} from '@/lib/mockData';
import type {
  StravaDetailedActivity,
  StravaAthleteStats,
  StravaAthleteZones,
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

/** Hook to force-refresh activities from the API, bypassing cache freshness */
export const useForceRefreshActivities = () => {
  const queryClient = useQueryClient();

  const handleForceRefresh = async () => {
    const freshData = await forceRefreshActivities();
    queryClient.setQueryData(['strava', 'activities'], freshData);
  };

  return handleForceRefresh;
};
