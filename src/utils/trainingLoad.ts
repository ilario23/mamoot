// ============================================================
// COROS EvoLab–style Training Metrics
// TL (Training Load), BF (Base Fitness), LI (Load Impact),
// IT (Intensity Trend), ACWR
// Derived from activity summary data (no extra API calls needed)
// ============================================================

import type {ActivitySummary, UserSettings} from '@/lib/mockData';
import {getZoneForHr} from '@/lib/mockData';

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
 * Calculate COROS EvoLab–style fitness time series:
 *   BF (Base Fitness)   — ~42-day EWMA of daily TL
 *   LI (Load Impact)    — ~7-day  EWMA of daily TL
 *   IT (Intensity Trend) — LI - BF
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
): FitnessDataPoint[] => {
  const rawLoads = buildDailyLoads(activities, restHR, maxHR, zones);
  if (rawLoads.length === 0) return [];

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

  return result;
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
  activities: ActivitySummary[],
  restHR: number,
  maxHR: number,
  daysBack = 90,
  zones?: UserSettings['zones'],
): ACWRDataPoint[] => {
  const fitnessData = calcFitnessData(activities, restHR, maxHR, daysBack, zones);

  return fitnessData.map((d) => ({
    date: d.date,
    acwr: d.bf > 0 ? Number((d.li / d.bf).toFixed(2)) : 0,
    bf: d.bf,
    li: d.li,
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
