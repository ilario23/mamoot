// ============================================================
// Workout Label Engine — Rule-based activity classification
// ============================================================
//
// Analyzes Strava splits_metric data to:
// 1. Segment activities into warm-up / main work / cool-down phases
// 2. Classify the main work (easy, tempo, intervals, long, etc.)
// 3. Generate a compact human-readable label for the AI coach
//
// Entirely deterministic — no LLM calls.

import type {StravaSplit, StravaDetailedActivity} from './strava';
import type {UserSettings} from './activityModel';
import {getZoneForHr, formatPace} from './activityModel';

// ----- Types -----

export type WorkoutCategory =
  | 'easy'
  | 'tempo'
  | 'intervals'
  | 'long'
  | 'race'
  | 'recovery'
  | 'progression'
  | 'fartlek';

export interface WorkoutPhase {
  /** First km number (1-based) */
  startKm: number;
  /** Last km number (1-based) */
  endKm: number;
  /** Average pace in min/km */
  avgPace: number;
  /** Average heart rate (bpm) */
  avgHr: number;
  /** Dominant HR zone (1-6) */
  zone: number;
}

export interface IntervalDetail {
  /** Number of fast repetitions detected */
  reps: number;
  /** Average distance per rep in meters */
  repDistanceM: number;
  /** Average pace of fast reps in min/km */
  repPace: number;
  /** Dominant HR zone of fast reps */
  repZone: number;
  /** Average pace of recovery jogs in min/km */
  recoveryPace: number;
}

export interface WorkoutLabel {
  /** High-level workout category */
  category: WorkoutCategory;
  /** Compact human-readable summary, e.g. "5x1000m @ 4:10/km Z4" */
  summary: string;
  /** Warm-up phase, null if not detected */
  warmUp: WorkoutPhase | null;
  /** Main work phase (always present) */
  mainWork: WorkoutPhase;
  /** Cool-down phase, null if not detected */
  coolDown: WorkoutPhase | null;
  /** Interval details when category is 'intervals' */
  intervals?: IntervalDetail;
}

// ----- Internal helpers -----

/** Convert average_speed (m/s) to pace (min/km). */
const speedToPace = (speed: number): number => {
  if (speed <= 0) return 99;
  return 1000 / speed / 60;
};

/** Median of an array of numbers. */
const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

/** Coefficient of variation: stddev / mean. */
const coefficientOfVariation = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
};

/** Build a WorkoutPhase from a slice of processed splits. */
const buildPhase = (
  splits: ProcessedSplit[],
  zones: UserSettings['zones'],
): WorkoutPhase => {
  const totalTime = splits.reduce((s, sp) => s + sp.movingTime, 0);
  const avgPace =
    totalTime > 0
      ? totalTime / 60 / splits.reduce((s, sp) => s + sp.distanceKm, 0)
      : 0;

  const hrs = splits.filter((sp) => sp.avgHr > 0).map((sp) => sp.avgHr);
  const avgHr = hrs.length > 0 ? Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length) : 0;
  const zone = avgHr > 0 ? getZoneForHr(avgHr, zones) : 0;

  return {
    startKm: splits[0].km,
    endKm: splits[splits.length - 1].km,
    avgPace: Number(avgPace.toFixed(2)),
    avgHr,
    zone,
  };
};

// ----- Processed split (internal) -----

interface ProcessedSplit {
  km: number; // 1-based split number
  pace: number; // min/km
  avgHr: number; // bpm (0 if missing)
  movingTime: number; // seconds
  distanceKm: number; // actual distance in km
}

const processSplits = (splits: StravaSplit[]): ProcessedSplit[] =>
  splits.map((s) => ({
    km: s.split,
    pace: speedToPace(s.average_speed),
    avgHr: s.average_heartrate ?? 0,
    movingTime: s.moving_time,
    distanceKm: s.distance / 1000,
  }));

// ----- Phase Segmentation -----

interface SegmentedPhases {
  warmUp: ProcessedSplit[];
  mainWork: ProcessedSplit[];
  coolDown: ProcessedSplit[];
}

/**
 * Segment splits into warm-up / main work / cool-down.
 *
 * Algorithm:
 * 1. Compute core pace = median of the middle 60% of splits
 * 2. Warm-up = consecutive splits from start that are > 10% slower AND HR is > 5bpm lower
 * 3. Cool-down = consecutive splits from end with same condition
 * 4. Skip segmentation if <= 3 splits total
 */
const segmentPhases = (splits: ProcessedSplit[]): SegmentedPhases => {
  // Too short to segment meaningfully
  if (splits.length <= 3) {
    return {warmUp: [], mainWork: splits, coolDown: []};
  }

  // Compute core metrics from the middle 60%
  const trimCount = Math.max(1, Math.floor(splits.length * 0.2));
  const middleSplits = splits.slice(trimCount, splits.length - trimCount);

  // Fallback if trimming would leave nothing
  const coreSplits = middleSplits.length > 0 ? middleSplits : splits;
  const corePace = median(coreSplits.map((s) => s.pace));
  const coreHrs = coreSplits.filter((s) => s.avgHr > 0).map((s) => s.avgHr);
  const coreHr = coreHrs.length > 0 ? median(coreHrs) : 0;

  const paceThreshold = corePace * 1.10; // 10% slower
  const hrThreshold = coreHr > 0 ? coreHr - 5 : 0;

  // Detect warm-up from start
  let warmUpEnd = 0;
  for (let i = 0; i < splits.length; i++) {
    const isSlower = splits[i].pace > paceThreshold;
    const isLowerHr =
      coreHr === 0 || splits[i].avgHr === 0 || splits[i].avgHr < hrThreshold;

    if (isSlower && isLowerHr) {
      warmUpEnd = i + 1;
    } else {
      break;
    }
  }

  // Detect cool-down from end
  let coolDownStart = splits.length;
  for (let i = splits.length - 1; i >= warmUpEnd; i--) {
    const isSlower = splits[i].pace > paceThreshold;
    const isLowerHr =
      coreHr === 0 || splits[i].avgHr === 0 || splits[i].avgHr < hrThreshold;

    if (isSlower && isLowerHr) {
      coolDownStart = i;
    } else {
      break;
    }
  }

  // Ensure main work has at least 1 split
  if (coolDownStart <= warmUpEnd) {
    return {warmUp: [], mainWork: splits, coolDown: []};
  }

  return {
    warmUp: splits.slice(0, warmUpEnd),
    mainWork: splits.slice(warmUpEnd, coolDownStart),
    coolDown: splits.slice(coolDownStart),
  };
};

// ----- Interval Detection -----

interface IntervalAnalysis {
  isIntervals: boolean;
  detail?: IntervalDetail;
}

/**
 * Detect interval structure within main work splits.
 *
 * Groups consecutive splits into "fast" (below median pace) and "slow" (above).
 * If there are >= 2 fast groups, it's intervals.
 */
const detectIntervals = (
  mainSplits: ProcessedSplit[],
  zones: UserSettings['zones'],
): IntervalAnalysis => {
  if (mainSplits.length < 3) return {isIntervals: false};

  const medPace = median(mainSplits.map((s) => s.pace));

  // Group into fast/slow segments
  type Segment = {type: 'fast' | 'slow'; splits: ProcessedSplit[]};
  const segments: Segment[] = [];
  let current: Segment | null = null;

  for (const sp of mainSplits) {
    const type = sp.pace <= medPace ? 'fast' : 'slow';
    if (!current || current.type !== type) {
      current = {type, splits: [sp]};
      segments.push(current);
    } else {
      current.splits.push(sp);
    }
  }

  const fastSegments = segments.filter((seg) => seg.type === 'fast');
  const slowSegments = segments.filter((seg) => seg.type === 'slow');

  if (fastSegments.length < 2) return {isIntervals: false};

  // Compute rep metrics
  const repDistances = fastSegments.map((seg) =>
    seg.splits.reduce((s, sp) => s + sp.distanceKm * 1000, 0),
  );
  const repPaces = fastSegments.map(
    (seg) =>
      seg.splits.reduce((s, sp) => s + sp.movingTime, 0) /
      60 /
      seg.splits.reduce((s, sp) => s + sp.distanceKm, 0),
  );
  const repHrs = fastSegments
    .flatMap((seg) => seg.splits)
    .filter((sp) => sp.avgHr > 0)
    .map((sp) => sp.avgHr);

  const avgRepDistance = Math.round(
    repDistances.reduce((s, d) => s + d, 0) / repDistances.length,
  );
  const avgRepPace =
    repPaces.reduce((s, p) => s + p, 0) / repPaces.length;
  const avgRepHr =
    repHrs.length > 0
      ? Math.round(repHrs.reduce((s, h) => s + h, 0) / repHrs.length)
      : 0;

  const recoveryPaces = slowSegments.map(
    (seg) =>
      seg.splits.reduce((s, sp) => s + sp.movingTime, 0) /
      60 /
      seg.splits.reduce((s, sp) => s + sp.distanceKm, 0),
  );
  const avgRecoveryPace =
    recoveryPaces.length > 0
      ? recoveryPaces.reduce((s, p) => s + p, 0) / recoveryPaces.length
      : 0;

  return {
    isIntervals: true,
    detail: {
      reps: fastSegments.length,
      repDistanceM: avgRepDistance,
      repPace: Number(avgRepPace.toFixed(2)),
      repZone: avgRepHr > 0 ? getZoneForHr(avgRepHr, zones) : 0,
      recoveryPace: Number(avgRecoveryPace.toFixed(2)),
    },
  };
};

// ----- Progression Detection -----

/**
 * Check if splits show a consistent pace decrease (getting faster).
 * Tolerance: each split can be at most 5s/km slower than previous.
 */
const isProgression = (splits: ProcessedSplit[]): boolean => {
  if (splits.length < 3) return false;

  const toleranceMinPerKm = 5 / 60; // 5 seconds in min/km
  let progressCount = 0;

  for (let i = 1; i < splits.length; i++) {
    if (splits[i].pace <= splits[i - 1].pace + toleranceMinPerKm) {
      progressCount++;
    }
  }

  // At least 70% of splits should be faster than or equal to the previous
  return progressCount / (splits.length - 1) >= 0.7;
};

// ----- Main Classification -----

/**
 * Classify a detailed activity into a WorkoutLabel.
 *
 * @param detail  The full StravaDetailedActivity (must have splits_metric)
 * @param zones   Athlete HR zone settings
 * @param longRunThresholdKm  Distance threshold for "long run" classification (default 15)
 */
export const classifyWorkout = (
  detail: StravaDetailedActivity,
  zones: UserSettings['zones'],
  longRunThresholdKm = 15,
): WorkoutLabel | null => {
  const rawSplits = detail.splits_metric;
  if (!rawSplits || rawSplits.length === 0) return null;

  const processed = processSplits(rawSplits);
  const {warmUp, mainWork, coolDown} = segmentPhases(processed);

  if (mainWork.length === 0) return null;

  const mainPhase = buildPhase(mainWork, zones);
  const warmUpPhase = warmUp.length > 0 ? buildPhase(warmUp, zones) : null;
  const coolDownPhase = coolDown.length > 0 ? buildPhase(coolDown, zones) : null;

  const totalDistanceKm = processed.reduce((s, sp) => s + sp.distanceKm, 0);
  const mainDistanceKm = mainWork.reduce((s, sp) => s + sp.distanceKm, 0);
  const mainPaces = mainWork.map((s) => s.pace);
  const cv = coefficientOfVariation(mainPaces);

  // --- Priority-ordered classification ---

  // 1. Race (Strava flags it)
  if (detail.workout_type === 1) {
    const distLabel =
      totalDistanceKm >= 40
        ? 'Marathon'
        : totalDistanceKm >= 19
          ? 'Half Marathon'
          : totalDistanceKm >= 9
            ? '10K'
            : totalDistanceKm >= 4
              ? '5K'
              : `${totalDistanceKm.toFixed(1)}km`;
    return {
      category: 'race',
      summary: `Race: ${distLabel} @ ${formatPace(mainPhase.avgPace)}/km Z${mainPhase.zone}`,
      warmUp: warmUpPhase,
      mainWork: mainPhase,
      coolDown: coolDownPhase,
    };
  }

  // 2. Intervals (high pace variance)
  if (cv > 0.08) {
    const intervalResult = detectIntervals(mainWork, zones);
    if (intervalResult.isIntervals && intervalResult.detail) {
      const d = intervalResult.detail;
      // Round rep distance to nearest common value (200, 400, 600, 800, 1000, etc.)
      const roundedDist = roundRepDistance(d.repDistanceM);
      const distStr = roundedDist >= 1000 ? `${(roundedDist / 1000).toFixed(roundedDist % 1000 === 0 ? 0 : 1)}km` : `${roundedDist}m`;
      return {
        category: 'intervals',
        summary: `Intervals: ${d.reps}x${distStr} @ ${formatPace(d.repPace)}/km Z${d.repZone}`,
        warmUp: warmUpPhase,
        mainWork: mainPhase,
        coolDown: coolDownPhase,
        intervals: d,
      };
    }

    // High variance but no clear interval pattern = fartlek
    return {
      category: 'fartlek',
      summary: `Fartlek: ${mainDistanceKm.toFixed(1)}km @ ${formatPace(mainPhase.avgPace)}/km Z${mainPhase.zone}`,
      warmUp: warmUpPhase,
      mainWork: mainPhase,
      coolDown: coolDownPhase,
    };
  }

  // 3. Progression
  if (isProgression(mainWork)) {
    const startPace = mainWork[0].pace;
    const endPace = mainWork[mainWork.length - 1].pace;
    return {
      category: 'progression',
      summary: `Progression: ${mainDistanceKm.toFixed(1)}km ${formatPace(startPace)} -> ${formatPace(endPace)}/km`,
      warmUp: warmUpPhase,
      mainWork: mainPhase,
      coolDown: coolDownPhase,
    };
  }

  // 4. Tempo / Threshold (Z3-Z4, steady)
  if (mainPhase.zone >= 3 && mainPhase.zone <= 4) {
    const mainDurationMin = Math.round(
      mainWork.reduce((s, sp) => s + sp.movingTime, 0) / 60,
    );
    return {
      category: 'tempo',
      summary: `Tempo: ${mainDurationMin}min @ ${formatPace(mainPhase.avgPace)}/km Z${mainPhase.zone}`,
      warmUp: warmUpPhase,
      mainWork: mainPhase,
      coolDown: coolDownPhase,
    };
  }

  // 5. Recovery (short + very slow + Z1)
  if (totalDistanceKm < 5 && mainPhase.zone <= 1) {
    return {
      category: 'recovery',
      summary: `Recovery: ${totalDistanceKm.toFixed(1)}km @ ${formatPace(mainPhase.avgPace)}/km Z1`,
      warmUp: warmUpPhase,
      mainWork: mainPhase,
      coolDown: coolDownPhase,
    };
  }

  // 6. Long Run (Z1-Z2, above distance threshold)
  if (mainPhase.zone <= 2 && totalDistanceKm >= longRunThresholdKm) {
    return {
      category: 'long',
      summary: `Long Run: ${totalDistanceKm.toFixed(1)}km @ ${formatPace(mainPhase.avgPace)}/km Z${mainPhase.zone}`,
      warmUp: warmUpPhase,
      mainWork: mainPhase,
      coolDown: coolDownPhase,
    };
  }

  // 7. Easy Run (default steady Z1-Z2)
  return {
    category: 'easy',
    summary: `Easy: ${totalDistanceKm.toFixed(1)}km @ ${formatPace(mainPhase.avgPace)}/km Z${mainPhase.zone}`,
    warmUp: warmUpPhase,
    mainWork: mainPhase,
    coolDown: coolDownPhase,
  };
};

// ----- Helpers for label formatting -----

/** Round a rep distance to the nearest common training distance. */
const roundRepDistance = (meters: number): number => {
  const common = [100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 1600, 2000, 3000, 5000];
  let closest = common[0];
  let minDiff = Math.abs(meters - common[0]);
  for (const d of common) {
    const diff = Math.abs(meters - d);
    if (diff < minDiff) {
      minDiff = diff;
      closest = d;
    }
  }
  return closest;
};

/**
 * Format a WorkoutLabel into a compact single-line string for the AI coach.
 * Includes warm-up and cool-down info when present.
 *
 * Example: "Intervals: 5x1000m @ 4:10/km Z4 | WU 2km 5:40/km | CD 1km 5:50/km"
 */
export const formatLabelForAI = (label: WorkoutLabel): string => {
  const parts = [label.summary];

  if (label.warmUp) {
    const dist = label.warmUp.endKm - label.warmUp.startKm + 1;
    parts.push(`WU ${dist}km ${formatPace(label.warmUp.avgPace)}/km`);
  }

  if (label.coolDown) {
    const dist = label.coolDown.endKm - label.coolDown.startKm + 1;
    parts.push(`CD ${dist}km ${formatPace(label.coolDown.avgPace)}/km`);
  }

  return parts.join(' | ');
};
