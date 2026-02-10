// ============================================================
// AI Context Builder — Summarizes athlete data for LLM context
// ============================================================
//
// Builds a compact AthleteSummary from cached Strava data.
// This is sent to the chat API route as structured context
// so the LLM can give personalized coaching advice.

import type {ActivitySummary, UserSettings} from './mockData';
import {formatPace, formatDuration, ZONE_NAMES} from './mockData';
import type {AggregatedZoneTotals} from './zoneCompute';
import type {FitnessDataPoint, ACWRDataPoint} from '@/utils/trainingLoad';
import {calcFitnessData, calcACWRData} from '@/utils/trainingLoad';
import type {StravaSummaryGear} from './strava';

// ----- Types -----

export interface WeekSummary {
  weekStart: string;
  runs: number;
  distanceKm: number;
  durationSeconds: number;
  avgPace: number;
  avgHr: number;
}

export interface AthleteSummary {
  /** Athlete first name */
  name: string;
  /** HR settings */
  maxHr: number;
  restingHr: number;
  /** Zone boundaries as readable strings */
  zones: {zone: number; name: string; min: number; max: number}[];
  /** Training goal (free-text, user-defined) */
  goal: string;
  /** Gear info (shoes with distance) */
  gear: {name: string; distanceKm: number}[];
  /** Per-week summary for last 4 weeks */
  weeklyBreakdown: WeekSummary[];
  /** 4-week aggregate stats */
  fourWeekTotals: {
    runs: number;
    distanceKm: number;
    durationSeconds: number;
    avgRunsPerWeek: number;
    avgDistancePerWeek: number;
    avgPace: number;
    volumeTrendPct: number; // +/- % vs prior 4 weeks
  };
  /** Zone distribution as percentages (4 weeks) */
  zoneDistribution: {zone: number; name: string; timePct: number}[] | null;
  /** Current fitness & freshness metrics */
  fitness: {
    ctl: number;
    atl: number;
    tsb: number;
    acwr: number;
    ctlTrend: 'up' | 'down' | 'stable';
  } | null;
  /** Recent activity list (last 10) */
  recentActivities: {
    name: string;
    date: string;
    type: string;
    distanceKm: number;
    durationFormatted: string;
    pace: string;
    avgHr: number;
  }[];
}

// ----- Helpers -----

const getWeekStart = (dateStr: string): string => {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
};

const filterActivitiesByWeeks = (
  activities: ActivitySummary[],
  weeks: number,
  offsetWeeks = 0,
): ActivitySummary[] => {
  const now = new Date();
  const end = new Date(now.getTime() - offsetWeeks * 7 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);

  return activities.filter((a) => {
    const d = new Date(a.date);
    return d >= start && d <= end;
  });
};

// ----- Build summary -----

export const buildAthleteSummary = (params: {
  athleteName: string;
  settings: UserSettings;
  goal: string;
  activities: ActivitySummary[];
  gear: {bikes: StravaSummaryGear[]; shoes: StravaSummaryGear[]} | null;
  zoneBreakdowns: AggregatedZoneTotals | null;
}): AthleteSummary => {
  const {athleteName, settings, goal, activities, gear, zoneBreakdowns} = params;

  // Zone definitions
  const zones = ([1, 2, 3, 4, 5, 6] as const).map((z) => {
    const key = `z${z}` as keyof UserSettings['zones'];
    const [min, max] = settings.zones[key];
    return {zone: z, name: ZONE_NAMES[z], min, max};
  });

  // Gear (shoes only, with distance in km)
  const gearList = (gear?.shoes ?? []).map((s) => ({
    name: s.name,
    distanceKm: Math.round(s.distance / 1000),
  }));

  // Last 4 weeks activities
  const last4w = filterActivitiesByWeeks(activities, 4);
  // Prior 4 weeks (for trend comparison)
  const prior4w = filterActivitiesByWeeks(activities, 4, 4);

  // Per-week breakdown
  const weekMap = new Map<string, ActivitySummary[]>();
  for (const a of last4w) {
    const ws = getWeekStart(a.date);
    const existing = weekMap.get(ws) ?? [];
    existing.push(a);
    weekMap.set(ws, existing);
  }

  const weeklyBreakdown: WeekSummary[] = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, acts]) => {
      const totalDist = acts.reduce((s, a) => s + a.distance, 0);
      const totalDur = acts.reduce((s, a) => s + a.duration, 0);
      const avgHr =
        acts.filter((a) => a.avgHr > 0).length > 0
          ? Math.round(
              acts.filter((a) => a.avgHr > 0).reduce((s, a) => s + a.avgHr, 0) /
                acts.filter((a) => a.avgHr > 0).length,
            )
          : 0;
      const avgPace = totalDist > 0 ? totalDur / 60 / totalDist : 0;

      return {
        weekStart,
        runs: acts.length,
        distanceKm: Number(totalDist.toFixed(1)),
        durationSeconds: Math.round(totalDur),
        avgPace: Number(avgPace.toFixed(2)),
        avgHr,
      };
    });

  // 4-week totals
  const totalRuns = last4w.length;
  const totalDist = last4w.reduce((s, a) => s + a.distance, 0);
  const totalDur = last4w.reduce((s, a) => s + a.duration, 0);
  const avgPace = totalDist > 0 ? totalDur / 60 / totalDist : 0;

  const priorDist = prior4w.reduce((s, a) => s + a.distance, 0);
  const volumeTrendPct =
    priorDist > 0 ? ((totalDist - priorDist) / priorDist) * 100 : 0;

  const fourWeekTotals = {
    runs: totalRuns,
    distanceKm: Number(totalDist.toFixed(1)),
    durationSeconds: Math.round(totalDur),
    avgRunsPerWeek: Number((totalRuns / 4).toFixed(1)),
    avgDistancePerWeek: Number((totalDist / 4).toFixed(1)),
    avgPace: Number(avgPace.toFixed(2)),
    volumeTrendPct: Number(volumeTrendPct.toFixed(0)),
  };

  // Zone distribution from precomputed breakdowns
  let zoneDistribution: AthleteSummary['zoneDistribution'] = null;
  if (zoneBreakdowns && zoneBreakdowns.totalTime > 0) {
    zoneDistribution = ([1, 2, 3, 4, 5, 6] as const).map((z) => {
      const zt = zoneBreakdowns.zones[z];
      const timePct =
        zt ? Number(((zt.time / zoneBreakdowns.totalTime) * 100).toFixed(1)) : 0;
      return {zone: z, name: ZONE_NAMES[z], timePct};
    });
  }

  // Fitness & freshness (CTL, ATL, TSB, ACWR)
  let fitness: AthleteSummary['fitness'] = null;
  const fitnessData = calcFitnessData(
    activities,
    settings.restingHr,
    settings.maxHr,
    42, // 6 weeks for trend calculation
  );

  if (fitnessData.length > 0) {
    const latest = fitnessData[fitnessData.length - 1];
    const acwrData = calcACWRData(
      activities,
      settings.restingHr,
      settings.maxHr,
      42,
    );
    const latestAcwr = acwrData.length > 0 ? acwrData[acwrData.length - 1].acwr : 0;

    // Determine CTL trend: compare last 7 days of CTL
    const recentCtl = fitnessData.slice(-7);
    let ctlTrend: 'up' | 'down' | 'stable' = 'stable';
    if (recentCtl.length >= 2) {
      const diff = recentCtl[recentCtl.length - 1].ctl - recentCtl[0].ctl;
      if (diff > 1) ctlTrend = 'up';
      else if (diff < -1) ctlTrend = 'down';
    }

    fitness = {
      ctl: Number(latest.ctl.toFixed(1)),
      atl: Number(latest.atl.toFixed(1)),
      tsb: Number(latest.tsb.toFixed(1)),
      acwr: Number(latestAcwr.toFixed(2)),
      ctlTrend,
    };
  }

  // Recent activities (last 10)
  const recentActivities = activities
    .slice(0, 10)
    .map((a) => ({
      name: a.name,
      date: a.date,
      type: a.type,
      distanceKm: Number(a.distance.toFixed(1)),
      durationFormatted: formatDuration(a.duration),
      pace: formatPace(a.avgPace),
      avgHr: a.avgHr,
    }));

  return {
    name: athleteName,
    maxHr: settings.maxHr,
    restingHr: settings.restingHr,
    zones,
    goal,
    gear: gearList,
    weeklyBreakdown,
    fourWeekTotals,
    zoneDistribution,
    fitness,
    recentActivities,
  };
};

// ----- Serialize to text -----

/**
 * Converts the AthleteSummary into a compact human-readable text block
 * suitable for inclusion in an LLM system prompt.
 */
export const serializeAthleteSummary = (summary: AthleteSummary): string => {
  const lines: string[] = [];

  // Profile
  lines.push('## Athlete Profile');
  lines.push(`- Name: ${summary.name}`);
  lines.push(
    `- Max HR: ${summary.maxHr} bpm | Resting HR: ${summary.restingHr} bpm`,
  );
  lines.push(
    `- Zones: ${summary.zones.map((z) => `Z${z.zone} ${z.min}-${z.max}`).join(' | ')}`,
  );

  // Goal
  if (summary.goal) {
    lines.push('');
    lines.push('## Training Goal');
    lines.push(`- ${summary.goal}`);
  }

  // 4-week training summary
  lines.push('');
  lines.push('## Training (Last 4 Weeks)');
  const t = summary.fourWeekTotals;
  lines.push(
    `- Runs: ${t.runs} | Distance: ${t.distanceKm} km | Time: ${formatDuration(t.durationSeconds)}`,
  );
  lines.push(
    `- Avg: ${t.avgRunsPerWeek} runs/week, ${t.avgDistancePerWeek} km/week, ${formatPace(t.avgPace)}/km pace`,
  );
  const trendSign = t.volumeTrendPct >= 0 ? '+' : '';
  lines.push(`- Volume trend: ${trendSign}${t.volumeTrendPct}% vs prior 4 weeks`);

  // Weekly breakdown
  if (summary.weeklyBreakdown.length > 0) {
    lines.push('');
    lines.push('## Weekly Breakdown');
    for (const w of summary.weeklyBreakdown) {
      lines.push(
        `- Week of ${w.weekStart}: ${w.runs} runs, ${w.distanceKm} km, ${formatPace(w.avgPace)}/km, avg HR ${w.avgHr}`,
      );
    }
  }

  // Zone distribution
  if (summary.zoneDistribution) {
    lines.push('');
    lines.push('## Zone Distribution (4 Weeks)');
    for (const z of summary.zoneDistribution) {
      lines.push(`- Z${z.zone} (${z.name}): ${z.timePct}%`);
    }
  }

  // Fitness & freshness
  if (summary.fitness) {
    lines.push('');
    lines.push('## Fitness & Freshness');
    lines.push(
      `- CTL (Fitness): ${summary.fitness.ctl} (trending ${summary.fitness.ctlTrend})`,
    );
    lines.push(`- ATL (Fatigue): ${summary.fitness.atl}`);
    lines.push(`- TSB (Form): ${summary.fitness.tsb}`);
    lines.push(`- ACWR (Injury Risk): ${summary.fitness.acwr}`);
  }

  // Gear
  if (summary.gear.length > 0) {
    lines.push('');
    lines.push('## Gear');
    for (const g of summary.gear) {
      lines.push(`- ${g.name}: ${g.distanceKm} km`);
    }
  }

  // Recent activities
  if (summary.recentActivities.length > 0) {
    lines.push('');
    lines.push('## Recent Activities (Last 10)');
    for (const a of summary.recentActivities) {
      lines.push(
        `- ${a.date} | ${a.name} | ${a.type} | ${a.distanceKm} km | ${a.durationFormatted} | ${a.pace}/km | HR ${a.avgHr}`,
      );
    }
  }

  return lines.join('\n');
};
