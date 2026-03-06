'use client';

import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedActivityDetail} from '@/lib/cacheTypes';
import {fetchActivityDetail} from '@/lib/strava';
import {neonGetActivityDetailsBulk, neonSyncActivityDetailsBulk} from '@/lib/neonSync';
import type {StravaDetailedActivity, StravaBestEffort, StravaSegmentEffort} from '@/lib/strava';
import type {ActivitySummary} from '@/lib/activityModel';
import {useStravaAuth} from '@/contexts/StravaAuthContext';

// ----- Constants -----

/** Number of parallel requests per batch */
const BATCH_SIZE = 25;

/** Strava rate limit: 100 requests per 15-minute window */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 100;
/** Safety buffer — stop a few requests short of the hard cap */
const RATE_LIMIT_BUFFER = 5;

/** Minimum gap between batches to avoid hammering the API */
const MIN_BATCH_GAP_MS = 500;

/** Hard cooldown when we actually receive a 429 (fallback) */
const RATE_LIMIT_COOLDOWN_MS = 180_000;

/** Activity types that carry best_efforts / segment_efforts in Strava */
const SYNCABLE_TYPES = new Set(['Run', 'Ride']);

// ----- Sliding-window rate limiter -----

/**
 * Tracks request timestamps within a rolling 15-minute window.
 * Lets us burst at full speed and only pause when approaching the limit.
 */
class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  /** Record `count` requests as made right now */
  record(count: number): void {
    const now = Date.now();
    for (let i = 0; i < count; i++) this.timestamps.push(now);
  }

  /** How many more requests can be made within the current window? */
  available(): number {
    this.prune();
    return Math.max(0, RATE_LIMIT_MAX - RATE_LIMIT_BUFFER - this.timestamps.length);
  }

  /**
   * Wait until `needed` slots are free.
   * Calls `onTick` every second with estimated remaining seconds (0 = done).
   * Respects `shouldAbort` callback to cancel early.
   */
  async waitForSlots(
    needed: number,
    shouldAbort: () => boolean,
    onTick?: (remainingSecs: number) => void,
  ): Promise<void> {
    while (this.available() < needed && !shouldAbort()) {
      this.prune();
      if (this.available() >= needed) break;

      const oldest = this.timestamps[0];
      if (!oldest) break;

      const waitMs = oldest + RATE_LIMIT_WINDOW_MS - Date.now() + 200;
      if (waitMs <= 0) {
        this.prune();
        break;
      }

      onTick?.(Math.ceil(waitMs / 1000));
      // Sleep in 1-second increments so the countdown UI stays responsive
      await sleep(Math.min(waitMs, 1000));
    }
    onTick?.(0);
  }

  private prune(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }
}

/** Module-level instance so the window persists across re-renders / navigations */
const rateLimiter = new SlidingWindowRateLimiter();

// ----- Types -----

export interface SyncState {
  /** Total number of activities to sync */
  total: number;
  /** Number of activities already synced (cached + freshly fetched) */
  synced: number;
  /** Whether the sync is actively fetching from Strava API (not Neon cache) */
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

interface SyncOptions {
  /** How many activities to fetch from Neon in the first batch for fast initial results. */
  initialBatchSize?: number;
}

export const useSyncActivityDetails = (
  activities: ActivitySummary[] | undefined,
  enabled: boolean,
  options: SyncOptions = {},
) => {
  const {initialBatchSize = 50} = options;
  const {athlete} = useStravaAuth();

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
    if (!currentActivities || currentActivities.length === 0 || !enabled || !athlete?.id)
      return;

    // Prevent duplicate concurrent runs
    if (isSyncRunningRef.current) return;
    isSyncRunningRef.current = true;
    abortRef.current = false;

    // Only sync activity types that carry best_efforts / segment_efforts
    // Activities arrive sorted newest-first from useActivities
    const syncableActivities = currentActivities.filter((a) =>
      SYNCABLE_TYPES.has(a.type),
    );
    const activityIds = syncableActivities.map((a) => Number(a.id));
    const total = activityIds.length;

    // 1. Read cached details from Neon in two phases (no progress bar for cache reads)
    const cachedIds = new Set<number>();
    const allEfforts: BestEffortWithMeta[] = [];
    const allSegmentEfforts: SegmentEffortWithMeta[] = [];

    if (activityIds.length > 0 && !abortRef.current) {
      const initialIds = activityIds.slice(0, initialBatchSize);
      const remainingIds = activityIds.slice(initialBatchSize);

      // Phase 1: fetch initial batch (recent activities) — fast, small payload
      const initialDetails = await neonGetActivityDetailsBulk(
        athlete.id,
        initialIds,
      );
      for (const detail of initialDetails) {
        cachedIds.add(detail.id);
        allEfforts.push(...extractBestEfforts(detail.data));
        allSegmentEfforts.push(...extractSegmentEfforts(detail.data));
      }

      // Report initial efforts so record/segment cards can render immediately
      setState((prev) => ({
        ...prev,
        bestEfforts: [...allEfforts],
        segmentEfforts: [...allSegmentEfforts],
      }));

      // Phase 2: fetch remaining activities from Neon
      if (remainingIds.length > 0 && !abortRef.current) {
        const remainingDetails = await neonGetActivityDetailsBulk(
          athlete.id,
          remainingIds,
        );
        for (const detail of remainingDetails) {
          cachedIds.add(detail.id);
          allEfforts.push(...extractBestEfforts(detail.data));
          allSegmentEfforts.push(...extractSegmentEfforts(detail.data));
        }
      }
    }

    const uncachedIds = activityIds.filter((id) => !cachedIds.has(id));

    // Report all Neon-cached efforts
    setState((prev) => ({
      ...prev,
      bestEfforts: [...allEfforts],
      segmentEfforts: [...allSegmentEfforts],
    }));

    // If everything is cached in Neon, we're done — no progress bar needed
    if (uncachedIds.length === 0) {
      isSyncRunningRef.current = false;
      return;
    }

    // 2. Fetch uncached activities from Strava API — show progress bar now
    setState((prev) => ({
      ...prev,
      total: uncachedIds.length,
      synced: 0,
      isSyncing: true,
    }));
    // Fetch remaining uncached activities from Strava API with rate limiting
    let cursor = 0;
    const newlyFetchedRecords: CachedActivityDetail[] = [];

    while (cursor < uncachedIds.length) {
      if (abortRef.current) break;

      // Wait for rate-limit slots if the window is full
      const slotsNeeded = Math.min(BATCH_SIZE, uncachedIds.length - cursor);
      if (rateLimiter.available() < slotsNeeded) {
        setState((prev) => ({...prev, isRateLimited: true}));
        await rateLimiter.waitForSlots(
          slotsNeeded,
          () => abortRef.current,
          (secs) => setState((prev) => ({...prev, cooldownSeconds: secs})),
        );
        setState((prev) => ({
          ...prev,
          isRateLimited: false,
          cooldownSeconds: 0,
        }));
        if (abortRef.current) break;
      }

      // Size this batch to the available slots (may be less than BATCH_SIZE)
      const slotsNow = rateLimiter.available();
      const batchSize = Math.min(BATCH_SIZE, slotsNow, uncachedIds.length - cursor);
      if (batchSize <= 0) continue;

      const batchIds = uncachedIds.slice(cursor, cursor + batchSize);

      // Record requests in the sliding window BEFORE firing them
      rateLimiter.record(batchIds.length);

      // Fetch batch in parallel
      const results = await Promise.allSettled(
        batchIds.map(async (id) => {
          const detail = await fetchActivityDetail(id);
          const now = Date.now();
          const record: CachedActivityDetail = {
            id,
            athleteId: athlete.id,
            data: detail,
            fetchedAt: now,
          };
          // Collect for Neon write-back
          newlyFetchedRecords.push(record);
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
        synced: Math.min(prev.synced + successCount, prev.total),
        bestEfforts: [...allEfforts],
        segmentEfforts: [...allSegmentEfforts],
      }));

      // Fallback: if we hit a 429 despite the sliding window, hard-cooldown
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

      // Small gap between batches to avoid hammering the API
      if (cursor < uncachedIds.length && !abortRef.current) {
        await sleep(MIN_BATCH_GAP_MS);
      }
    }

    // Persist freshly-fetched details to Neon
    await neonSyncActivityDetailsBulk(newlyFetchedRecords);

    setState((prev) => ({
      ...prev,
      isSyncing: false,
      isRateLimited: false,
      cooldownSeconds: 0,
    }));

    isSyncRunningRef.current = false;
  }, [enabled, athlete?.id, initialBatchSize]); // Activities come from ref

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
  }, [activityIdKey, activities, enabled, runSync]);

  return state;
};
