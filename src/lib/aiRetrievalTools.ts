// ============================================================
// AI Retrieval Tools — Server-side tools the LLM calls on demand
// ============================================================
//
// Factory function that creates fine-grained retrieval tools
// bound to a specific athleteId. All tools query Neon directly
// and return compact text summaries for the LLM.

import {z} from 'zod';
import {tool} from 'ai';
import {db} from '@/db';
import {
  activities as activitiesTable,
  activityDetails as activityDetailsTable,
  activityLabels as activityLabelsTable,
  userSettings,
  zoneBreakdowns as zoneBreakdownsTable,
  athleteGear,
  trainingBlocks,
  weeklyPlans,
  weeklyZoneRollups,
} from '@/db/schema';
import {eq, desc, and, inArray, isNull} from 'drizzle-orm';
import type {ActivitySummary, UserSettings} from './activityModel';
import {formatPace, formatDuration, ZONE_NAMES} from './activityModel';
import {calcFitnessData, calcACWRData} from '@/utils/trainingLoad';
import type {
  StravaDetailedActivity,
  StravaSummaryActivity,
  StravaBestEffort,
  StravaSplit,
  StravaLap,
} from './strava';
import {safeTransformActivity} from './strava';
import {
  classifyWorkout,
  formatLabelForAI,
  type WorkoutLabel,
} from './workoutLabel';
import {
  addDaysIso,
  getCurrentMondayInTimeZone,
  getMondayIsoForDate,
} from './weekTime';

// ----- Helpers -----

/** Parse a Neon activity row's JSONB `data` column into an ActivitySummary.
 *  The `data` column stores raw Strava API payloads, so we reuse
 *  `transformActivity` which handles field-name mapping and unit conversions
 *  (meters→km, moving_time→duration, average_heartrate→avgHr, etc.).
 */
const parseActivityRow = (row: {
  data: unknown;
  date: string;
}): ActivitySummary | null => {
  const parsed = safeTransformActivity(row.data);
  if (!parsed) return null;
  return parsed;
};

/** Get user settings from Neon for a given athlete. */
const fetchSettings = async (
  athleteId: number,
): Promise<typeof userSettings.$inferSelect | null> => {
  try {
    const rows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.athleteId, athleteId));
    return rows[0] ?? null;
  } catch {
    return null;
  }
};

/** Get all activities from Neon, sorted by date descending. */
const fetchActivities = async (athleteId: number): Promise<ActivitySummary[]> => {
  try {
    const rows = await db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.athleteId, athleteId))
      .orderBy(desc(activitiesTable.date));
    return rows
      .map(parseActivityRow)
      .filter((activity): activity is ActivitySummary => activity !== null);
  } catch {
    return [];
  }
};

/** Activity with extra raw fields not in ActivitySummary. */
type ActivityWithRaw = ActivitySummary & {elapsedTime: number};

/** Get all activities with extra raw Strava fields (elapsed_time). */
const fetchActivitiesWithRaw = async (
  athleteId: number,
): Promise<ActivityWithRaw[]> => {
  try {
    const rows = await db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.athleteId, athleteId))
      .orderBy(desc(activitiesTable.date));
    return rows
      .map((row) => {
        const raw = row.data as StravaSummaryActivity;
        const parsed = safeTransformActivity(raw);
        if (!parsed) return null;
        const elapsedTime =
          typeof raw?.elapsed_time === 'number' && Number.isFinite(raw.elapsed_time)
            ? raw.elapsed_time
            : parsed.duration;
        return {...parsed, elapsedTime};
      })
      .filter((activity): activity is ActivityWithRaw => activity !== null);
  } catch {
    return [];
  }
};

/** Get week start (Monday) for a date string. */
const getWeekStart = (dateStr: string): string => {
  return getMondayIsoForDate(dateStr);
};

/** Filter activities to a time window. */
const filterByWeeks = (
  acts: ActivitySummary[],
  weeks: number,
  offsetWeeks = 0,
): ActivitySummary[] => {
  const now = new Date();
  const end = new Date(now.getTime() - offsetWeeks * 7 * 86400000);
  const start = new Date(end.getTime() - weeks * 7 * 86400000);
  return acts.filter((a) => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });
};

// ----- Label helpers -----

/**
 * Fetch or compute workout labels for a set of activity IDs.
 * First checks the Neon activity_labels table; for any missing IDs,
 * fetches the detailed activity, runs the classifier, and stores the result.
 */
const fetchOrComputeLabels = async (
  athleteId: number,
  activityIds: number[],
  zones: UserSettings['zones'],
): Promise<Map<number, WorkoutLabel>> => {
  const result = new Map<number, WorkoutLabel>();
  if (activityIds.length === 0) return result;

  // 1. Fetch existing labels from Neon
  try {
    const existing = await db
      .select()
      .from(activityLabelsTable)
      .where(
        and(
          eq(activityLabelsTable.athleteId, athleteId),
          inArray(activityLabelsTable.id, activityIds),
        ),
      );

    for (const row of existing) {
      result.set(row.id, row.data as WorkoutLabel);
    }
  } catch {
    // If labels table doesn't exist yet, continue to compute
  }

  // 2. Find IDs that need labels computed
  const missingIds = activityIds.filter((id) => !result.has(id));
  if (missingIds.length === 0) return result;

  // 3. Fetch activity details for missing IDs
  try {
    const details = await db
      .select()
      .from(activityDetailsTable)
      .where(
        and(
          eq(activityDetailsTable.athleteId, athleteId),
          inArray(activityDetailsTable.id, missingIds),
        ),
      );

    const newLabels: Array<{
      id: number;
      athleteId: number;
      data: WorkoutLabel;
      computedAt: number;
    }> = [];

    for (const row of details) {
      const detail = row.data as StravaDetailedActivity;
      const label = classifyWorkout(detail, zones);
      if (label) {
        result.set(row.id, label);
        newLabels.push({
          id: row.id,
          athleteId,
          data: label,
          computedAt: Date.now(),
        });
      }
    }

    // 4. Store computed labels in Neon (fire-and-forget)
    if (newLabels.length > 0) {
      db.insert(activityLabelsTable)
        .values(newLabels)
        .onConflictDoNothing()
        .catch(() => {});
    }
  } catch {
    // Activity details may not exist for all IDs — that's fine
  }

  return result;
};

// ----- Tool factory -----

/**
 * Creates all retrieval tools bound to a specific athleteId.
 * Returns a tool map compatible with the Vercel AI SDK `tools` parameter.
 */
type RetrievalToolsOptions = {
  requestCache?: Map<string, Promise<unknown>>;
  onCacheEvent?: (event: 'hit' | 'miss', key: string) => void;
};

export const createRetrievalTools = (
  athleteId: number,
  options: RetrievalToolsOptions = {},
) => {
  const requestCache = options.requestCache ?? new Map<string, Promise<unknown>>();
  const onCacheEvent = options.onCacheEvent;

  const memoize = <T>(key: string, loader: () => Promise<T>): Promise<T> => {
    const cached = requestCache.get(key);
    if (cached) {
      onCacheEvent?.('hit', key);
      return cached as Promise<T>;
    }
    onCacheEvent?.('miss', key);
    const next = loader().catch((error) => {
      requestCache.delete(key);
      throw error;
    });
    requestCache.set(key, next as Promise<unknown>);
    return next;
  };

  const fetchSettingsCached = () =>
    memoize(`settings:${athleteId}`, () => fetchSettings(athleteId));
  const fetchActivitiesCached = () =>
    memoize(`activities:${athleteId}`, () => fetchActivities(athleteId));
  const fetchActivitiesWithRawCached = () =>
    memoize(`activities-with-raw:${athleteId}`, () =>
      fetchActivitiesWithRaw(athleteId),
    );
  const fetchActivityDetailCached = (activityId: number) =>
    memoize(`activity-detail:${athleteId}:${activityId}`, async () => {
      const detailRows = await db
        .select()
        .from(activityDetailsTable)
        .where(
          and(
            eq(activityDetailsTable.id, activityId),
            eq(activityDetailsTable.athleteId, athleteId),
          ),
        )
        .limit(1);
      return detailRows[0] ?? null;
    });

  return {
  // ---- 1. Training Goal ----
  getTrainingGoal: tool({
    description:
      "Get the athlete's stated training goal (e.g. race target, mileage goal).",
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await fetchSettingsCached();
      return {goal: settings?.goal ?? 'No training goal set.'};
    },
  }),

  // ---- 2. Injuries ----
  getInjuries: tool({
    description:
      "Get the athlete's current reported injuries with notes. Always check before prescribing workouts.",
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await fetchSettingsCached();
      const injuries = (settings?.injuries ?? []) as Array<{
        name: string;
        notes?: string;
      }>;
      if (injuries.length === 0) return {injuries: 'No injuries reported.'};
      const lines = injuries.map(
        (i) => `- ${i.name}${i.notes ? `: ${i.notes}` : ''}`,
      );
      return {injuries: lines.join('\n')};
    },
  }),

  // ---- 3. Dietary Info ----
  getDietaryInfo: tool({
    description:
      "Get the athlete's allergies and food preferences. CRITICAL for nutritionist — always check before suggesting meals.",
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await fetchSettingsCached();
      const allergies = (settings?.allergies ?? []) as string[];
      const prefs = settings?.foodPreferences ?? '';
      const lines: string[] = [];
      if (allergies.length > 0) {
        lines.push(`Allergies: ${allergies.join(', ')}`);
      } else {
        lines.push('No allergies reported.');
      }
      if (prefs) {
        lines.push(`Preferences: ${prefs}`);
      }
      return {dietary: lines.join('\n')};
    },
  }),

  // ---- 4. Training Summary ----
  getTrainingSummary: tool({
    description:
      'Get aggregate training stats for the last N weeks: total runs, distance, duration, avg pace, avg HR, elevation, volume trend, workout type distribution, HR zone time, and longest run.',
    inputSchema: z.object({
      weeks: z
        .number()
        .optional()
        .describe('Number of weeks to summarize. Default 4.'),
    }),
    execute: async ({weeks = 4}: {weeks?: number}) => {
      const allActivities = await fetchActivitiesCached();
      const recent = filterByWeeks(allActivities, weeks);
      const prior = filterByWeeks(allActivities, weeks, weeks);

      const totalRuns = recent.length;
      const totalDist = recent.reduce((s, a) => s + a.distance, 0);
      const totalDur = recent.reduce((s, a) => s + a.duration, 0);
      const totalElev = recent.reduce((s, a) => s + a.elevationGain, 0);
      const avgPace = totalDist > 0 ? totalDur / 60 / totalDist : 0;
      const hrActs = recent.filter((a) => a.avgHr > 0);
      const avgHr =
        hrActs.length > 0
          ? Math.round(
              hrActs.reduce((s, a) => s + a.avgHr, 0) / hrActs.length,
            )
          : 0;

      // Longest run
      let longestDist = 0;
      let longestDate = '';
      for (const a of recent) {
        if (a.distance > longestDist) {
          longestDist = a.distance;
          longestDate = a.date;
        }
      }

      const priorDist = prior.reduce((s, a) => s + a.distance, 0);
      const volumeTrend =
        priorDist > 0 ? ((totalDist - priorDist) / priorDist) * 100 : 0;
      const trendSign = volumeTrend >= 0 ? '+' : '';

      // Workout type distribution from labels
      const settings = await fetchSettingsCached();
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      const activityIds = recent.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(athleteId, activityIds, zones)
        : new Map<number, WorkoutLabel>();

      const typeCounts = new Map<string, number>();
      for (const a of recent) {
        const label = labels.get(Number(a.id));
        const cat = label?.category ?? 'unknown';
        typeCounts.set(cat, (typeCounts.get(cat) ?? 0) + 1);
      }
      const workoutMix = Array.from(typeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(
          ([cat, count]) =>
            `${cat} ${Math.round((count / totalRuns) * 100)}%`,
        )
        .join(', ');

      // HR Zone time distribution
      const zoneTotals: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
      };
      let totalZoneTime = 0;

      if (activityIds.length > 0) {
        try {
          const breakdowns = await db
            .select()
            .from(zoneBreakdownsTable)
            .where(eq(zoneBreakdownsTable.athleteId, athleteId))
            .catch(
              () => [] as Array<typeof zoneBreakdownsTable.$inferSelect>,
            );
          const idSet = new Set(activityIds);
          const matching = (breakdowns ?? []).filter((b) =>
            idSet.has(b.activityId),
          );
          for (const b of matching) {
            const zoneData = b.zones as Record<
              string,
              {time: number; distance: number}
            >;
            for (const [zoneNum, data] of Object.entries(zoneData)) {
              const zn = Number(zoneNum);
              if (zn >= 1 && zn <= 6 && data?.time) {
                zoneTotals[zn] += data.time;
                totalZoneTime += data.time;
              }
            }
          }
        } catch {
          // Zone data not available
        }
      }

      const summaryLines = [
        `Training Summary (Last ${weeks} Weeks)`,
        `- Runs: ${totalRuns} | Distance: ${totalDist.toFixed(1)} km | Time: ${formatDuration(totalDur)}`,
        `- Avg: ${(totalRuns / weeks).toFixed(1)} runs/week, ${(totalDist / weeks).toFixed(1)} km/week, ${formatPace(avgPace)}/km pace`,
        `- Avg HR: ${avgHr} bpm | Elevation: +${totalElev}m`,
        `- Volume trend: ${trendSign}${volumeTrend.toFixed(0)}% vs prior ${weeks} weeks`,
      ];

      if (longestDist > 0) {
        summaryLines.push(
          `- Longest run: ${longestDist.toFixed(1)} km (${longestDate})`,
        );
      }

      if (totalRuns > 0) {
        summaryLines.push(`- Workout mix: ${workoutMix}`);
      }

      if (totalZoneTime > 0) {
        const zoneStr = [1, 2, 3, 4, 5, 6]
          .map(
            (zn) =>
              `Z${zn} ${((zoneTotals[zn] / totalZoneTime) * 100).toFixed(0)}%`,
          )
          .join(' | ');
        summaryLines.push(`- HR Zone time: ${zoneStr}`);

        const aerobic = zoneTotals[1] + zoneTotals[2];
        const threshold = zoneTotals[4] + zoneTotals[5] + zoneTotals[6];
        summaryLines.push(
          `- Aerobic (Z1-Z2): ${((aerobic / totalZoneTime) * 100).toFixed(0)}% | Threshold+ (Z4-Z6): ${((threshold / totalZoneTime) * 100).toFixed(0)}%`,
        );
      }

      return {
        summary: summaryLines.join('\n'),
      };
    },
  }),

  // ---- 5. Weekly Breakdown ----
  getWeeklyBreakdown: tool({
    description:
      'Get per-week training stats (runs, distance, pace, avg HR, elevation, time, workout type mix, longest run) for the last N weeks.',
    inputSchema: z.object({
      weeks: z.number().optional().describe('Number of weeks. Default 4.'),
    }),
    execute: async ({weeks = 4}: {weeks?: number}) => {
      const allActivities = await fetchActivitiesCached();
      const recent = filterByWeeks(allActivities, weeks);

      // Fetch workout labels for all recent activities
      const settings = await fetchSettingsCached();
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      const allIds = recent.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(athleteId, allIds, zones)
        : new Map<number, WorkoutLabel>();

      const weekMap = new Map<string, ActivitySummary[]>();
      for (const a of recent) {
        const ws = getWeekStart(a.date);
        const existing = weekMap.get(ws) ?? [];
        existing.push(a);
        weekMap.set(ws, existing);
      }

      const lines = ['Weekly Breakdown'];
      const sorted = Array.from(weekMap.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      for (const [weekStart, acts] of sorted) {
        const dist = acts.reduce((s, a) => s + a.distance, 0);
        const dur = acts.reduce((s, a) => s + a.duration, 0);
        const elev = acts.reduce((s, a) => s + a.elevationGain, 0);
        const avgPace = dist > 0 ? dur / 60 / dist : 0;
        const hrActs = acts.filter((a) => a.avgHr > 0);
        const avgHr =
          hrActs.length > 0
            ? Math.round(
                hrActs.reduce((s, a) => s + a.avgHr, 0) / hrActs.length,
              )
            : 0;
        const longest = Math.max(...acts.map((a) => a.distance));

        // Workout type mix from labels
        const typeCounts = new Map<string, number>();
        for (const a of acts) {
          const label = labels.get(Number(a.id));
          const cat = label?.category ?? 'unknown';
          typeCounts.set(cat, (typeCounts.get(cat) ?? 0) + 1);
        }
        const typeMix = Array.from(typeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => `${cat} x${count}`)
          .join(', ');

        lines.push(
          `- Week of ${weekStart}: ${acts.length} runs, ${dist.toFixed(1)} km, ${formatPace(avgPace)}/km, avg HR ${avgHr}, elev +${elev}m, ${formatDuration(dur)}`,
        );
        lines.push(`  Types: ${typeMix} | Longest: ${longest.toFixed(1)} km`);
      }

      return {breakdown: lines.join('\n')};
    },
  }),

  // ---- 6. Zone Distribution ----
  getZoneDistribution: tool({
    description:
      'Get heart rate zone distribution (time percentages) from recent training.',
    inputSchema: z.object({
      weeks: z
        .number()
        .optional()
        .describe('Number of weeks to aggregate. Default 4.'),
    }),
    execute: async ({weeks = 4}: {weeks?: number}) => {
      // Get recent activity IDs
      const allActivities = await fetchActivitiesCached();
      const recent = filterByWeeks(allActivities, weeks);
      const activityIds = recent.map((a) => Number(a.id));

      if (activityIds.length === 0) {
        return {zones: 'No activities found in the last ' + weeks + ' weeks.'};
      }

      // Prefer precomputed weekly rollups when available.
      const recentWeekStarts = Array.from(
        new Set(recent.map((activity) => getWeekStart(activity.date))),
      );
      const zoneTimes: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
      };
      const zoneDists: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
      };
      let totalTime = 0;
      let usedPrecomputed = false;

      if (recentWeekStarts.length > 0) {
        const rollups = await db
          .select()
          .from(weeklyZoneRollups)
          .where(
            and(
              eq(weeklyZoneRollups.athleteId, athleteId),
              inArray(weeklyZoneRollups.weekStart, recentWeekStarts),
            ),
          )
          .catch(() => [] as Array<typeof weeklyZoneRollups.$inferSelect>);
        if (rollups.length > 0) {
          for (const rollup of rollups) {
            const zones = rollup.data as Record<string, {time: number; distance: number}>;
            for (const [zoneNum, data] of Object.entries(zones)) {
              const zn = Number(zoneNum);
              if (zn >= 1 && zn <= 6 && data?.time) {
                zoneTimes[zn] += data.time;
                zoneDists[zn] += data.distance ?? 0;
                totalTime += data.time;
              }
            }
          }
          usedPrecomputed = totalTime > 0;
        }
      }

      if (!usedPrecomputed) {
        // Fallback: fetch all zone breakdowns from Neon and filter in JS.
        const breakdowns = await db
          .select()
          .from(zoneBreakdownsTable)
          .where(eq(zoneBreakdownsTable.athleteId, athleteId))
          .catch(() => [] as Array<typeof zoneBreakdownsTable.$inferSelect>);
        const idSet = new Set(activityIds);
        const matching = (breakdowns ?? []).filter((b) => idSet.has(b.activityId));
        if (matching.length === 0) {
          return {
            zones: 'No zone breakdown data available for recent activities.',
          };
        }
        for (const b of matching) {
          const zones = b.zones as Record<string, {time: number; distance: number}>;
          for (const [zoneNum, data] of Object.entries(zones)) {
            const zn = Number(zoneNum);
            if (zn >= 1 && zn <= 6 && data?.time) {
              zoneTimes[zn] += data.time;
              zoneDists[zn] += data.distance ?? 0;
              totalTime += data.time;
            }
          }
        }
      }

      if (totalTime === 0) {
        return {zones: 'No zone time data available.'};
      }

      const lines = ['Zone Distribution (Last ' + weeks + ' Weeks)'];
      for (let zn = 1; zn <= 6; zn++) {
        const pct = ((zoneTimes[zn] / totalTime) * 100).toFixed(1);
        const distKm = (zoneDists[zn] / 1000).toFixed(1);
        lines.push(
          `- Z${zn} (${ZONE_NAMES[zn]}): ${pct}% | ${distKm} km`,
        );
      }

      // Aerobic vs threshold+ split
      const aerobic = zoneTimes[1] + zoneTimes[2];
      const threshold = zoneTimes[4] + zoneTimes[5] + zoneTimes[6];
      lines.push(
        `Aerobic (Z1-Z2): ${((aerobic / totalTime) * 100).toFixed(1)}% | Threshold+ (Z4-Z6): ${((threshold / totalTime) * 100).toFixed(1)}%`,
      );

      return {zones: lines.join('\n')};
    },
  }),

  // ---- 7. Fitness Metrics ----
  getFitnessMetrics: tool({
    description:
      'Get current training load metrics: Base Fitness (BF), Load Impact (LI), Intensity Trend (IT), and ACWR injury risk ratio.',
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await fetchSettingsCached();
      if (!settings) {
        return {
          metrics: 'No athlete settings found. Cannot compute fitness metrics.',
        };
      }

      const allActivities = await fetchActivitiesCached();
      const zones = settings.zones as UserSettings['zones'];

      const fitnessResult = calcFitnessData(
        allActivities,
        settings.restingHr,
        settings.maxHr,
        42,
        zones,
      );
      const fitnessData = fitnessResult.data;

      if (fitnessData.length === 0) {
        return {
          metrics: 'Insufficient activity data to compute fitness metrics.',
        };
      }

      const latest = fitnessData[fitnessData.length - 1];
      const acwrData = calcACWRData(fitnessData);
      const latestAcwr =
        acwrData.length > 0 ? acwrData[acwrData.length - 1].acwr : 0;

      // BF trend
      const recentBf = fitnessData.slice(-7);
      let bfTrend = 'stable';
      if (recentBf.length >= 2) {
        const diff = recentBf[recentBf.length - 1].bf - recentBf[0].bf;
        if (diff > 1) bfTrend = 'up';
        else if (diff < -1) bfTrend = 'down';
      }

      // IT interpretation
      const itLabel =
        latest.it > 0 ? 'stimulus' : latest.it < 0 ? 'recovery' : 'balanced';

      // ACWR risk zone
      let acwrRisk = 'sweet spot (0.8-1.3)';
      if (latestAcwr < 0.8) acwrRisk = 'under-trained / detraining';
      else if (latestAcwr > 1.5) acwrRisk = 'HIGH injury risk (>1.5)';
      else if (latestAcwr > 1.3) acwrRisk = 'moderate injury risk (1.3-1.5)';

      return {
        metrics: [
          'Training Metrics (EvoLab)',
          `- Base Fitness (BF): ${latest.bf.toFixed(1)} (trending ${bfTrend})`,
          `- Load Impact (LI): ${latest.li.toFixed(1)}`,
          `- Intensity Trend (IT): ${latest.it.toFixed(1)} (${itLabel})`,
          `- ACWR: ${latestAcwr.toFixed(2)} — ${acwrRisk}`,
        ].join('\n'),
      };
    },
  }),

  // ---- 8. Recent Activities (with workout labels) ----
  getRecentActivities: tool({
    description:
      'Get a list of the most recent activities with IDs, workout labels, distance, duration, elevation, HR (avg/max), and stop time. Use the activity ID with getActivityDetail for per-km splits, deeper analysis, and activity location coordinates.',
    inputSchema: z.object({
      count: z
        .number()
        .optional()
        .describe('Number of activities to return. Default 10.'),
    }),
    execute: async ({count = 10}: {count?: number}) => {
      const allActivities = await fetchActivitiesWithRawCached();
      const recent = allActivities.slice(0, count);

      if (recent.length === 0) {
        return {activities: 'No activities found.'};
      }

      // Fetch athlete zones for label computation
      const settings = await fetchSettingsCached();
      const zones = settings?.zones as UserSettings['zones'] | undefined;

      // Fetch/compute labels for all recent activities
      const activityIds = recent.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(athleteId, activityIds, zones)
        : new Map<number, WorkoutLabel>();

      const lines = [`Recent Activities (Last ${recent.length})`];
      for (const a of recent) {
        const label = labels.get(Number(a.id));
        const hrStr =
          a.avgHr > 0
            ? a.maxHr > 0
              ? `HR ${Math.round(a.avgHr)}/${a.maxHr}`
              : `HR ${Math.round(a.avgHr)}`
            : '';
        const elevStr = a.elevationGain > 0 ? `elev +${a.elevationGain}m` : '';

        // Show elapsed vs moving time only when gap > 2 minutes
        const stopGap = a.elapsedTime - a.duration;
        const timeStr =
          stopGap > 120
            ? `moving ${formatDuration(a.duration)} / elapsed ${formatDuration(a.elapsedTime)}`
            : formatDuration(a.duration);

        const parts = [`[${a.id}] ${a.date}`];
        if (label) {
          parts.push(formatLabelForAI(label));
        } else {
          parts.push(`${a.name} | ${a.type}`);
        }
        parts.push(`${a.distance.toFixed(1)} km`);
        parts.push(timeStr);
        if (elevStr) parts.push(elevStr);
        if (hrStr) parts.push(hrStr);

        lines.push(`- ${parts.join(' | ')}`);
      }

      return {activities: lines.join('\n')};
    },
  }),

  // ---- 9. Gear Status ----
  getGearStatus: tool({
    description:
      'Get shoes with mileage and retired status. Use to recommend shoe rotation or replacement.',
    inputSchema: z.object({}),
    execute: async () => {
      // Athlete gear uses a key-based lookup — try the athleteId as key
      const rows = await db
        .select()
        .from(athleteGear)
        .where(eq(athleteGear.athleteId, athleteId))
        .limit(1);
      const gear = rows[0];

      if (!gear) {
        return {gear: 'No gear data available.'};
      }

      const shoes = (gear.shoes ?? []) as Array<{
        id: string;
        name: string;
        distance: number;
      }>;
      const retiredIds = new Set((gear.retiredGearIds ?? []) as string[]);

      if (shoes.length === 0) {
        return {gear: 'No shoes registered.'};
      }

      const lines = ['Gear (Shoes)'];
      for (const s of shoes) {
        const km = Math.round(s.distance / 1000);
        const status = retiredIds.has(s.id) ? 'RETIRED' : 'active';
        lines.push(`- ${s.name}: ${km} km (${status})`);
      }

      return {gear: lines.join('\n')};
    },
  }),

  // ---- 10. Weekly Plan ----
  getWeeklyPlan: tool({
    description:
      'Get the active unified weekly plan combining running (Coach) and strength/mobility (Physio) sessions. Each day includes both run and physio components.',
    inputSchema: z.object({}),
    execute: async () => {
      const plans = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.athleteId, athleteId),
            eq(weeklyPlans.isActive, true),
          ),
        )
        .orderBy(desc(weeklyPlans.createdAt))
        .limit(1);

      const plan = plans[0];
      if (!plan) {
        return {plan: 'No active weekly plan. The athlete can generate one from the Weekly Plan page.'};
      }

      type SessionShape = {
        day: string;
        date: string;
        run?: {type: string; description: string; targetPace?: string; targetZone?: string; duration?: string; notes?: string};
        physio?: {type: string; exercises: Array<{name: string; sets?: string; reps?: string; tempo?: string; notes?: string}>; duration?: string; notes?: string};
        notes?: string;
      };

      const sessions = plan.sessions as SessionShape[];

      const lines = [
        `Weekly Plan: ${plan.title}`,
        `Week: ${plan.weekStart}`,
        plan.goal ? `Goal: ${plan.goal}` : null,
        plan.summary ? `Summary: ${plan.summary}` : null,
        '',
      ].filter(Boolean) as string[];

      for (const s of sessions) {
        lines.push(`### ${s.day} — ${s.date}`);

        if (s.run) {
          const pz = [s.run.targetPace, s.run.targetZone].filter(Boolean).join(' / ') || '';
          lines.push(`**Run (${s.run.type}):** ${s.run.description}${pz ? ` — ${pz}` : ''}`);
          if (s.run.duration) lines.push(`Duration: ${s.run.duration}`);
          if (s.run.notes) lines.push(`Note: ${s.run.notes}`);
        }

        if (s.physio) {
          lines.push(`**Physio (${s.physio.type}):**`);
          if (s.physio.duration) lines.push(`Duration: ${s.physio.duration}`);
          for (const ex of s.physio.exercises) {
            const parts = [ex.name];
            if (ex.sets && ex.reps) parts.push(`${ex.sets}x${ex.reps}`);
            else if (ex.reps) parts.push(ex.reps);
            if (ex.tempo) parts.push(ex.tempo);
            if (ex.notes) parts.push(`(${ex.notes})`);
            lines.push(`- ${parts.join(' | ')}`);
          }
          if (s.physio.notes) lines.push(`Note: ${s.physio.notes}`);
        }

        if (!s.run && !s.physio) {
          lines.push('Rest day');
          if (s.notes) lines.push(s.notes);
        }

        lines.push('');
      }

      return {plan: lines.join('\n')};
    },
  }),

  // ---- 11. Plan vs Actual Comparison ----
  comparePlanVsActual: tool({
    description:
      'Compare the active weekly plan against actual activities. Matches planned running sessions to real activities by date and compares workout type, pace, and zone. Use proactively at the end of each week or when the athlete asks for a review.',
    inputSchema: z.object({
      weekOffset: z
        .number()
        .optional()
        .describe(
          '0 = current week (Mon-Sun), -1 = last week, etc. Default 0.',
        ),
    }),
    execute: async ({weekOffset = 0}: {weekOffset?: number}) => {
      // 1. Fetch active weekly plan
      const plans = await db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.athleteId, athleteId),
            eq(weeklyPlans.isActive, true),
          ),
        )
        .orderBy(desc(weeklyPlans.createdAt))
        .limit(1);

      const plan = plans[0];
      if (!plan) {
        return {comparison: 'No active weekly plan to compare against.'};
      }

      type UnifiedSessionShape = {
        day: string;
        date: string;
        run?: {type: string; description: string; targetPace?: string; targetZone?: string};
        physio?: unknown;
        notes?: string;
      };

      const unifiedSessions = (plan.sessions ?? []) as UnifiedSessionShape[];

      // Extract running sessions for comparison
      const sessions = unifiedSessions
        .filter((s) => s.run || s.notes)
        .map((s) => ({
          day: s.day,
          date: s.date,
          type: s.run?.type ?? 'rest',
          description: s.run?.description ?? (s.notes || 'Rest'),
          targetPace: s.run?.targetPace,
          targetZone: s.run?.targetZone,
        }));

      // 2. Determine the target week date range (Mon-Sun)
      const baseMonday = getCurrentMondayInTimeZone('UTC');
      const weekStartDate = addDaysIso(baseMonday, weekOffset * 7);
      const weekEndDate = addDaysIso(weekStartDate, 6);

      // 3. Filter planned sessions to this week
      const weekSessions = sessions.filter((s) => {
        if (!s.date) return false;
        return s.date >= weekStartDate && s.date <= weekEndDate;
      });

      // 4. Fetch actual activities in this date range
      const allActivities = await fetchActivitiesCached();
      const weekActivities = allActivities.filter(
        (a) => a.date >= weekStartDate && a.date <= weekEndDate,
      );

      // 5. Get workout labels for actual activities
      const settings = await fetchSettingsCached();
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      const activityIds = weekActivities.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(athleteId, activityIds, zones)
        : new Map<number, WorkoutLabel>();

      // 6. Match by date and build comparison table
      const plannedDates = new Set(weekSessions.map((s) => s.date));
      const actualByDate = new Map<string, typeof weekActivities>();
      for (const a of weekActivities) {
        const existing = actualByDate.get(a.date) ?? [];
        existing.push(a);
        actualByDate.set(a.date, existing);
      }

      const lines = [
        `Week Review: ${weekStartDate} to ${weekEndDate}`,
        '',
        '| Date | Planned | Actual | Status |',
        '|------|---------|--------|--------|',
      ];

      let hitCount = 0;
      let missCount = 0;
      let modifiedCount = 0;

      // Process each planned session
      for (const session of weekSessions) {
        const date = session.date!;
        const actuals = actualByDate.get(date) ?? [];

        if (actuals.length === 0) {
          if (session.type === 'rest') {
            lines.push(
              `| ${date} | ${session.type}: ${session.description} | Rest day | Hit |`,
            );
            hitCount++;
          } else {
            lines.push(
              `| ${date} | ${session.type}: ${session.description} | -- | Missed |`,
            );
            missCount++;
          }
          continue;
        }

        // Match the best activity
        const actual = actuals[0];
        const label = labels.get(Number(actual.id));
        const actualStr = label
          ? formatLabelForAI(label)
          : `${actual.name} | ${actual.distance.toFixed(1)}km ${formatPace(actual.avgPace)}/km`;

        // Determine status
        const plannedType = session.type.toLowerCase();
        const actualCategory = label?.category ?? '';
        const typeMatch =
          plannedType === actualCategory ||
          (plannedType === 'easy' && actualCategory === 'recovery') ||
          (plannedType === 'recovery' && actualCategory === 'easy');

        let status: string;
        if (typeMatch) {
          status = 'Hit';
          hitCount++;
        } else if (actuals.length > 0) {
          status = 'Modified';
          modifiedCount++;
        } else {
          status = 'Missed';
          missCount++;
        }

        // Add pace/zone comparison if available
        let paceNote = '';
        if (label && session.targetPace) {
          paceNote = ` (target: ${session.targetPace}, actual: ${formatPace(label.mainWork.avgPace)}/km)`;
        }

        lines.push(
          `| ${date} | ${session.type}: ${session.description} | ${actualStr}${paceNote} | ${status} |`,
        );

        // Remove matched activity from the date's list
        actualByDate.set(
          date,
          actuals.filter((a) => a !== actual),
        );
      }

      // 7. Flag unplanned activities
      let unplannedCount = 0;
      for (const [date, actuals] of actualByDate) {
        for (const a of actuals) {
          if (!plannedDates.has(date)) {
            const label = labels.get(Number(a.id));
            const actualStr = label
              ? formatLabelForAI(label)
              : `${a.name} | ${a.distance.toFixed(1)}km`;
            lines.push(`| ${date} | -- | ${actualStr} | Unplanned |`);
            unplannedCount++;
          }
        }
      }

      // 8. Summary
      const totalPlanned = weekSessions.filter((s) => s.type !== 'rest').length;
      const parts = [];
      if (hitCount > 0)
        parts.push(`${hitCount}/${totalPlanned} planned sessions hit`);
      if (modifiedCount > 0) parts.push(`${modifiedCount} modified`);
      if (missCount > 0) parts.push(`${missCount} missed`);
      if (unplannedCount > 0) parts.push(`${unplannedCount} unplanned`);

      if (weekSessions.length === 0 && weekActivities.length === 0) {
        return {
          comparison:
            'No planned sessions with dates in this week range, and no actual activities found. Make sure the plan includes ISO dates on each session.',
        };
      }

      if (weekSessions.length === 0) {
        lines.splice(
          1,
          0,
          '(No planned sessions have dates in this week range. Showing actual activities only.)',
        );
        for (const a of weekActivities) {
          const label = labels.get(Number(a.id));
          const actualStr = label
            ? formatLabelForAI(label)
            : `${a.name} | ${a.distance.toFixed(1)}km`;
          lines.push(`| ${a.date} | -- | ${actualStr} | No plan |`);
        }
      }

      lines.push('', `Summary: ${parts.join(', ') || 'No data to compare.'}`);

      return {comparison: lines.join('\n')};
    },
  }),

  // ---- 12. Activity Detail (per-km splits, laps, best efforts, workout label, gear) ----
  getActivityDetail: tool({
    description:
      'Get detailed breakdown for a specific activity: per-km splits (pace, HR, elevation), laps, best efforts with PR flags, full workout label phases, gear used, and start/end coordinates when available. Use the activity ID from getRecentActivities.',
    inputSchema: z.object({
      activityId: z
        .number()
        .describe('The activity ID to get details for.'),
    }),
    execute: async ({activityId}: {activityId: number}) => {
      // 1. Fetch the activity detail from Neon
      const detailRow = await fetchActivityDetailCached(activityId);
      if (!detailRow) {
        return {
          detail:
            'No detailed data found for this activity. It may not have been synced yet.',
        };
      }

      const detail = detailRow.data as StravaDetailedActivity;
      const distKm = detail.distance / 1000;
      const avgPace =
        distKm > 0 && detail.moving_time > 0
          ? detail.moving_time / 60 / distKm
          : 0;

      const lines: string[] = [];

      // Header
      lines.push(`Activity Detail: ${detail.name} (${detail.start_date_local.split('T')[0]})`);
      const hrStr = detail.average_heartrate
        ? detail.max_heartrate
          ? `HR ${Math.round(detail.average_heartrate)}/${detail.max_heartrate}`
          : `HR ${Math.round(detail.average_heartrate)}`
        : '';
      lines.push(
        `Distance: ${distKm.toFixed(1)} km | Time: ${formatDuration(detail.moving_time)} | Pace: ${formatPace(avgPace)}/km${hrStr ? ` | ${hrStr}` : ''} | Elev +${Math.round(detail.total_elevation_gain)}m`,
      );

      const hasStartCoords =
        Array.isArray(detail.start_latlng) &&
        detail.start_latlng.length === 2 &&
        typeof detail.start_latlng[0] === 'number' &&
        typeof detail.start_latlng[1] === 'number' &&
        Number.isFinite(detail.start_latlng[0]) &&
        Number.isFinite(detail.start_latlng[1]);
      const hasEndCoords =
        Array.isArray(detail.end_latlng) &&
        detail.end_latlng.length === 2 &&
        typeof detail.end_latlng[0] === 'number' &&
        typeof detail.end_latlng[1] === 'number' &&
        Number.isFinite(detail.end_latlng[0]) &&
        Number.isFinite(detail.end_latlng[1]);
      if (hasStartCoords || hasEndCoords) {
        const locationParts: string[] = [];
        if (hasStartCoords) {
          const [lat, lng] = detail.start_latlng;
          locationParts.push(`Start (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        }
        if (hasEndCoords) {
          const [lat, lng] = detail.end_latlng;
          locationParts.push(`End (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        }
        lines.push(`Location: ${locationParts.join(' | ')}`);
      }

      // Gear
      if (detail.gear?.name) {
        lines.push(`Gear: ${detail.gear.name}`);
      }

      // 2. Workout label (full phases)
      const settings = await fetchSettingsCached();
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      if (zones) {
        const label = classifyWorkout(detail, zones);
        if (label) {
          lines.push('');
          lines.push(`Workout: ${label.summary}`);
          if (label.warmUp) {
            lines.push(
              `- Warm-up: km ${label.warmUp.startKm}-${label.warmUp.endKm}, ${formatPace(label.warmUp.avgPace)}/km, HR ${Math.round(label.warmUp.avgHr)}, Z${label.warmUp.zone}`,
            );
          }
          lines.push(
            `- Main work: km ${label.mainWork.startKm}-${label.mainWork.endKm}, ${formatPace(label.mainWork.avgPace)}/km, HR ${Math.round(label.mainWork.avgHr)}, Z${label.mainWork.zone}`,
          );
          if (label.coolDown) {
            lines.push(
              `- Cool-down: km ${label.coolDown.startKm}-${label.coolDown.endKm}, ${formatPace(label.coolDown.avgPace)}/km, HR ${Math.round(label.coolDown.avgHr)}, Z${label.coolDown.zone}`,
            );
          }
          if (label.intervals) {
            const iv = label.intervals;
            lines.push(
              `- Intervals: ${iv.reps} x ${Math.round(iv.repDistanceM)}m @ ${formatPace(iv.repPace)}/km Z${iv.repZone}, recovery ${formatPace(iv.recoveryPace)}/km`,
            );
          }
        }
      }

      // 3. Per-km splits
      const splits = (detail.splits_metric ?? []) as StravaSplit[];
      if (splits.length > 0) {
        lines.push('');
        lines.push('Per-km Splits:');
        for (const s of splits) {
          const splitPace =
            s.average_speed > 0 ? 1000 / 60 / s.average_speed : 0;
          const splitHr = s.average_heartrate
            ? ` | HR ${Math.round(s.average_heartrate)}`
            : '';
          const splitElev =
            s.elevation_difference !== 0
              ? ` | ${s.elevation_difference > 0 ? '+' : ''}${Math.round(s.elevation_difference)}m`
              : '';
          lines.push(
            `- km ${s.split}: ${formatPace(splitPace)}/km${splitHr}${splitElev}`,
          );
        }
      }

      // 4. Best efforts
      const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];
      if (efforts.length > 0) {
        lines.push('');
        lines.push('Best Efforts:');
        const targetDistances = [
          '400m',
          '1/2 mile',
          '1k',
          '1 mile',
          '2 mile',
          '5k',
          '10k',
          '15k',
          '20k',
          'Half-Marathon',
        ];
        const targetSet = new Set(
          targetDistances.map((d) => d.toLowerCase()),
        );
        const filtered = efforts.filter((e) =>
          targetSet.has(e.name.toLowerCase()),
        );
        for (const e of filtered) {
          const prTag = e.pr_rank === 1 ? ' (PR!)' : '';
          lines.push(
            `- ${e.name}: ${formatDuration(e.elapsed_time)}${prTag}`,
          );
        }
      }

      // 5. Laps (if manual laps exist)
      const laps = (detail.laps ?? []) as StravaLap[];
      if (laps.length > 1) {
        lines.push('');
        lines.push('Laps:');
        for (const lap of laps) {
          const lapDistKm = (lap.distance / 1000).toFixed(1);
          const lapPace =
            lap.average_speed > 0 ? 1000 / 60 / lap.average_speed : 0;
          const lapHr = lap.average_heartrate
            ? ` HR ${Math.round(lap.average_heartrate)}`
            : '';
          const lapCad = lap.average_cadence
            ? ` cad ${Math.round(lap.average_cadence)}`
            : '';
          lines.push(
            `- ${lap.name}: ${lapDistKm}km ${formatPace(lapPace)}/km${lapHr}${lapCad}`,
          );
        }
      }

      return {detail: lines.join('\n')};
    },
  }),

  // ---- 13. Personal Records ----
  getPersonalRecords: tool({
    description:
      "Get the athlete's personal records (PRs) for standard distances: 400m, 1k, 1 mile, 5k, 10k, half-marathon. Use to set realistic pace targets and celebrate achievements.",
    inputSchema: z.object({}),
    execute: async () => {
      // Fetch all activity details to scan best_efforts
      const allDetails = await db
        .select()
        .from(activityDetailsTable)
        .where(eq(activityDetailsTable.athleteId, athleteId))
        .catch(() => [] as Array<typeof activityDetailsTable.$inferSelect>);

      if (!allDetails || allDetails.length === 0) {
        return {records: 'No activity details available to extract PRs.'};
      }

      // Collect fastest effort per distance name from cached best_efforts.
      // Do not rely on Strava pr_rank because cached historical activities
      // may have stale ranks after newer PRs are recorded.
      const prMap = new Map<
        string,
        {time: number; date: string; name: string}
      >();

      for (const row of allDetails) {
        const detail = row.data as StravaDetailedActivity;
        const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];
        for (const e of efforts) {
          const existing = prMap.get(e.name);
          const effortDate = e.start_date_local?.split('T')[0] ?? '';
          // Keep the fastest effort; tie-break with older date for stability.
          if (
            !existing ||
            e.elapsed_time < existing.time ||
            (e.elapsed_time === existing.time &&
              effortDate !== '' &&
              (existing.date === '' || effortDate < existing.date))
          ) {
            prMap.set(e.name, {
              time: e.elapsed_time,
              date: effortDate,
              name: e.name,
            });
          }
        }
      }

      if (prMap.size === 0) {
        return {records: 'No personal records found in activity data.'};
      }

      // Order by standard distances
      const orderedDistances = [
        '400m',
        '1/2 mile',
        '1k',
        '1 mile',
        '2 mile',
        '5k',
        '10k',
        '15k',
        '20k',
        'Half-Marathon',
      ];

      const lines = ['Personal Records'];
      for (const dist of orderedDistances) {
        const pr = prMap.get(dist);
        if (pr) {
          lines.push(
            `- ${dist}: ${formatDuration(pr.time)}${pr.date ? ` (${pr.date})` : ''}`,
          );
        }
      }

      // Include any other PRs not in the standard list
      for (const [name, pr] of prMap) {
        if (!orderedDistances.includes(name)) {
          lines.push(
            `- ${name}: ${formatDuration(pr.time)}${pr.date ? ` (${pr.date})` : ''}`,
          );
        }
      }

      if (lines.length === 1) {
        return {records: 'No personal records found in activity data.'};
      }

      return {records: lines.join('\n')};
    },
  }),

  // ---- 14. Weather Forecast (Open-Meteo — free, no API key) ----
  getWeatherForecast: tool({
    description:
      'Get the weather forecast using Open-Meteo. Optionally pass a city override from chat; otherwise it uses profile city, and if missing falls back to the latest activity coordinates. Returns daily temperature, apparent temperature, humidity, conditions, precipitation, and wind for up to 16 days. Use to adjust hydration and electrolyte recommendations.',
    inputSchema: z.object({
      days: z
        .number()
        .optional()
        .describe('Number of forecast days (1-16). Default 5.'),
      city: z
        .string()
        .optional()
        .describe(
          'Optional city override from chat (e.g., "Vicenza"). If omitted, uses profile city.',
        ),
    }),
    execute: async ({days = 5, city}: {days?: number; city?: string}) => {
      // Resolve city from explicit tool input first, then athlete profile.
      const settings = await fetchSettingsCached();
      const profileCity = (
        settings as Record<string, unknown> | null
      )?.city as string | null;
      const resolvedCity =
        (city ?? '').trim() || (profileCity ?? '').trim() || null;

      try {
        let latitude: number;
        let longitude: number;
        let locationLabel: string;

        if (resolvedCity) {
          // 1a. Geocode city -> lat/lon via Open-Meteo geocoding API
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(resolvedCity)}&count=1&language=en&format=json`;
          const geoRes = await fetch(geoUrl);
          if (!geoRes.ok) {
            return {
              weather: `Geocoding API error (${geoRes.status}). City: "${resolvedCity}" may not be recognized.`,
            };
          }
          const geoData = await geoRes.json();
          const geo = geoData.results?.[0] as
            | {
                name: string;
                latitude: number;
                longitude: number;
                country?: string;
              }
            | undefined;
          if (!geo) {
            return {
              weather: `City "${resolvedCity}" not found. Try a clearer city name or provide coordinates from a recent activity.`,
            };
          }
          latitude = geo.latitude;
          longitude = geo.longitude;
          locationLabel = `${geo.name}${geo.country ? `, ${geo.country}` : ''}`;
        } else {
          // 1b. Fallback: use latest activity coordinates when no city is available.
          const rows = await db
            .select({date: activitiesTable.date, data: activitiesTable.data})
            .from(activitiesTable)
            .where(eq(activitiesTable.athleteId, athleteId))
            .orderBy(desc(activitiesTable.date))
            .limit(20);

          const parseCoords = (
            value: unknown,
          ): {latitude: number; longitude: number} | null => {
            if (!Array.isArray(value) || value.length !== 2) return null;
            const lat = value[0];
            const lon = value[1];
            if (
              typeof lat !== 'number' ||
              typeof lon !== 'number' ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lon) ||
              lat < -90 ||
              lat > 90 ||
              lon < -180 ||
              lon > 180
            ) {
              return null;
            }
            return {latitude: lat, longitude: lon};
          };

          let fallback:
            | {date: string; latitude: number; longitude: number}
            | null = null;
          for (const row of rows) {
            const raw = row.data as Record<string, unknown>;
            const start = parseCoords(raw.start_latlng);
            const end = parseCoords(raw.end_latlng);
            const chosen = start ?? end;
            if (chosen) {
              fallback = {
                date: row.date,
                latitude: chosen.latitude,
                longitude: chosen.longitude,
              };
              break;
            }
          }

          if (!fallback) {
            return {
              weather:
                'No city or activity coordinates available. Ask the athlete for a city, or sync an activity with GPS location data.',
            };
          }

          latitude = fallback.latitude;
          longitude = fallback.longitude;
          locationLabel = `Latest activity area (${fallback.date})`;
        }

        // 2. Fetch daily forecast from Open-Meteo
        const limitedDays = Math.min(Math.max(days, 1), 16);
        const dailyVars = [
          'temperature_2m_max',
          'temperature_2m_min',
          'apparent_temperature_max',
          'apparent_temperature_min',
          'weather_code',
          'precipitation_sum',
          'wind_speed_10m_max',
          'relative_humidity_2m_max',
          'relative_humidity_2m_min',
        ].join(',');

        const forecastUrl =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${latitude}&longitude=${longitude}` +
          `&daily=${dailyVars}` +
          `&wind_speed_unit=ms` +
          `&timezone=auto` +
          `&forecast_days=${limitedDays}`;

        const res = await fetch(forecastUrl);
        if (!res.ok) {
          return {weather: `Open-Meteo API error (${res.status}).`};
        }

        const data = await res.json();
        if (data.error) {
          return {weather: `Open-Meteo error: ${data.reason ?? 'unknown'}`};
        }

        const daily = data.daily as {
          time: string[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          apparent_temperature_max: number[];
          apparent_temperature_min: number[];
          weather_code: number[];
          precipitation_sum: number[];
          wind_speed_10m_max: number[];
          relative_humidity_2m_max: number[];
          relative_humidity_2m_min: number[];
        };

        if (!daily?.time || daily.time.length === 0) {
          return {weather: 'No forecast data available.'};
        }

        // WMO weather code → human label
        const wmoLabel = (code: number): string => {
          const WMO: Record<number, string> = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
            61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain',
            66: 'Light freezing rain', 67: 'Heavy freezing rain',
            71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
            80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
            85: 'Light snow showers', 86: 'Heavy snow showers',
            95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
          };
          return WMO[code] ?? `WMO ${code}`;
        };

        // 3. Build formatted output
        const lines = [
          `Weather Forecast — ${locationLabel} (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
        ];

        for (let i = 0; i < daily.time.length; i++) {
          const date = daily.time[i];
          const tMin = Math.round(daily.temperature_2m_min[i]);
          const tMax = Math.round(daily.temperature_2m_max[i]);
          const feelsMax = Math.round(daily.apparent_temperature_max[i]);
          const condition = wmoLabel(daily.weather_code[i]);
          const humMax = daily.relative_humidity_2m_max[i];
          const wind = daily.wind_speed_10m_max[i];
          const precip = daily.precipitation_sum[i];

          // Hydration flag
          let hydrationNote = '';
          if (tMax >= 25 && humMax >= 70) {
            hydrationNote = ' [HIGH heat+humidity — increase fluids + electrolytes significantly]';
          } else if (tMax >= 25) {
            hydrationNote = ' [WARM — increase fluid intake]';
          } else if (humMax >= 70) {
            hydrationNote = ' [HIGH humidity — extra electrolytes recommended]';
          }

          lines.push(
            `- ${date}: ${tMin}–${tMax}C (feels ${feelsMax}C) | ${condition} | humidity ${humMax}% | wind ${wind.toFixed(1)} m/s | precip ${precip}mm${hydrationNote}`,
          );
        }

        return {weather: lines.join('\n')};
      } catch (err) {
        return {weather: `Failed to fetch weather: ${err instanceof Error ? err.message : 'unknown error'}`};
      }
    },
  }),

  // ---- 13. Training Block ----
  getTrainingBlock: tool({
    description:
      'Get the active periodized training block (macro plan). Shows the goal event, phases, and per-week outlines with volume targets, intensity levels, and key workouts. Also highlights the current week.',
    inputSchema: z.object({}),
    execute: async () => {
      const blocks = await db
        .select()
        .from(trainingBlocks)
        .where(
          and(
            eq(trainingBlocks.athleteId, athleteId),
            eq(trainingBlocks.isActive, true),
            isNull(trainingBlocks.deletedAt),
          ),
        )
        .orderBy(desc(trainingBlocks.createdAt))
        .limit(1);

      const block = blocks[0];
      if (!block) {
        return {block: 'No active training block. The athlete can create one from the Training Block page.'};
      }

      type Phase = {name: string; weekNumbers: number[]; focus: string; volumeDirection: string};
      type Outline = {weekNumber: number; phase: string; weekType: string; volumeTargetKm: number; intensityLevel: string; keyWorkouts: string[]; notes: string};

      const phases = block.phases as Phase[];
      const outlines = block.weekOutlines as Outline[];

      const now = new Date();
      const start = new Date(block.startDate);
      const diffMs = now.getTime() - start.getTime();
      const currentWeek = Math.max(1, Math.min(block.totalWeeks, Math.ceil(diffMs / (7 * 86400000))));
      const currentPhase = phases.find((p) => p.weekNumbers.includes(currentWeek));

      const lines = [
        `Training Block: ${block.goalEvent}`,
        `Goal Date: ${block.goalDate}`,
        `Total Weeks: ${block.totalWeeks} (started ${block.startDate})`,
        `Current Week: ${currentWeek} of ${block.totalWeeks}`,
        currentPhase ? `Current Phase: ${currentPhase.name} — ${currentPhase.focus}` : '',
        `Block ID: ${block.id}`,
        '',
        '## Phases',
      ];

      for (const p of phases) {
        lines.push(`- **${p.name}** (weeks ${p.weekNumbers.join(', ')}): ${p.focus} [volume: ${p.volumeDirection}]`);
      }

      lines.push('', '## Week Outlines');

      for (const o of outlines) {
        const marker = o.weekNumber === currentWeek ? ' ← CURRENT' : o.weekNumber < currentWeek ? ' (past)' : '';
        lines.push(
          `- **Week ${o.weekNumber}** [${o.phase}] ${o.weekType} | ${o.volumeTargetKm}km | ${o.intensityLevel} intensity | workouts: ${o.keyWorkouts.join(', ')}${o.notes ? ` | ${o.notes}` : ''}${marker}`,
        );
      }

      return {block: lines.join('\n')};
    },
  }),
  };
};
