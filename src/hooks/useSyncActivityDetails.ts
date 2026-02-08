"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { fetchActivityDetail } from "@/lib/strava";
import type { StravaDetailedActivity, StravaBestEffort } from "@/lib/strava";
import type { ActivitySummary } from "@/lib/mockData";

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
}

export interface BestEffortWithMeta extends StravaBestEffort {
  /** The parent activity's sport_type for filtering */
  activitySportType: string;
  /** The parent activity's start_date_local for time filtering */
  activityDate: string;
  /** The parent activity's name */
  activityName: string;
}

// ----- Hook -----

export const useSyncActivityDetails = (
  activities: ActivitySummary[] | undefined,
  enabled: boolean
) => {
  const [state, setState] = useState<SyncState>({
    total: 0,
    synced: 0,
    isSyncing: false,
    isRateLimited: false,
    cooldownSeconds: 0,
    bestEfforts: [],
  });

  // Refs to avoid stale closures in the async sync loop
  const abortRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Extract best efforts from a detailed activity
  const extractBestEfforts = useCallback(
    (detail: StravaDetailedActivity): BestEffortWithMeta[] => {
      if (!detail.best_efforts || detail.best_efforts.length === 0) return [];

      return detail.best_efforts.map((effort) => ({
        ...effort,
        activitySportType: detail.sport_type,
        activityDate: detail.start_date_local.split("T")[0],
        activityName: detail.name,
      }));
    },
    []
  );

  // Main sync function
  const runSync = useCallback(async () => {
    if (!activities || activities.length === 0 || !enabled) return;

    abortRef.current = false;
    const activityIds = activities.map((a) => Number(a.id));
    const total = activityIds.length;

    setState((prev) => ({ ...prev, total, isSyncing: true }));

    // 1. Check which activities are already cached
    const cachedIds = new Set<number>();
    const allEfforts: BestEffortWithMeta[] = [];

    const cachedDetails = await db.activityDetails.bulkGet(activityIds);
    for (const cached of cachedDetails) {
      if (cached) {
        cachedIds.add(cached.id);
        allEfforts.push(...extractBestEfforts(cached.data));
      }
    }

    const uncachedIds = activityIds.filter((id) => !cachedIds.has(id));

    setState((prev) => ({
      ...prev,
      synced: cachedIds.size,
      bestEfforts: [...allEfforts],
    }));

    // 2. Fetch uncached activities in batches
    let cursor = 0;

    while (cursor < uncachedIds.length) {
      if (abortRef.current) break;

      const batchIds = uncachedIds.slice(cursor, cursor + BATCH_SIZE);

      // Fetch batch in parallel
      const results = await Promise.allSettled(
        batchIds.map(async (id) => {
          const detail = await fetchActivityDetail(id);
          // Cache immediately
          await db.activityDetails.put({
            id,
            data: detail,
            fetchedAt: Date.now(),
          });
          return detail;
        })
      );

      // Check for rate limiting (429 errors)
      let hitRateLimit = false;
      for (const result of results) {
        if (result.status === "fulfilled") {
          allEfforts.push(...extractBestEfforts(result.value));
        } else if (
          result.reason instanceof Error &&
          result.reason.message.includes("429")
        ) {
          hitRateLimit = true;
        }
      }

      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      cursor += batchIds.length;

      setState((prev) => ({
        ...prev,
        synced: prev.synced + successCount,
        bestEfforts: [...allEfforts],
      }));

      // If rate limited, pause with countdown
      if (hitRateLimit && cursor < uncachedIds.length) {
        // Rewind cursor for failed requests
        const failedCount = batchIds.length - successCount;
        cursor -= failedCount;

        setState((prev) => ({
          ...prev,
          isRateLimited: true,
          cooldownSeconds: Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000),
        }));

        // Start countdown
        let remaining = Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000);
        await new Promise<void>((resolve) => {
          cooldownTimerRef.current = setInterval(() => {
            remaining -= 1;
            setState((prev) => ({ ...prev, cooldownSeconds: remaining }));
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
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    setState((prev) => ({
      ...prev,
      isSyncing: false,
      isRateLimited: false,
      cooldownSeconds: 0,
    }));
  }, [activities, enabled, extractBestEfforts]);

  // Start sync when activities change
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
  }, [activities, enabled, runSync]);

  return state;
};
