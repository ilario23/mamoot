// ============================================================
// COROS EvoLab–style Training Metrics
// TL (Training Load), BF (Base Fitness), LI (Load Impact),
// IT (Intensity Trend), ACWR
// Derived from activity summary data (no extra API calls needed)
// ============================================================

import type {ActivitySummary, UserSettings} from '@/lib/activityModel';
import {getZoneForHr} from '@/lib/activityModel';
import {hashZoneSettings} from '@/lib/zoneCompute';

// ----- Types -----

export interface DailyLoad {
  date: string; // YYYY-MM-DD
  tl: number; // Training Load for the day
}

export interface FitnessDataPoint {
  date: string; // YYYY-MM-DD
  bf: number; // Base Fitness (~42-day EWMA of TL)
  li: number; // Load Impact (~7-day EWMA of TL)
  it: number; // Intensity Trend (LI - BF)
  tl: number; // Raw daily Training Load
}

export interface ACWRDataPoint {
  date: string;
  acwr: number; // Acute:Chronic Workload Ratio
  bf: number;
  li: number;
}

export interface AdvancedMetricsDataPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number;
  rampRate: number;
  monotony: number;
  strain: number;
  thresholdPace: number | null;
  efficiencyFactor: number | null;
  decoupling: number | null;
}

export interface MetricsSnapshot {
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  acwr: number | null;
  rampRate: number | null;
  monotony: number | null;
  strain: number | null;
  thresholdPace: number | null;
  efficiencyFactor: number | null;
  decoupling: number | null;
}

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface RiskIntelligence {
  riskLevel: RiskLevel;
  riskScore: number;
  topContributors: string[];
  recommendedActions: string[];
}

/** EWMA state stored for incremental resumption */
export interface ContinuationState {
  bf: number;
  li: number;
  lastDate: string; // YYYY-MM-DD — last day processed
}

/** Result of a fitness computation, including continuation state for caching */
export interface FitnessResult {
  data: FitnessDataPoint[];
  continuation: ContinuationState;
}

// ----- Constants -----

const BF_DAYS = 42; // Base Fitness window (chronic / ~6 weeks)
const LI_DAYS = 7; // Load Impact window (acute / 1 week)

/**
 * Zone intensity weights used in the COROS-style Training Load formula.
 * TL = Σ (minutes in zone × weight)
 *
 * Weights approximate the non-linear physiological cost of each zone.
 */
const ZONE_WEIGHTS: Record<number, number> = {
  1: 1, // Recovery
  2: 2, // Aerobic Base
  3: 3, // Tempo
  4: 5, // Threshold
  5: 7, // VO2max
  6: 10, // Anaerobic
};

// ----- Core Calculations -----

/**
 * Calculate zone-weighted Training Load (TL) for a single activity.
 *
 * COROS-style formula:
 *   TL = Σ (minutes in zone × zone intensity weight)
 *
 * When zone settings are provided we estimate per-zone time from
 * the activity's average HR. Without zones, we fall back to a
 * simplified HR-reserve formula (similar to TRIMP).
 */
export const calcTrainingLoad = (
  durationSeconds: number,
  avgHR: number,
  restHR: number,
  maxHR: number,
  zones?: UserSettings['zones'],
): number => {
  if (maxHR <= restHR || avgHR <= restHR || durationSeconds <= 0) return 0;

  // If we have zone boundaries, use zone-weighted TL
  if (zones) {
    const durationMin = durationSeconds / 60;
    const zone = getZoneForHr(avgHR, zones);
    const weight = ZONE_WEIGHTS[zone] ?? 1;
    return durationMin * weight;
  }

  // Fallback: simplified HR-reserve formula (backward compat)
  const durationMin = durationSeconds / 60;
  const hrReserveRatio = (avgHR - restHR) / (maxHR - restHR);
  return durationMin * hrReserveRatio;
};

/**
 * Aggregate activities into daily Training Load totals.
 * Multiple activities on the same day are summed.
 */
export const buildDailyLoads = (
  activities: ActivitySummary[],
  restHR: number,
  maxHR: number,
  zones?: UserSettings['zones'],
): DailyLoad[] => {
  const dailyMap = new Map<string, number>();

  for (const a of activities) {
    if (!a.avgHr || a.avgHr <= 0) continue;
    const tl = calcTrainingLoad(a.duration, a.avgHr, restHR, maxHR, zones);
    const existing = dailyMap.get(a.date) ?? 0;
    dailyMap.set(a.date, existing + tl);
  }

  return Array.from(dailyMap.entries())
    .map(([date, tl]) => ({date, tl}))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Fill gaps in daily load data so every day has an entry (TL = 0 for rest days).
 * This is critical for correct EWMA calculation.
 */
const fillDailyGaps = (
  loads: DailyLoad[],
  startDate: string,
  endDate: string,
): DailyLoad[] => {
  const loadMap = new Map(loads.map((l) => [l.date, l.tl]));
  const filled: DailyLoad[] = [];

  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    filled.push({date: dateStr, tl: loadMap.get(dateStr) ?? 0});
    current.setDate(current.getDate() + 1);
  }

  return filled;
};

/**
 * Hash training settings that affect the TL formula.
 * A change in any of these values means all historical TL values are wrong
 * and cached fitness data must be fully recomputed.
 */
export const hashTrainingSettings = (
  zones: UserSettings['zones'],
  maxHr: number,
  restingHr: number,
): string => {
  return `${hashZoneSettings(zones)}:${maxHr}:${restingHr}`;
};

/**
 * Calculate COROS EvoLab–style fitness time series:
 *   BF (Base Fitness)   — ~42-day EWMA of daily TL
 *   LI (Load Impact)    — ~7-day  EWMA of daily TL
 *   IT (Intensity Trend) — LI - BF
 *
 * Returns both the data points and the continuation state so results
 * can be cached and incrementally extended when new activities arrive.
 *
 * IT > 0  → training above your fitness (stimulus / overreaching)
 * IT < 0  → training below your fitness (recovery / detraining)
 */
export const calcFitnessData = (
  activities: ActivitySummary[],
  restHR: number,
  maxHR: number,
  daysBack = 180,
  zones?: UserSettings['zones'],
): FitnessResult => {
  const rawLoads = buildDailyLoads(activities, restHR, maxHR, zones);
  if (rawLoads.length === 0) {
    const todayStr = new Date().toISOString().slice(0, 10);
    return {data: [], continuation: {bf: 0, li: 0, lastDate: todayStr}};
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Go back further than daysBack to warm up the EWMA
  const warmupDays = BF_DAYS * 2;
  const earliest = rawLoads[0]?.date ?? todayStr;

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack - warmupDays);
  const startStr =
    startDate.toISOString().slice(0, 10) < earliest
      ? startDate.toISOString().slice(0, 10)
      : earliest;

  const dailyLoads = fillDailyGaps(rawLoads, startStr, todayStr);

  const bfDecay = 1 - Math.exp(-1 / BF_DAYS);
  const liDecay = 1 - Math.exp(-1 / LI_DAYS);

  let bf = 0;
  let li = 0;
  const result: FitnessDataPoint[] = [];

  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  for (const day of dailyLoads) {
    bf = bf + bfDecay * (day.tl - bf);
    li = li + liDecay * (day.tl - li);
    const it = li - bf;

    // Only output points within the requested window
    if (day.date >= cutoffStr) {
      result.push({
        date: day.date,
        bf: Number(bf.toFixed(1)),
        li: Number(li.toFixed(1)),
        it: Number(it.toFixed(1)),
        tl: Number(day.tl.toFixed(1)),
      });
    }
  }

  return {
    data: result,
    continuation: {bf, li, lastDate: todayStr},
  };
};

/**
 * Incrementally extend cached fitness data with new activities.
 * Resumes EWMA from the stored continuation state and processes only
 * the days between lastDate + 1 and today.
 *
 * @param newActivities — only activities with date > continuation.lastDate
 * @param continuation  — stored EWMA state (bf, li) to resume from
 * @param existingData  — cached FitnessDataPoint[] to append to
 * @param restHR        — resting heart rate
 * @param maxHR         — maximum heart rate
 * @param daysBack      — output window size (for trimming old points)
 * @param zones         — HR zone boundaries
 */
export const appendFitnessData = (
  newActivities: ActivitySummary[],
  continuation: ContinuationState,
  existingData: FitnessDataPoint[],
  restHR: number,
  maxHR: number,
  daysBack = 365,
  zones?: UserSettings['zones'],
): FitnessResult => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Nothing new to process — just extend rest days to today
  const nextDate = new Date(continuation.lastDate + 'T00:00:00');
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  if (nextDateStr > todayStr) {
    // Already up to date
    return {data: existingData, continuation};
  }

  // Build daily loads for ONLY the new activities
  const rawLoads = buildDailyLoads(newActivities, restHR, maxHR, zones);

  // Fill gaps from the day after lastDate through today
  const dailyLoads = fillDailyGaps(rawLoads, nextDateStr, todayStr);

  const bfDecay = 1 - Math.exp(-1 / BF_DAYS);
  const liDecay = 1 - Math.exp(-1 / LI_DAYS);

  let bf = continuation.bf;
  let li = continuation.li;
  const newPoints: FitnessDataPoint[] = [];

  for (const day of dailyLoads) {
    bf = bf + bfDecay * (day.tl - bf);
    li = li + liDecay * (day.tl - li);
    const it = li - bf;

    newPoints.push({
      date: day.date,
      bf: Number(bf.toFixed(1)),
      li: Number(li.toFixed(1)),
      it: Number(it.toFixed(1)),
      tl: Number(day.tl.toFixed(1)),
    });
  }

  // Combine existing + new, then trim to the daysBack window
  const combined = [...existingData, ...newPoints];

  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const trimmed = combined.filter((d) => d.date >= cutoffStr);

  return {
    data: trimmed,
    continuation: {bf, li, lastDate: todayStr},
  };
};

/**
 * Calculate Acute:Chronic Workload Ratio time series.
 * ACWR = LI / BF — a common injury risk metric.
 *
 * Risk zones:
 *   < 0.8  = under-trained / detraining
 *   0.8–1.3 = sweet spot
 *   1.3–1.5 = moderate risk
 *   > 1.5  = high injury risk
 */
export const calcACWRData = (
  fitnessData: FitnessDataPoint[],
): ACWRDataPoint[] => {
  return fitnessData.map((d) => ({
    date: d.date,
    acwr: d.bf > 0 ? Number((d.li / d.bf).toFixed(2)) : 0,
    bf: d.bf,
    li: d.li,
  }));
};

const calcMean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

const calcStdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = calcMean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const getRollingWindow = (
  values: number[],
  endIndex: number,
  windowSize: number,
): number[] => {
  const start = Math.max(0, endIndex - windowSize + 1);
  return values.slice(start, endIndex + 1);
};

const getRollingThresholdPace = (
  activities: ActivitySummary[],
  dateStr: string,
): number | null => {
  const end = new Date(dateStr + 'T23:59:59');
  const start = new Date(end);
  start.setDate(start.getDate() - 42);

  const candidates = activities.filter((a) => {
    if (a.type !== 'Run' || a.avgPace <= 0 || a.duration <= 0) return false;
    const d = new Date(a.date + 'T12:00:00');
    if (d < start || d > end) return false;
    return a.avgHr >= 0.84 * a.maxHr && a.duration >= 20 * 60;
  });

  if (candidates.length === 0) return null;
  const weightedPace =
    candidates.reduce((sum, run) => sum + run.avgPace * run.duration, 0) /
    candidates.reduce((sum, run) => sum + run.duration, 0);
  return Number(weightedPace.toFixed(2));
};

const getRollingEfficiencyFactor = (
  activities: ActivitySummary[],
  dateStr: string,
): number | null => {
  const end = new Date(dateStr + 'T23:59:59');
  const start = new Date(end);
  start.setDate(start.getDate() - 28);

  const easyRuns = activities.filter((a) => {
    if (a.type !== 'Run' || a.avgPace <= 0 || a.avgHr <= 0) return false;
    const d = new Date(a.date + 'T12:00:00');
    if (d < start || d > end) return false;
    return a.duration >= 30 * 60 && a.avgHr <= 0.82 * a.maxHr;
  });

  if (easyRuns.length === 0) return null;
  const weighted = easyRuns.reduce((sum, run) => {
    const metersPerSec = run.distance > 0 ? (run.distance * 1000) / run.duration : 0;
    const ef = run.avgHr > 0 ? metersPerSec / run.avgHr : 0;
    return sum + ef * run.duration;
  }, 0);
  const totalDuration = easyRuns.reduce((sum, run) => sum + run.duration, 0);
  if (totalDuration <= 0) return null;
  return Number((weighted / totalDuration).toFixed(4));
};

const getRollingDecouplingProxy = (
  activities: ActivitySummary[],
  dateStr: string,
): number | null => {
  const end = new Date(dateStr + 'T23:59:59');
  const start = new Date(end);
  start.setDate(start.getDate() - 56);

  const longRuns = activities
    .filter((a) => {
      if (a.type !== 'Run' || a.avgPace <= 0 || a.avgHr <= 0) return false;
      const d = new Date(a.date + 'T12:00:00');
      return d >= start && d <= end && a.duration >= 75 * 60;
    })
    .slice(0, 6);

  if (longRuns.length < 2) return null;
  const efValues = longRuns.map((run) => {
    const metersPerSec = (run.distance * 1000) / run.duration;
    return metersPerSec / run.avgHr;
  });
  const latest = efValues[0];
  const baseline = calcMean(efValues.slice(1));
  if (baseline <= 0) return null;
  return Number((((latest - baseline) / baseline) * 100).toFixed(1));
};

export const calcAdvancedMetricsData = (
  fitnessData: FitnessDataPoint[],
  activities: ActivitySummary[],
): AdvancedMetricsDataPoint[] => {
  if (fitnessData.length === 0) return [];

  const tlSeries = fitnessData.map((d) => d.tl);
  const results: AdvancedMetricsDataPoint[] = [];

  for (let i = 0; i < fitnessData.length; i++) {
    const point = fitnessData[i];
    const ctl = point.bf;
    const atl = point.li;
    const tsb = Number((ctl - atl).toFixed(1));
    const acwr = ctl > 0 ? Number((atl / ctl).toFixed(2)) : 0;

    const weekLoads = getRollingWindow(tlSeries, i, 7);
    const priorWeeks = getRollingWindow(tlSeries, i, 28);
    const acute = weekLoads.reduce((sum, v) => sum + v, 0);
    const chronicWeekly = priorWeeks.reduce((sum, v) => sum + v, 0) / 4;
    const rampRate =
      chronicWeekly > 0
        ? Number((((acute - chronicWeekly) / chronicWeekly) * 100).toFixed(1))
        : 0;
    const weekMean = calcMean(weekLoads);
    const weekStd = calcStdDev(weekLoads);
    const monotony = weekStd > 0 ? Number((weekMean / weekStd).toFixed(2)) : 0;
    const strain = Number((acute * monotony).toFixed(1));

    results.push({
      date: point.date,
      ctl,
      atl,
      tsb,
      acwr,
      rampRate,
      monotony,
      strain,
      thresholdPace: getRollingThresholdPace(activities, point.date),
      efficiencyFactor: getRollingEfficiencyFactor(activities, point.date),
      decoupling: getRollingDecouplingProxy(activities, point.date),
    });
  }

  return results;
};

export const getLatestMetricsSnapshot = (
  metricsData: AdvancedMetricsDataPoint[],
): MetricsSnapshot => {
  const latest = metricsData[metricsData.length - 1];
  if (!latest) {
    return {
      ctl: null,
      atl: null,
      tsb: null,
      acwr: null,
      rampRate: null,
      monotony: null,
      strain: null,
      thresholdPace: null,
      efficiencyFactor: null,
      decoupling: null,
    };
  }

  return {
    ctl: latest.ctl,
    atl: latest.atl,
    tsb: latest.tsb,
    acwr: latest.acwr,
    rampRate: latest.rampRate,
    monotony: latest.monotony,
    strain: latest.strain,
    thresholdPace: latest.thresholdPace,
    efficiencyFactor: latest.efficiencyFactor,
    decoupling: latest.decoupling,
  };
};

/**
 * Calculate training streak — consecutive days/weeks with at least one activity.
 */
export const calcStreak = (
  activities: ActivitySummary[],
): {days: number; weeks: number} => {
  if (activities.length === 0) return {days: 0, weeks: 0};

  const activityDates = new Set(activities.map((a) => a.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Count consecutive days backwards from today
  let days = 0;
  const check = new Date(today);

  while (true) {
    const dateStr = check.toISOString().slice(0, 10);
    if (activityDates.has(dateStr)) {
      days++;
      check.setDate(check.getDate() - 1);
    } else if (days === 0) {
      // Allow today to not have an activity yet — check yesterday
      check.setDate(check.getDate() - 1);
      const yesterdayStr = check.toISOString().slice(0, 10);
      if (activityDates.has(yesterdayStr)) {
        days++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Count consecutive weeks with at least one activity
  let weeks = 0;
  const weekCheck = new Date(today);
  // Align to Monday
  const dayOfWeek = weekCheck.getDay();
  weekCheck.setDate(weekCheck.getDate() - ((dayOfWeek + 6) % 7));
  weekCheck.setHours(0, 0, 0, 0);

  while (true) {
    const weekEnd = new Date(weekCheck);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const hasActivity = activities.some((a) => {
      const d = new Date(a.date);
      return d >= weekCheck && d < weekEnd;
    });

    if (hasActivity) {
      weeks++;
      weekCheck.setDate(weekCheck.getDate() - 7);
    } else {
      break;
    }
  }

  return {days, weeks};
};

export const calcRiskIntelligence = (
  snapshot: MetricsSnapshot,
  readiness?: {
    sleepHours?: number | null;
    readinessScore?: number | null;
    sessionRpe?: number | null;
  },
): RiskIntelligence => {
  const contributors: Array<{label: string; points: number}> = [];
  const actions = new Set<string>();

  if (snapshot.acwr != null) {
    if (snapshot.acwr > 1.5) {
      contributors.push({label: `ACWR ${snapshot.acwr.toFixed(2)} (high spike)`, points: 35});
      actions.add('Reduce high-intensity density this week.');
    } else if (snapshot.acwr > 1.3) {
      contributors.push({label: `ACWR ${snapshot.acwr.toFixed(2)} (elevated)`, points: 20});
      actions.add('Cap intensity and avoid adding extra volume.');
    }
  }

  if (snapshot.monotony != null) {
    if (snapshot.monotony > 2.2) {
      contributors.push({label: `Monotony ${snapshot.monotony.toFixed(2)} (very high)`, points: 25});
      actions.add('Increase day-to-day variation with a clear easy day.');
    } else if (snapshot.monotony > 1.8) {
      contributors.push({label: `Monotony ${snapshot.monotony.toFixed(2)} (high)`, points: 15});
      actions.add('Swap one moderate day for a recovery run.');
    }
  }

  if (snapshot.rampRate != null) {
    if (snapshot.rampRate > 15) {
      contributors.push({label: `Ramp rate ${snapshot.rampRate.toFixed(1)}%`, points: 20});
      actions.add('Hold weekly volume instead of progressing.');
    } else if (snapshot.rampRate > 10) {
      contributors.push({label: `Ramp rate ${snapshot.rampRate.toFixed(1)}% (watch)`, points: 10});
      actions.add('Use conservative progression until fatigue stabilizes.');
    }
  }

  if (snapshot.tsb != null && snapshot.tsb < -20) {
    contributors.push({label: `TSB ${snapshot.tsb.toFixed(1)} (deep fatigue)`, points: 20});
    actions.add('Insert an off-load or recovery day.');
  }

  if (readiness?.sleepHours != null && readiness.sleepHours < 6) {
    contributors.push({label: `Sleep ${readiness.sleepHours.toFixed(1)}h (low)`, points: 10});
    actions.add('Prioritize sleep and keep sessions aerobic.');
  }
  if (readiness?.readinessScore != null && readiness.readinessScore <= 2) {
    contributors.push({label: `Readiness score ${readiness.readinessScore}/5`, points: 10});
    actions.add('Replace hard session with low-impact recovery.');
  }
  if (readiness?.sessionRpe != null && readiness.sessionRpe >= 8) {
    contributors.push({label: `Recent RPE ${readiness.sessionRpe}/10`, points: 8});
    actions.add('Lower session load for 24-48h.');
  }

  const rawScore = contributors.reduce((sum, c) => sum + c.points, 0);
  const riskScore = Math.min(100, rawScore);
  const riskLevel: RiskLevel =
    riskScore >= 60 ? 'high' : riskScore >= 30 ? 'moderate' : 'low';

  if (actions.size === 0) {
    actions.add('Maintain current plan with normal progression checks.');
  }

  return {
    riskLevel,
    riskScore,
    topContributors: contributors
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((item) => item.label),
    recommendedActions: Array.from(actions).slice(0, 3),
  };
};
