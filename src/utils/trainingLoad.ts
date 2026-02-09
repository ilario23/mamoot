// ============================================================
// Training Load Calculations — TRIMP, CTL, ATL, TSB, ACWR
// Derived from activity summary data (no extra API calls needed)
// ============================================================

import type {ActivitySummary} from '@/lib/mockData';

// ----- Types -----

export interface DailyLoad {
  date: string; // YYYY-MM-DD
  trimp: number;
}

export interface FitnessDataPoint {
  date: string; // YYYY-MM-DD
  ctl: number; // Chronic Training Load (Fitness)
  atl: number; // Acute Training Load (Fatigue)
  tsb: number; // Training Stress Balance (Form)
  trimp: number; // Raw daily TRIMP
}

export interface ACWRDataPoint {
  date: string;
  acwr: number; // Acute:Chronic Workload Ratio
  ctl: number;
  atl: number;
}

// ----- Constants -----

const CTL_DAYS = 42; // Chronic window
const ATL_DAYS = 7; // Acute window

// ----- Core Calculations -----

/**
 * Calculate TRIMP (Training Impulse) for a single activity.
 * Formula: duration (min) * (avgHR - restHR) / (maxHR - restHR)
 * Uses activity-level average HR — a simplified but effective proxy.
 */
export const calcTRIMP = (
  durationSeconds: number,
  avgHR: number,
  restHR: number,
  maxHR: number,
): number => {
  if (maxHR <= restHR || avgHR <= restHR || durationSeconds <= 0) return 0;
  const durationMin = durationSeconds / 60;
  const hrReserveRatio = (avgHR - restHR) / (maxHR - restHR);
  return durationMin * hrReserveRatio;
};

/**
 * Aggregate activities into daily TRIMP totals.
 * Multiple activities on the same day are summed.
 */
export const buildDailyLoads = (
  activities: ActivitySummary[],
  restHR: number,
  maxHR: number,
): DailyLoad[] => {
  const dailyMap = new Map<string, number>();

  for (const a of activities) {
    if (!a.avgHr || a.avgHr <= 0) continue;
    const trimp = calcTRIMP(a.duration, a.avgHr, restHR, maxHR);
    const existing = dailyMap.get(a.date) ?? 0;
    dailyMap.set(a.date, existing + trimp);
  }

  return Array.from(dailyMap.entries())
    .map(([date, trimp]) => ({date, trimp}))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Fill gaps in daily load data so every day has an entry (TRIMP = 0 for rest days).
 * This is critical for correct EWMA calculation.
 */
const fillDailyGaps = (
  loads: DailyLoad[],
  startDate: string,
  endDate: string,
): DailyLoad[] => {
  const loadMap = new Map(loads.map((l) => [l.date, l.trimp]));
  const filled: DailyLoad[] = [];

  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    filled.push({date: dateStr, trimp: loadMap.get(dateStr) ?? 0});
    current.setDate(current.getDate() + 1);
  }

  return filled;
};

/**
 * Calculate Fitness & Freshness time series (CTL, ATL, TSB).
 * Uses exponentially weighted moving average (EWMA).
 *
 * CTL decay = 1 - e^(-1/42) ≈ 0.0235
 * ATL decay = 1 - e^(-1/7) ≈ 0.1331
 */
export const calcFitnessData = (
  activities: ActivitySummary[],
  restHR: number,
  maxHR: number,
  daysBack = 180,
): FitnessDataPoint[] => {
  const rawLoads = buildDailyLoads(activities, restHR, maxHR);
  if (rawLoads.length === 0) return [];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Go back further than daysBack to warm up the EWMA
  const warmupDays = CTL_DAYS * 2;
  const earliest = rawLoads[0]?.date ?? todayStr;

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - daysBack - warmupDays);
  const startStr =
    startDate.toISOString().slice(0, 10) < earliest
      ? startDate.toISOString().slice(0, 10)
      : earliest;

  const dailyLoads = fillDailyGaps(rawLoads, startStr, todayStr);

  const ctlDecay = 1 - Math.exp(-1 / CTL_DAYS);
  const atlDecay = 1 - Math.exp(-1 / ATL_DAYS);

  let ctl = 0;
  let atl = 0;
  const result: FitnessDataPoint[] = [];

  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  for (const day of dailyLoads) {
    ctl = ctl + ctlDecay * (day.trimp - ctl);
    atl = atl + atlDecay * (day.trimp - atl);
    const tsb = ctl - atl;

    // Only output points within the requested window
    if (day.date >= cutoffStr) {
      result.push({
        date: day.date,
        ctl: Number(ctl.toFixed(1)),
        atl: Number(atl.toFixed(1)),
        tsb: Number(tsb.toFixed(1)),
        trimp: Number(day.trimp.toFixed(1)),
      });
    }
  }

  return result;
};

/**
 * Calculate Acute:Chronic Workload Ratio time series.
 * ACWR = ATL / CTL — a common injury risk metric.
 *
 * Risk zones:
 *   < 0.8  = under-trained / detraining
 *   0.8–1.3 = sweet spot
 *   1.3–1.5 = moderate risk
 *   > 1.5  = high injury risk
 */
export const calcACWRData = (
  activities: ActivitySummary[],
  restHR: number,
  maxHR: number,
  daysBack = 90,
): ACWRDataPoint[] => {
  const fitnessData = calcFitnessData(activities, restHR, maxHR, daysBack);

  return fitnessData.map((d) => ({
    date: d.date,
    acwr: d.ctl > 0 ? Number((d.atl / d.ctl).toFixed(2)) : 0,
    ctl: d.ctl,
    atl: d.atl,
  }));
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
