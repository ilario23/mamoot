// ============================================================
// AI Retrieval Tools — Server-side tools the LLM calls on demand
// ============================================================
//
// Factory function that creates 10 fine-grained retrieval tools
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
} from '@/db/schema';
import {eq, desc, and, inArray} from 'drizzle-orm';
import type {ActivitySummary, UserSettings} from './mockData';
import {formatPace, formatDuration, ZONE_NAMES} from './mockData';
import {calcFitnessData, calcACWRData} from '@/utils/trainingLoad';
import type {StravaDetailedActivity} from './strava';
import {
  classifyWorkout,
  formatLabelForAI,
  type WorkoutLabel,
} from './workoutLabel';

// ----- Helpers -----

/** Parse a Neon activity row's JSONB `data` column into an ActivitySummary. */
const parseActivityRow = (row: {
  data: unknown;
  date: string;
}): ActivitySummary => {
  const d = row.data as Record<string, unknown>;
  return {
    id: String(d.id ?? ''),
    name: String(d.name ?? ''),
    date: row.date,
    type: (d.type as ActivitySummary['type']) ?? 'Run',
    distance: Number(d.distance ?? 0),
    duration: Number(d.duration ?? 0),
    avgPace: Number(d.avgPace ?? 0),
    avgHr: Number(d.avgHr ?? 0),
    maxHr: Number(d.maxHr ?? 0),
    elevationGain: Number(d.elevationGain ?? 0),
    calories: Number(d.calories ?? 0),
    hasDetailedData: Boolean(d.hasDetailedData),
  };
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
      'Get aggregate training stats for the last N weeks: total runs, distance, duration, avg pace, and volume trend vs prior period.',
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
      const avgPace = totalDist > 0 ? totalDur / 60 / totalDist : 0;

      const priorDist = prior.reduce((s, a) => s + a.distance, 0);
      const volumeTrend =
        priorDist > 0 ? ((totalDist - priorDist) / priorDist) * 100 : 0;
      const trendSign = volumeTrend >= 0 ? '+' : '';

      return {
        summary: [
          `Training Summary (Last ${weeks} Weeks)`,
          `- Runs: ${totalRuns} | Distance: ${totalDist.toFixed(1)} km | Time: ${formatDuration(totalDur)}`,
          `- Avg: ${(totalRuns / weeks).toFixed(1)} runs/week, ${(totalDist / weeks).toFixed(1)} km/week, ${formatPace(avgPace)}/km pace`,
          `- Volume trend: ${trendSign}${volumeTrend.toFixed(0)}% vs prior ${weeks} weeks`,
        ].join('\n'),
      };
    },
  }),

  // ---- 5. Weekly Breakdown ----
  getWeeklyBreakdown: tool({
    description:
      'Get per-week training stats (runs, distance, pace, avg HR) for the last N weeks.',
    inputSchema: z.object({
      weeks: z.number().optional().describe('Number of weeks. Default 4.'),
    }),
    execute: async ({weeks = 4}: {weeks?: number}) => {
      const allActivities = await fetchActivities();
      const recent = filterByWeeks(allActivities, weeks);

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
        const avgPace = dist > 0 ? dur / 60 / dist : 0;
        const hrActs = acts.filter((a) => a.avgHr > 0);
        const avgHr =
          hrActs.length > 0
            ? Math.round(
                hrActs.reduce((s, a) => s + a.avgHr, 0) / hrActs.length,
              )
            : 0;
        lines.push(
          `- Week of ${weekStart}: ${acts.length} runs, ${dist.toFixed(1)} km, ${formatPace(avgPace)}/km, avg HR ${avgHr}`,
        );
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

      // Aggregate zone times
      const zoneTotals: Record<number, number> = {
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
          const z = Number(zoneNum);
          if (z >= 1 && z <= 6 && data?.time) {
            zoneTotals[z] += data.time;
            totalTime += data.time;
          }
        }
      }

      if (totalTime === 0) {
        return {zones: 'No zone time data available.'};
      }

      const lines = ['Zone Distribution (Last ' + weeks + ' Weeks)'];
      for (let z = 1; z <= 6; z++) {
        const pct = ((zoneTotals[z] / totalTime) * 100).toFixed(1);
        lines.push(`- Z${z} (${ZONE_NAMES[z]}): ${pct}%`);
      }

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
      'Get a list of the most recent activities with workout labels (warm-up/main/cool-down analysis), date, distance, and duration. Labels classify each activity (e.g. "Intervals: 5x1000m @ 4:10/km Z4") based on the main work phase only, excluding warm-up and cool-down.',
    inputSchema: z.object({
      count: z
        .number()
        .optional()
        .describe('Number of activities to return. Default 10.'),
    }),
    execute: async ({count = 10}: {count?: number}) => {
      const allActivities = await fetchActivities();
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
        if (label) {
          lines.push(
            `- ${a.date} | ${formatLabelForAI(label)} | ${a.distance.toFixed(1)} km | ${formatDuration(a.duration)}`,
          );
        } else {
          // Fallback to basic format if no label available
          lines.push(
            `- ${a.date} | ${a.name} | ${a.type} | ${a.distance.toFixed(1)} km | ${formatDuration(a.duration)} | ${formatPace(a.avgPace)}/km | HR ${a.avgHr}`,
          );
        }
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
});
