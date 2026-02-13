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
  coachPlans,
  physioPlans,
} from '@/db/schema';
import {eq, desc, and, inArray} from 'drizzle-orm';
import type {ActivitySummary, UserSettings} from './mockData';
import {formatPace, formatDuration, ZONE_NAMES} from './mockData';
import {calcFitnessData, calcACWRData} from '@/utils/trainingLoad';
import type {
  StravaDetailedActivity,
  StravaSummaryActivity,
  StravaBestEffort,
  StravaSplit,
  StravaLap,
} from './strava';
import {transformActivity} from './strava';
import {
  classifyWorkout,
  formatLabelForAI,
  type WorkoutLabel,
} from './workoutLabel';

// ----- Helpers -----

/** Parse a Neon activity row's JSONB `data` column into an ActivitySummary.
 *  The `data` column stores raw Strava API payloads, so we reuse
 *  `transformActivity` which handles field-name mapping and unit conversions
 *  (meters→km, moving_time→duration, average_heartrate→avgHr, etc.).
 */
const parseActivityRow = (row: {
  data: unknown;
  date: string;
}): ActivitySummary => {
  return transformActivity(row.data as StravaSummaryActivity);
};

/** Get user settings from Neon for a given athlete. */
const fetchSettings = async (
  athleteId: number,
): Promise<typeof userSettings.$inferSelect | null> => {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.athleteId, athleteId));
  return rows[0] ?? null;
};

/** Get all activities from Neon, sorted by date descending. */
const fetchActivities = async (): Promise<ActivitySummary[]> => {
  const rows = await db
    .select()
    .from(activitiesTable)
    .orderBy(desc(activitiesTable.date));
  return rows.map(parseActivityRow);
};

/** Activity with extra raw fields not in ActivitySummary. */
type ActivityWithRaw = ActivitySummary & {elapsedTime: number};

/** Get all activities with extra raw Strava fields (elapsed_time). */
const fetchActivitiesWithRaw = async (): Promise<ActivityWithRaw[]> => {
  const rows = await db
    .select()
    .from(activitiesTable)
    .orderBy(desc(activitiesTable.date));
  return rows.map((row) => {
    const raw = row.data as StravaSummaryActivity;
    const parsed = transformActivity(raw);
    return {...parsed, elapsedTime: raw.elapsed_time ?? parsed.duration};
  });
};

/** Get week start (Monday) for a date string. */
const getWeekStart = (dateStr: string): string => {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
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
      .where(inArray(activityLabelsTable.id, activityIds));

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
      .where(inArray(activityDetailsTable.id, missingIds));

    const newLabels: Array<{
      id: number;
      data: WorkoutLabel;
      computedAt: number;
    }> = [];

    for (const row of details) {
      const detail = row.data as StravaDetailedActivity;
      const label = classifyWorkout(detail, zones);
      if (label) {
        result.set(row.id, label);
        newLabels.push({id: row.id, data: label, computedAt: Date.now()});
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
export const createRetrievalTools = (athleteId: number) => ({
  // ---- 1. Training Goal ----
  getTrainingGoal: tool({
    description:
      "Get the athlete's stated training goal (e.g. race target, mileage goal).",
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await fetchSettings(athleteId);
      return {goal: settings?.goal ?? 'No training goal set.'};
    },
  }),

  // ---- 2. Injuries ----
  getInjuries: tool({
    description:
      "Get the athlete's current reported injuries with notes. Always check before prescribing workouts.",
    inputSchema: z.object({}),
    execute: async () => {
      const settings = await fetchSettings(athleteId);
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
      const settings = await fetchSettings(athleteId);
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
      const allActivities = await fetchActivities();
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
      const settings = await fetchSettings(athleteId);
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      const activityIds = recent.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(activityIds, zones)
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
      const allActivities = await fetchActivities();
      const recent = filterByWeeks(allActivities, weeks);

      // Fetch workout labels for all recent activities
      const settings = await fetchSettings(athleteId);
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      const allIds = recent.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(allIds, zones)
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
      const allActivities = await fetchActivities();
      const recent = filterByWeeks(allActivities, weeks);
      const activityIds = recent.map((a) => Number(a.id));

      if (activityIds.length === 0) {
        return {zones: 'No activities found in the last ' + weeks + ' weeks.'};
      }

      // Fetch all zone breakdowns from Neon and filter in JS
      const breakdowns = await db
        .select()
        .from(zoneBreakdownsTable)
        .catch(() => [] as Array<typeof zoneBreakdownsTable.$inferSelect>);

      // Filter to matching activity IDs
      const idSet = new Set(activityIds);
      const matching = (breakdowns ?? []).filter((b) =>
        idSet.has(b.activityId),
      );

      if (matching.length === 0) {
        return {
          zones: 'No zone breakdown data available for recent activities.',
        };
      }

      // Aggregate zone times and distances
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

      for (const b of matching) {
        const zones = b.zones as Record<
          string,
          {time: number; distance: number}
        >;
        for (const [zoneNum, data] of Object.entries(zones)) {
          const zn = Number(zoneNum);
          if (zn >= 1 && zn <= 6 && data?.time) {
            zoneTimes[zn] += data.time;
            zoneDists[zn] += data.distance ?? 0;
            totalTime += data.time;
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
      const settings = await fetchSettings(athleteId);
      if (!settings) {
        return {
          metrics: 'No athlete settings found. Cannot compute fitness metrics.',
        };
      }

      const allActivities = await fetchActivities();
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
      'Get a list of the most recent activities with IDs, workout labels, distance, duration, elevation, HR (avg/max), and stop time. Use the activity ID with getActivityDetail for per-km splits and deeper analysis.',
    inputSchema: z.object({
      count: z
        .number()
        .optional()
        .describe('Number of activities to return. Default 10.'),
    }),
    execute: async ({count = 10}: {count?: number}) => {
      const allActivities = await fetchActivitiesWithRaw();
      const recent = allActivities.slice(0, count);

      if (recent.length === 0) {
        return {activities: 'No activities found.'};
      }

      // Fetch athlete zones for label computation
      const settings = await fetchSettings(athleteId);
      const zones = settings?.zones as UserSettings['zones'] | undefined;

      // Fetch/compute labels for all recent activities
      const activityIds = recent.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(activityIds, zones)
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
      const rows = await db.select().from(athleteGear);
      const gear = rows[0]; // Usually one row per athlete

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

  // ---- 10. Coach Plan ----
  getCoachPlan: tool({
    description:
      'Get the active training plan shared by the Coach persona. Useful for Nutritionist and Physio to align recommendations.',
    inputSchema: z.object({}),
    execute: async () => {
      const plans = await db
        .select()
        .from(coachPlans)
        .where(
          and(
            eq(coachPlans.athleteId, athleteId),
            eq(coachPlans.isActive, true),
          ),
        )
        .orderBy(desc(coachPlans.sharedAt))
        .limit(1);

      const plan = plans[0];
      if (!plan) {
        return {plan: 'No active training plan.'};
      }

      const sessions = plan.sessions as Array<{
        day: string;
        type: string;
        description: string;
        targetPace?: string;
        targetZone?: string;
      }>;

      const lines = [
        `Training Plan: ${plan.title}`,
        plan.goal ? `Goal: ${plan.goal}` : null,
        plan.durationWeeks ? `Duration: ${plan.durationWeeks} weeks` : null,
        '',
        '| Day | Type | Workout | Pace/Zone |',
        '|-----|------|---------|-----------',
      ].filter(Boolean) as string[];

      for (const s of sessions) {
        const pz =
          [s.targetPace, s.targetZone].filter(Boolean).join(' / ') || '—';
        lines.push(`| ${s.day} | ${s.type} | ${s.description} | ${pz} |`);
      }

      // Include full plan content
      if (plan.content) {
        lines.push('', '### Full Plan Details', '', plan.content);
      }

      return {plan: lines.join('\n')};
    },
  }),

  // ---- 10b. Physio Plan ----
  getPhysioPlan: tool({
    description:
      'Get the active strength/mobility plan shared by the Physio persona. Includes training phase, strength sessions per week, and per-day exercises. The Coach uses this to leave room for gym days; the Nutritionist uses it to adjust macros for combined run+strength days.',
    inputSchema: z.object({}),
    execute: async () => {
      const plans = await db
        .select()
        .from(physioPlans)
        .where(
          and(
            eq(physioPlans.athleteId, athleteId),
            eq(physioPlans.isActive, true),
          ),
        )
        .orderBy(desc(physioPlans.sharedAt))
        .limit(1);

      const plan = plans[0];
      if (!plan) {
        return {plan: 'No active physio plan.'};
      }

      const sessions = plan.sessions as Array<{
        day: string;
        date?: string;
        type: string;
        exercises: Array<{
          name: string;
          sets?: string;
          reps?: string;
          tempo?: string;
          notes?: string;
        }>;
        duration?: string;
        notes?: string;
      }>;

      const lines = [
        `Physio Plan: ${plan.title}`,
        plan.phase ? `Phase: ${plan.phase}` : null,
        plan.strengthSessionsPerWeek
          ? `Strength sessions/week: ${plan.strengthSessionsPerWeek}`
          : null,
        plan.summary ? `Summary: ${plan.summary}` : null,
        '',
      ].filter(Boolean) as string[];

      for (const s of sessions) {
        const dateStr = s.date ? ` (${s.date})` : '';
        const durStr = s.duration ? ` — ${s.duration}` : '';
        lines.push(`### ${s.day}${dateStr} — ${s.type}${durStr}`);
        if (s.notes) lines.push(`  Note: ${s.notes}`);
        for (const ex of s.exercises) {
          const parts = [ex.name];
          if (ex.sets && ex.reps) parts.push(`${ex.sets}x${ex.reps}`);
          else if (ex.reps) parts.push(ex.reps);
          if (ex.tempo) parts.push(ex.tempo);
          if (ex.notes) parts.push(`(${ex.notes})`);
          lines.push(`- ${parts.join(' | ')}`);
        }
      }

      // Include full plan content
      if (plan.content) {
        lines.push('', '### Full Plan Details', '', plan.content);
      }

      return {plan: lines.join('\n')};
    },
  }),

  // ---- 11. Plan vs Actual Comparison ----
  comparePlanVsActual: tool({
    description:
      'Compare the active training plan against actual activities. Matches planned sessions to real activities by date and compares workout type, pace, and zone. Use proactively at the end of each week or when the athlete asks for a review.',
    inputSchema: z.object({
      weekOffset: z
        .number()
        .optional()
        .describe(
          '0 = current week (Mon-Sun), -1 = last week, etc. Default 0.',
        ),
    }),
    execute: async ({weekOffset = 0}: {weekOffset?: number}) => {
      // 1. Fetch active plan
      const plans = await db
        .select()
        .from(coachPlans)
        .where(
          and(
            eq(coachPlans.athleteId, athleteId),
            eq(coachPlans.isActive, true),
          ),
        )
        .orderBy(desc(coachPlans.sharedAt))
        .limit(1);

      const plan = plans[0];
      if (!plan) {
        return {comparison: 'No active training plan to compare against.'};
      }

      const sessions = (plan.sessions ?? []) as Array<{
        day: string;
        date?: string;
        type: string;
        description: string;
        targetPace?: string;
        targetZone?: string;
      }>;

      // 2. Determine the target week date range (Mon-Sun)
      const now = new Date();
      const todayMs = now.getTime();
      const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon, 6=Sun
      const mondayMs =
        todayMs - dayOfWeek * 86400000 + weekOffset * 7 * 86400000;
      const sundayMs = mondayMs + 6 * 86400000;

      const weekStartDate = new Date(mondayMs).toISOString().slice(0, 10);
      const weekEndDate = new Date(sundayMs).toISOString().slice(0, 10);

      // 3. Filter planned sessions to this week
      const weekSessions = sessions.filter((s) => {
        if (!s.date) return false;
        return s.date >= weekStartDate && s.date <= weekEndDate;
      });

      // 4. Fetch actual activities in this date range
      const allActivities = await fetchActivities();
      const weekActivities = allActivities.filter(
        (a) => a.date >= weekStartDate && a.date <= weekEndDate,
      );

      // 5. Get workout labels for actual activities
      const settings = await fetchSettings(athleteId);
      const zones = settings?.zones as UserSettings['zones'] | undefined;
      const activityIds = weekActivities.map((a) => Number(a.id));
      const labels = zones
        ? await fetchOrComputeLabels(activityIds, zones)
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
      'Get detailed breakdown for a specific activity: per-km splits (pace, HR, elevation), laps, best efforts with PR flags, full workout label phases, and gear used. Use the activity ID from getRecentActivities.',
    inputSchema: z.object({
      activityId: z
        .number()
        .describe('The activity ID to get details for.'),
    }),
    execute: async ({activityId}: {activityId: number}) => {
      // 1. Fetch the activity detail from Neon
      const detailRows = await db
        .select()
        .from(activityDetailsTable)
        .where(eq(activityDetailsTable.id, activityId))
        .limit(1);

      if (detailRows.length === 0) {
        return {
          detail:
            'No detailed data found for this activity. It may not have been synced yet.',
        };
      }

      const detail = detailRows[0].data as StravaDetailedActivity;
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

      // Gear
      if (detail.gear?.name) {
        lines.push(`Gear: ${detail.gear.name}`);
      }

      // 2. Workout label (full phases)
      const settings = await fetchSettings(athleteId);
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
        .catch(() => [] as Array<typeof activityDetailsTable.$inferSelect>);

      if (!allDetails || allDetails.length === 0) {
        return {records: 'No activity details available to extract PRs.'};
      }

      // Collect all best efforts with pr_rank === 1
      const prMap = new Map<
        string,
        {time: number; date: string; name: string}
      >();

      for (const row of allDetails) {
        const detail = row.data as StravaDetailedActivity;
        const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];
        for (const e of efforts) {
          if (e.pr_rank === 1) {
            const existing = prMap.get(e.name);
            // Keep the fastest PR if multiple activities have pr_rank 1
            if (!existing || e.elapsed_time < existing.time) {
              prMap.set(e.name, {
                time: e.elapsed_time,
                date: e.start_date_local?.split('T')[0] ?? '',
                name: e.name,
              });
            }
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
      'Get the weather forecast for the athlete\'s city using Open-Meteo. Returns daily temperature, apparent temperature, humidity, conditions, precipitation, and wind for up to 16 days. Use to adjust hydration and electrolyte recommendations.',
    inputSchema: z.object({
      days: z
        .number()
        .optional()
        .describe('Number of forecast days (1-16). Default 5.'),
    }),
    execute: async ({days = 5}: {days?: number}) => {
      // Get athlete city from user settings
      const settings = await fetchSettings(athleteId);
      const city = (settings as Record<string, unknown> | null)?.city as string | null;
      if (!city) {
        return {weather: 'No city set for this athlete. Ask the athlete where they train.'};
      }

      try {
        // 1. Geocode city → lat/lon via Open-Meteo geocoding API
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl);
        if (!geoRes.ok) {
          return {weather: `Geocoding API error (${geoRes.status}). City: "${city}" may not be recognized.`};
        }
        const geoData = await geoRes.json();
        const geo = geoData.results?.[0] as {name: string; latitude: number; longitude: number; country?: string} | undefined;
        if (!geo) {
          return {weather: `City "${city}" not found. Ask the athlete to update their city in settings.`};
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
          `?latitude=${geo.latitude}&longitude=${geo.longitude}` +
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
        const location = `${geo.name}${geo.country ? `, ${geo.country}` : ''}`;
        const lines = [`Weather Forecast — ${location} (${geo.latitude.toFixed(2)}, ${geo.longitude.toFixed(2)})`];

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
});
