'use client';

import {useState, useEffect, useCallback, useRef} from 'react';
import {db} from '@/lib/db';
import {fetchActivityDetail} from '@/lib/strava';
import type {StravaDetailedActivity, StravaBestEffort, StravaSegmentEffort} from '@/lib/strava';
import type {ActivitySummary} from '@/lib/mockData';

// ----- Constants -----

/** Number of parallel requests per batch */
const BATCH_SIZE = 10;

/** Delay between batches in ms (90s → ~6.7 req/min → ~100 per 15 min) */
const BATCH_DELAY_MS = 90_000;

/** Cooldown when rate-limited (3 minutes) */
const RATE_LIMIT_COOLDOWN_MS = 180_000;

// ----- Types -----

export interface SyncState {
  /** Total number of activities to sync */
  total: number;
  /** Number of activities already synced (cached + freshly fetched) */
  synced: number;
  /** Whether the sync is actively fetching */
  isSyncing: boolean;
  /** Whether we're paused due to rate limiting */
  isRateLimited: boolean;
  /** Seconds until rate limit cooldown ends (0 when not limited) */
  cooldownSeconds: number;
  /** All best efforts collected so far from synced activities */
  bestEfforts: BestEffortWithMeta[];
  /** All segment efforts collected so far from synced activities */
  segmentEfforts: SegmentEffortWithMeta[];
}

export interface BestEffortWithMeta extends StravaBestEffort {
  /** The parent activity's sport_type for filtering */
  activitySportType: string;
  /** The parent activity's start_date_local for time filtering */
  activityDate: string;
  /** The parent activity's name */
  activityName: string;
}

export interface SegmentEffortWithMeta extends StravaSegmentEffort {
  /** The parent activity's ID */
  activityId: number;
  /** The parent activity's sport_type for filtering */
  activitySportType: string;
  /** The parent activity's start_date_local for time filtering */
  activityDate: string;
  /** The parent activity's name */
  activityName: string;
}

// ----- Helpers -----

const extractBestEfforts = (
  detail: StravaDetailedActivity,
): BestEffortWithMeta[] => {
  if (!detail.best_efforts || detail.best_efforts.length === 0) return [];

  return detail.best_efforts.map((effort) => ({
    ...effort,
    activitySportType: detail.sport_type,
    activityDate: detail.start_date_local.split('T')[0],
    activityName: detail.name,
  }));
};

const extractSegmentEfforts = (
  detail: StravaDetailedActivity,
): SegmentEffortWithMeta[] => {
  if (!detail.segment_efforts || detail.segment_efforts.length === 0) return [];

  return detail.segment_efforts.map((effort) => ({
    ...effort,
    activityId: detail.id,
    activitySportType: detail.sport_type,
    activityDate: detail.start_date_local.split('T')[0],
    activityName: detail.name,
  }));
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ----- Hook -----

export const useSyncActivityDetails = (
  activities: ActivitySummary[] | undefined,
  enabled: boolean,
) => {
  const [state, setState] = useState<SyncState>({
    total: 0,
    synced: 0,
    isSyncing: false,
    isRateLimited: false,
    cooldownSeconds: 0,
    bestEfforts: [],
    segmentEfforts: [],
  });

  // Guard: prevent concurrent sync runs
  const isSyncRunningRef = useRef(false);
  const abortRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable ref for activities to avoid re-triggering on reference changes
  const activitiesRef = useRef<ActivitySummary[] | undefined>(activities);
  activitiesRef.current = activities;

  // Main sync function — uses refs, so no dependency on `activities`
  const runSync = useCallback(async () => {
    const currentActivities = activitiesRef.current;
    if (!currentActivities || currentActivities.length === 0 || !enabled)
      return;

    // Prevent duplicate concurrent runs
    if (isSyncRunningRef.current) return;
    isSyncRunningRef.current = true;
    abortRef.current = false;

    const activityIds = currentActivities.map((a) => Number(a.id));
    const total = activityIds.length;

    setState((prev) => ({...prev, total, isSyncing: true}));

    // 1. Check which activities are already cached in IndexedDB
    const cachedIds = new Set<number>();
    const allEfforts: BestEffortWithMeta[] = [];
    const allSegmentEfforts: SegmentEffortWithMeta[] = [];

    const cachedDetails = await db.activityDetails.bulkGet(activityIds);
    for (const cached of cachedDetails) {
      if (cached) {
        cachedIds.add(cached.id);
        allEfforts.push(...extractBestEfforts(cached.data));
        allSegmentEfforts.push(...extractSegmentEfforts(cached.data));
      }
    }

    const uncachedIds = activityIds.filter((id) => !cachedIds.has(id));

    setState((prev) => ({
      ...prev,
      total,
      synced: cachedIds.size,
      bestEfforts: [...allEfforts],
      segmentEfforts: [...allSegmentEfforts],
    }));

    // If everything is cached, we're done
    if (uncachedIds.length === 0) {
      setState((prev) => ({...prev, isSyncing: false}));
      isSyncRunningRef.current = false;
      return;
    }

    // 2. Fetch uncached activities in batches
    let cursor = 0;

    while (cursor < uncachedIds.length) {
      if (abortRef.current) break;

      const batchIds = uncachedIds.slice(cursor, cursor + BATCH_SIZE);

      // Fetch batch in parallel
      const results = await Promise.allSettled(
        batchIds.map(async (id) => {
          const detail = await fetchActivityDetail(id);
          // Cache to IndexedDB immediately on success
          await db.activityDetails.put({
            id,
            data: detail,
            fetchedAt: Date.now(),
          });
          return detail;
        }),
      );

      if (abortRef.current) break;

      // Process results
      let hitRateLimit = false;
      let successCount = 0;

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successCount++;
          allEfforts.push(...extractBestEfforts(result.value));
          allSegmentEfforts.push(...extractSegmentEfforts(result.value));
        } else if (
          result.reason instanceof Error &&
          result.reason.message.includes('429')
        ) {
          hitRateLimit = true;
        }
      }

      cursor += batchIds.length;

      setState((prev) => ({
        ...prev,
        synced: prev.synced + successCount,
        bestEfforts: [...allEfforts],
        segmentEfforts: [...allSegmentEfforts],
      }));

      // If rate limited, pause with countdown then retry failed items
      if (hitRateLimit && cursor < uncachedIds.length) {
        // Rewind cursor for failed requests so they're retried
        const failedCount = batchIds.length - successCount;
        cursor -= failedCount;

        const cooldownSecs = Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000);

        setState((prev) => ({
          ...prev,
          isRateLimited: true,
          cooldownSeconds: cooldownSecs,
        }));

        // Countdown timer
        let remaining = cooldownSecs;
        await new Promise<void>((resolve) => {
          cooldownTimerRef.current = setInterval(() => {
            remaining -= 1;
            setState((prev) => ({...prev, cooldownSeconds: remaining}));
            if (remaining <= 0 || abortRef.current) {
              if (cooldownTimerRef.current) {
                clearInterval(cooldownTimerRef.current);
                cooldownTimerRef.current = null;
              }
              resolve();
            }
          }, 1000);
        });

        setState((prev) => ({
          ...prev,
          isRateLimited: false,
          cooldownSeconds: 0,
        }));

        if (abortRef.current) break;
        continue; // Retry from the adjusted cursor
      }

      // Wait between batches (skip if this was the last batch)
      if (cursor < uncachedIds.length && !abortRef.current) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    setState((prev) => ({
      ...prev,
      isSyncing: false,
      isRateLimited: false,
      cooldownSeconds: 0,
    }));

    isSyncRunningRef.current = false;
  }, [enabled]); // Only depends on `enabled` — activities come from ref

  // Trigger sync once activities are loaded
  // Uses a stable ID string to only re-trigger when the actual list changes
  const activityIdKey = activities?.map((a) => a.id).join(',') ?? '';

  useEffect(() => {
    if (!activities || activities.length === 0 || !enabled) return;

    runSync();

    return () => {
      abortRef.current = true;
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [activityIdKey, enabled, runSync]);

  return state;
};
