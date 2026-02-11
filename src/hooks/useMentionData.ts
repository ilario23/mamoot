// ============================================================
// Mention Data Resolver — Resolves @-mention pills into data
// ============================================================
//
// Fetches data from Dexie (client-side cache) for each MentionReference,
// serializes it into compact text, and returns ResolvedMention[] ready
// to send to the server as explicitContext.

import {useCallback} from 'react';
import {db} from '@/lib/db';
import {useSettings} from '@/contexts/SettingsContext';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {formatPace, formatDuration, ZONE_NAMES} from '@/lib/mockData';
import type {ActivitySummary, UserSettings} from '@/lib/mockData';
import type {StravaSummaryGear} from '@/lib/strava';
import type {MentionReference, ResolvedMention} from '@/lib/mentionTypes';
import {calcFitnessData, calcACWRData} from '@/utils/trainingLoad';

// ----- Helpers -----

/** Convert a Dexie CachedActivity into an ActivitySummary. */
const toActivitySummary = (row: {
  data: unknown;
  date: string;
}): ActivitySummary => {
  const d = row.data as unknown as Record<string, unknown>;
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

const getWeekStart = (dateStr: string): string => {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const filterByWeeks = (
  acts: ActivitySummary[],
  weeks: number,
  offset = 0,
): ActivitySummary[] => {
  const now = new Date();
  const end = new Date(now.getTime() - offset * 7 * 86400000);
  const start = new Date(end.getTime() - weeks * 7 * 86400000);
  return acts.filter((a) => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });
};

// ----- Resolvers (one per category) -----

const resolveGoal = (settings: UserSettings): string =>
  settings.goal ? `Training Goal: ${settings.goal}` : 'No training goal set.';

const resolveInjuries = (settings: UserSettings): string => {
  const injuries = settings.injuries ?? [];
  if (injuries.length === 0) return 'No injuries reported.';
  return [
    'Current Injuries',
    ...injuries.map((i) => `- ${i.name}${i.notes ? `: ${i.notes}` : ''}`),
  ].join('\n');
};

const resolveDiet = (settings: UserSettings): string => {
  const lines: string[] = [];
  const allergies = settings.allergies ?? [];
  if (allergies.length > 0) lines.push(`Allergies: ${allergies.join(', ')}`);
  else lines.push('No allergies reported.');
  if (settings.foodPreferences)
    lines.push(`Preferences: ${settings.foodPreferences}`);
  return lines.join('\n');
};

const resolveTraining = (activities: ActivitySummary[]): string => {
  const recent = filterByWeeks(activities, 4);
  const prior = filterByWeeks(activities, 4, 4);
  const totalRuns = recent.length;
  const totalDist = recent.reduce((s, a) => s + a.distance, 0);
  const totalDur = recent.reduce((s, a) => s + a.duration, 0);
  const avgPace = totalDist > 0 ? totalDur / 60 / totalDist : 0;
  const priorDist = prior.reduce((s, a) => s + a.distance, 0);
  const trend = priorDist > 0 ? ((totalDist - priorDist) / priorDist) * 100 : 0;
  const sign = trend >= 0 ? '+' : '';
  return [
    'Training Summary (Last 4 Weeks)',
    `- Runs: ${totalRuns} | Distance: ${totalDist.toFixed(1)} km | Time: ${formatDuration(totalDur)}`,
    `- Avg: ${(totalRuns / 4).toFixed(1)} runs/week, ${(totalDist / 4).toFixed(1)} km/week, ${formatPace(avgPace)}/km`,
    `- Volume trend: ${sign}${trend.toFixed(0)}% vs prior 4 weeks`,
  ].join('\n');
};

const resolveZones = async (activities: ActivitySummary[]): Promise<string> => {
  const recent = filterByWeeks(activities, 4);
  const ids = new Set(recent.map((a) => Number(a.id)));
  const breakdowns = await db.zoneBreakdowns.toArray();
  const matching = breakdowns.filter((b) => ids.has(b.activityId));

  if (matching.length === 0) return 'No zone breakdown data available.';

  const zoneTotals: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };
  let total = 0;
  for (const b of matching) {
    for (const [z, data] of Object.entries(b.zones)) {
      const num = Number(z);
      if (num >= 1 && num <= 6 && data?.time) {
        zoneTotals[num] += data.time;
        total += data.time;
      }
    }
  }
  if (total === 0) return 'No zone time data available.';

  const lines = ['Zone Distribution (4 Weeks)'];
  for (let z = 1; z <= 6; z++) {
    lines.push(
      `- Z${z} (${ZONE_NAMES[z]}): ${((zoneTotals[z] / total) * 100).toFixed(1)}%`,
    );
  }
  return lines.join('\n');
};

const resolveFitness = (
  activities: ActivitySummary[],
  settings: UserSettings,
): string => {
  const fitnessData = calcFitnessData(
    activities,
    settings.restingHr,
    settings.maxHr,
    42,
    settings.zones,
  );
  if (fitnessData.length === 0) return 'Insufficient data for fitness metrics.';

  const latest = fitnessData[fitnessData.length - 1];
  const acwrData = calcACWRData(
    activities,
    settings.restingHr,
    settings.maxHr,
    42,
    settings.zones,
  );
  const acwr = acwrData.length > 0 ? acwrData[acwrData.length - 1].acwr : 0;

  const recentBf = fitnessData.slice(-7);
  let bfTrend = 'stable';
  if (recentBf.length >= 2) {
    const diff = recentBf[recentBf.length - 1].bf - recentBf[0].bf;
    if (diff > 1) bfTrend = 'up';
    else if (diff < -1) bfTrend = 'down';
  }

  return [
    'Training Metrics (EvoLab)',
    `- Base Fitness (BF): ${latest.bf.toFixed(1)} (trending ${bfTrend})`,
    `- Load Impact (LI): ${latest.li.toFixed(1)}`,
    `- Intensity Trend (IT): ${latest.it.toFixed(1)} (${latest.it > 0 ? 'stimulus' : latest.it < 0 ? 'recovery' : 'balanced'})`,
    `- ACWR: ${acwr.toFixed(2)}`,
  ].join('\n');
};

const resolveActivity = (
  activities: ActivitySummary[],
  itemId?: string,
): string => {
  if (itemId) {
    const a = activities.find((act) => String(act.id) === itemId);
    if (!a) return 'Activity not found.';
    return `Activity: ${a.date} | ${a.name} | ${a.type} | ${a.distance.toFixed(1)} km | ${formatDuration(a.duration)} | ${formatPace(a.avgPace)}/km | HR ${a.avgHr}`;
  }
  const recent = activities.slice(0, 10);
  if (recent.length === 0) return 'No activities found.';
  const lines = ['Recent Activities'];
  for (const a of recent) {
    lines.push(
      `- ${a.date} | ${a.name} | ${a.type} | ${a.distance.toFixed(1)} km | ${formatDuration(a.duration)} | ${formatPace(a.avgPace)}/km | HR ${a.avgHr}`,
    );
  }
  return lines.join('\n');
};

const resolveGear = async (itemId?: string): Promise<string> => {
  const gearRecords = await db.athleteGear.toArray();
  const gear = gearRecords[0];
  if (!gear) return 'No gear data available.';

  const shoes = gear.shoes as StravaSummaryGear[];
  const retiredIds = new Set(gear.retiredGearIds);

  if (itemId) {
    const shoe = shoes.find((s) => s.id === itemId);
    if (!shoe) return 'Shoe not found.';
    const km = Math.round(shoe.distance / 1000);
    const status = retiredIds.has(shoe.id) ? 'RETIRED' : 'active';
    return `Shoe: ${shoe.name} — ${km} km (${status})`;
  }

  if (shoes.length === 0) return 'No shoes registered.';
  const lines = ['Gear (Shoes)'];
  for (const s of shoes) {
    const km = Math.round(s.distance / 1000);
    const status = retiredIds.has(s.id) ? 'RETIRED' : 'active';
    lines.push(`- ${s.name}: ${km} km (${status})`);
  }
  return lines.join('\n');
};

const resolvePlan = async (athleteId: number): Promise<string> => {
  const plans = await db.coachPlans
    .where('athleteId')
    .equals(athleteId)
    .and((p) => p.isActive)
    .toArray();

  const plan = plans.sort((a, b) => b.sharedAt - a.sharedAt)[0];
  if (!plan) return 'No active training plan.';

  const lines = [
    `Training Plan: ${plan.title}`,
    plan.goal ? `Goal: ${plan.goal}` : null,
    plan.durationWeeks ? `Duration: ${plan.durationWeeks} weeks` : null,
  ].filter(Boolean) as string[];

  if (plan.sessions?.length > 0) {
    lines.push('', '| Day | Type | Workout |', '|-----|------|---------|');
    for (const s of plan.sessions) {
      lines.push(`| ${s.day} | ${s.type} | ${s.description} |`);
    }
  }
  if (plan.content) {
    lines.push('', plan.content);
  }
  return lines.join('\n');
};

// ----- Hook -----

/**
 * Hook that provides a function to resolve MentionReference[] into
 * ResolvedMention[] with serialized data from Dexie.
 */
export const useMentionResolver = () => {
  const {settings} = useSettings();
  const {athlete} = useStravaAuth();

  const resolveAll = useCallback(
    async (mentions: MentionReference[]): Promise<ResolvedMention[]> => {
      if (mentions.length === 0) return [];

      // Preload activities once (many resolvers need them)
      const cachedActivities = await db.activities
        .orderBy('date')
        .reverse()
        .toArray();
      const activities = cachedActivities.map(toActivitySummary);
      const athleteId = athlete?.id ?? 0;

      const results: ResolvedMention[] = [];

      for (const mention of mentions) {
        let data = '';

        switch (mention.categoryId) {
          case 'goal':
            data = resolveGoal(settings);
            break;
          case 'injuries':
            data = resolveInjuries(settings);
            break;
          case 'diet':
            data = resolveDiet(settings);
            break;
          case 'training':
            data = resolveTraining(activities);
            break;
          case 'zones':
            data = await resolveZones(activities);
            break;
          case 'fitness':
            data = resolveFitness(activities, settings);
            break;
          case 'activity':
            data = resolveActivity(activities, mention.itemId);
            break;
          case 'gear':
            data = await resolveGear(mention.itemId);
            break;
          case 'plan':
            data = await resolvePlan(athleteId);
            break;
          default:
            data = 'Unknown data category.';
        }

        results.push({
          categoryId: mention.categoryId,
          label: mention.label,
          data,
        });
      }

      return results;
    },
    [settings, athlete?.id],
  );

  return {resolveAll};
};

// ----- Sub-item loaders (for MentionPopup) -----

/** Load recent activities for the @activity sub-item list. */
export const loadActivitySubItems = async (): Promise<
  Array<{id: string; label: string}>
> => {
  const cached = await db.activities
    .orderBy('date')
    .reverse()
    .limit(20)
    .toArray();
  return cached.map((row) => {
    const d = row.data as unknown as Record<string, unknown>;
    return {
      id: String(row.id),
      label: `${row.date} | ${String(d.name ?? 'Untitled')} | ${Number(d.distance ?? 0).toFixed(1)} km`,
    };
  });
};

/** Load shoes for the @gear sub-item list. */
export const loadGearSubItems = async (): Promise<
  Array<{id: string; label: string}>
> => {
  const gearRecords = await db.athleteGear.toArray();
  const gear = gearRecords[0];
  if (!gear) return [];

  const shoes = gear.shoes as StravaSummaryGear[];
  const retiredIds = new Set(gear.retiredGearIds);

  return shoes.map((s) => ({
    id: s.id,
    label: `${s.name} — ${Math.round(s.distance / 1000)} km${retiredIds.has(s.id) ? ' (retired)' : ''}`,
  }));
};
