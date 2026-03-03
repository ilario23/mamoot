// ============================================================
// Records — Compute personal bests from Strava best_efforts data
// ============================================================

import type { ActivityType } from "./mockData";
import type { BestEffortWithMeta } from "@/hooks/useSyncActivityDetails";
import { mapSportType } from "./strava";

// ----- Types -----

export type TimePeriod = "4w" | "3m" | "6m" | "ytd" | "all";

/** A standard distance bucket that maps to Strava best_effort names */
export interface DistanceBucket {
  key: string;
  label: string;
  /** Strava best_effort name(s) — matched case-insensitively */
  effortNames: string[];
  distanceMeters: number;
}

export interface DistanceRecord {
  bucket: DistanceBucket;
  effort: BestEffortWithMeta;
  /** Locally computed rank among matching efforts for this bucket. */
  computedRank: number | null;
}

export interface ProgressionPoint {
  date: string;
  pace: number; // min/km
  activityName: string;
  duration: number; // seconds
}

// ----- Distance buckets per activity type -----
// Strava's standard best_effort names:
// "400m", "1/2 mile", "1k", "1 mile", "2 mile", "5k", "10k",
// "15k", "10 mile", "20k", "Half-Marathon", "30k", "Marathon", "50k"

const RUN_BUCKETS: DistanceBucket[] = [
  { key: "400m", label: "400m", effortNames: ["400m"], distanceMeters: 400 },
  { key: "1k", label: "1K", effortNames: ["1k"], distanceMeters: 1000 },
  { key: "1mile", label: "1 Mile", effortNames: ["1 mile"], distanceMeters: 1609 },
  { key: "5k", label: "5K", effortNames: ["5k"], distanceMeters: 5000 },
  { key: "10k", label: "10K", effortNames: ["10k"], distanceMeters: 10000 },
  { key: "half", label: "Half Marathon", effortNames: ["half-marathon"], distanceMeters: 21097 },
  { key: "marathon", label: "Marathon", effortNames: ["marathon"], distanceMeters: 42195 },
];

// Ride / Hike / Swim don't have Strava best_efforts — keep bucket matching for those
const RIDE_BUCKETS: DistanceBucket[] = [
  { key: "20k", label: "20K", effortNames: [], distanceMeters: 20000 },
  { key: "50k", label: "50K", effortNames: [], distanceMeters: 50000 },
  { key: "100k", label: "100K", effortNames: [], distanceMeters: 100000 },
  { key: "160k", label: "Century", effortNames: [], distanceMeters: 160000 },
];

const HIKE_BUCKETS: DistanceBucket[] = [
  { key: "5k", label: "5K", effortNames: [], distanceMeters: 5000 },
  { key: "10k", label: "10K", effortNames: [], distanceMeters: 10000 },
  { key: "15k", label: "15K", effortNames: [], distanceMeters: 15000 },
  { key: "20k", label: "20K", effortNames: [], distanceMeters: 20000 },
];

const SWIM_BUCKETS: DistanceBucket[] = [
  { key: "500m", label: "500m", effortNames: [], distanceMeters: 500 },
  { key: "1k", label: "1K", effortNames: [], distanceMeters: 1000 },
  { key: "2k", label: "2K", effortNames: [], distanceMeters: 2000 },
  { key: "5k", label: "5K", effortNames: [], distanceMeters: 5000 },
];

export const BUCKETS_BY_TYPE: Record<ActivityType, DistanceBucket[]> = {
  Run: RUN_BUCKETS,
  Ride: RIDE_BUCKETS,
  Hike: HIKE_BUCKETS,
  Swim: SWIM_BUCKETS,
};

/** Whether a type uses Strava best_efforts (has effortNames) */
export const typeUsesBestEfforts = (type: ActivityType): boolean => {
  return BUCKETS_BY_TYPE[type].some((b) => b.effortNames.length > 0);
};

// ----- Time period labels -----

export const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "4w", label: "4 Weeks" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All Time" },
];

// ----- Filtering helpers -----

export const getTimePeriodStartDate = (period: TimePeriod): Date | null => {
  if (period === "all") return null;

  const now = new Date();

  switch (period) {
    case "4w": {
      const d = new Date(now);
      d.setDate(d.getDate() - 28);
      return d;
    }
    case "3m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d;
    }
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d;
    }
    case "ytd": {
      return new Date(now.getFullYear(), 0, 1);
    }
    default:
      return null;
  }
};

const filterEffortsByPeriod = (
  efforts: BestEffortWithMeta[],
  period: TimePeriod
): BestEffortWithMeta[] => {
  const startDate = getTimePeriodStartDate(period);
  if (!startDate) return efforts;
  return efforts.filter((e) => new Date(e.activityDate) >= startDate);
};

const filterEffortsByType = (
  efforts: BestEffortWithMeta[],
  type: ActivityType
): BestEffortWithMeta[] => {
  return efforts.filter((e) => mapSportType(e.activitySportType) === type);
};

// ----- Effort matching -----

const matchesEffortName = (
  effort: BestEffortWithMeta,
  bucket: DistanceBucket
): boolean => {
  if (bucket.effortNames.length === 0) return false;
  const name = effort.name.toLowerCase();
  return bucket.effortNames.some((n) => n.toLowerCase() === name);
};

const compareEffortsForRank = (
  a: BestEffortWithMeta,
  b: BestEffortWithMeta
): number => {
  if (a.elapsed_time !== b.elapsed_time) {
    return a.elapsed_time - b.elapsed_time;
  }

  const aDate = new Date(a.activityDate).getTime();
  const bDate = new Date(b.activityDate).getTime();
  if (aDate !== bDate) {
    return aDate - bDate;
  }

  return a.id - b.id;
};

const computeEffortRanksByBucket = (
  efforts: BestEffortWithMeta[],
  buckets: DistanceBucket[]
): Map<number, number> => {
  const rankByEffortId = new Map<number, number>();

  for (const bucket of buckets) {
    const sorted = efforts
      .filter((e) => matchesEffortName(e, bucket))
      .sort(compareEffortsForRank);

    sorted.forEach((effort, idx) => {
      rankByEffortId.set(effort.id, idx + 1);
    });
  }

  return rankByEffortId;
};

// ----- Fallback: bucket matching for types without best_efforts -----

import type { ActivitySummary } from "./mockData";

const TOLERANCE_PCT = 0.10;

const matchesBucketByDistance = (
  activity: ActivitySummary,
  bucket: DistanceBucket
): boolean => {
  const distKm = activity.distance;
  const bucketKm = bucket.distanceMeters / 1000;
  const tolerance = bucketKm * TOLERANCE_PCT;
  return distKm >= bucketKm - tolerance && distKm <= bucketKm + tolerance;
};

// ----- Record computation from best_efforts -----

export const computeRecordsFromEfforts = (
  efforts: BestEffortWithMeta[],
  activityType: ActivityType,
  period: TimePeriod
): (DistanceRecord | null)[] => {
  const buckets = BUCKETS_BY_TYPE[activityType];
  const filtered = filterEffortsByType(
    filterEffortsByPeriod(efforts, period),
    activityType
  );
  const rankByEffortId = computeEffortRanksByBucket(filtered, buckets);

  return buckets.map((bucket) => {
    const matching = filtered.filter((e) => matchesEffortName(e, bucket));
    if (matching.length === 0) return null;

    // Best = lowest elapsed_time (fastest)
    const best = matching.reduce((prev, curr) =>
      curr.elapsed_time < prev.elapsed_time ? curr : prev
    );

    return {
      bucket,
      effort: best,
      computedRank: rankByEffortId.get(best.id) ?? null,
    };
  });
};

// ----- Fallback record computation from activities (for Ride/Hike/Swim) -----

export const computeRecordsFromActivities = (
  activities: ActivitySummary[],
  activityType: ActivityType,
  period: TimePeriod
): (DistanceRecord | null)[] => {
  const buckets = BUCKETS_BY_TYPE[activityType];
  const startDate = getTimePeriodStartDate(period);

  const filtered = activities
    .filter((a) => a.type === activityType)
    .filter((a) => !startDate || new Date(a.date) >= startDate);

  return buckets.map((bucket) => {
    const matching = filtered.filter((a) =>
      matchesBucketByDistance(a, bucket)
    );
    if (matching.length === 0) return null;

    const best = matching.reduce((prev, curr) =>
      curr.duration < prev.duration ? curr : prev
    );

    // Convert ActivitySummary to a pseudo BestEffortWithMeta
    const effort: BestEffortWithMeta = {
      id: Number(best.id),
      resource_state: 2,
      name: bucket.label,
      activity: { id: Number(best.id), resource_state: 1 },
      athlete: { id: 0, resource_state: 1 },
      elapsed_time: best.duration,
      moving_time: best.duration,
      start_date: best.date,
      start_date_local: best.date,
      distance: best.distance * 1000,
      start_index: 0,
      end_index: 0,
      pr_rank: null,
      achievements: [],
      activitySportType: best.type,
      activityDate: best.date,
      activityName: best.name,
    };

    return { bucket, effort, computedRank: null };
  });
};

// ----- Combined record computation -----

export const computeRecords = (
  efforts: BestEffortWithMeta[],
  activities: ActivitySummary[],
  activityType: ActivityType,
  period: TimePeriod
): (DistanceRecord | null)[] => {
  if (typeUsesBestEfforts(activityType)) {
    return computeRecordsFromEfforts(efforts, activityType, period);
  }
  return computeRecordsFromActivities(activities, activityType, period);
};

// ----- Progression data -----

export const computeProgression = (
  efforts: BestEffortWithMeta[],
  activities: ActivitySummary[],
  activityType: ActivityType,
  period: TimePeriod,
  bucketKey: string
): ProgressionPoint[] => {
  const buckets = BUCKETS_BY_TYPE[activityType];
  const bucket = buckets.find((b) => b.key === bucketKey);
  if (!bucket) return [];

  if (typeUsesBestEfforts(activityType)) {
    const filtered = filterEffortsByType(
      filterEffortsByPeriod(efforts, period),
      activityType
    );

    return filtered
      .filter((e) => matchesEffortName(e, bucket))
      .sort(
        (a, b) =>
          new Date(a.activityDate).getTime() -
          new Date(b.activityDate).getTime()
      )
      .map((e) => ({
        date: e.activityDate,
        pace: e.elapsed_time / 60 / (e.distance / 1000),
        activityName: e.activityName,
        duration: e.elapsed_time,
      }));
  }

  // Fallback for non-best-effort types
  const startDate = getTimePeriodStartDate(period);
  const filtered = activities
    .filter((a) => a.type === activityType)
    .filter((a) => !startDate || new Date(a.date) >= startDate)
    .filter((a) => matchesBucketByDistance(a, bucket))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return filtered.map((a) => ({
    date: a.date,
    pace: a.avgPace,
    activityName: a.name,
    duration: a.duration,
  }));
};

// ----- Get unique activity types present in data -----

export const getAvailableActivityTypes = (
  activities: ActivitySummary[]
): ActivityType[] => {
  const types = new Set(activities.map((a) => a.type));
  const order: ActivityType[] = ["Run", "Ride", "Hike", "Swim"];
  return order.filter((t) => types.has(t));
};

// ----- Compute all progressions for an activity type -----

export const computeAllProgressions = (
  efforts: BestEffortWithMeta[],
  activities: ActivitySummary[],
  activityType: ActivityType,
  period: TimePeriod
): Record<string, ProgressionPoint[]> => {
  const buckets = BUCKETS_BY_TYPE[activityType];
  const result: Record<string, ProgressionPoint[]> = {};

  for (const bucket of buckets) {
    const points = computeProgression(
      efforts,
      activities,
      activityType,
      period,
      bucket.key
    );
    if (points.length >= 2) {
      result[bucket.key] = points;
    }
  }

  return result;
};
