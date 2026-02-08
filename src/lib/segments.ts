// ============================================================
// Segments — Compute segment performance data from synced efforts
// ============================================================

import type {SegmentEffortWithMeta} from '@/hooks/useSyncActivityDetails';
import type {TimePeriod} from './records';
import {getTimePeriodStartDate} from './records';

// ----- Types -----

export interface SegmentSummary {
  /** Strava segment ID */
  segmentId: number;
  /** Segment name */
  name: string;
  /** Segment distance in meters */
  distance: number;
  /** Average grade (%) */
  averageGrade: number;
  /** Maximum grade (%) */
  maximumGrade: number;
  /** Elevation high in meters */
  elevationHigh: number;
  /** Elevation low in meters */
  elevationLow: number;
  /** City */
  city: string;
  /** State */
  state: string;
  /** Climb category (0 = no category, 1-5) */
  climbCategory: number;
  /** Whether the athlete has starred this segment */
  starred: boolean;
  /** Total number of efforts by this athlete */
  effortCount: number;
  /** The athlete's best (fastest) effort */
  bestEffort: SegmentEffortWithMeta;
  /** The athlete's most recent effort */
  lastEffort: SegmentEffortWithMeta;
  /** All efforts sorted by date (oldest first) */
  efforts: SegmentEffortWithMeta[];
}

export interface SegmentProgressionPoint {
  /** Date of the effort (YYYY-MM-DD) */
  date: string;
  /** Pace in min/km */
  pace: number;
  /** Elapsed time in seconds */
  time: number;
  /** Average heart rate (if available) */
  avgHr: number | null;
  /** Parent activity name */
  activityName: string;
}

// ----- Grouping helpers -----

/**
 * Groups all segment efforts by segment ID and returns a map of SegmentSummary.
 * Each summary contains aggregated info about the segment plus all efforts.
 */
export const groupEffortsBySegment = (
  efforts: SegmentEffortWithMeta[],
  period: TimePeriod = 'all',
): SegmentSummary[] => {
  const filtered = filterEffortsByPeriod(efforts, period);

  const map = new Map<number, SegmentEffortWithMeta[]>();

  for (const effort of filtered) {
    const segId = effort.segment.id;
    const existing = map.get(segId);
    if (existing) {
      existing.push(effort);
    } else {
      map.set(segId, [effort]);
    }
  }

  const summaries: SegmentSummary[] = [];

  for (const [segmentId, segEfforts] of map) {
    // Sort by date ascending
    const sorted = [...segEfforts].sort(
      (a, b) =>
        new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime(),
    );

    const best = sorted.reduce((prev, curr) =>
      curr.elapsed_time < prev.elapsed_time ? curr : prev,
    );

    const last = sorted[sorted.length - 1];
    const seg = sorted[0].segment;

    summaries.push({
      segmentId,
      name: seg.name,
      distance: seg.distance,
      averageGrade: seg.average_grade,
      maximumGrade: seg.maximum_grade,
      elevationHigh: seg.elevation_high,
      elevationLow: seg.elevation_low,
      city: seg.city,
      state: seg.state,
      climbCategory: seg.climb_category,
      starred: seg.starred,
      effortCount: sorted.length,
      bestEffort: best,
      lastEffort: last,
      efforts: sorted,
    });
  }

  // Sort by effort count descending (most run segments first)
  summaries.sort((a, b) => b.effortCount - a.effortCount);

  return summaries;
};

// ----- Progression -----

/**
 * Compute progression data for a single segment — pace/time across all attempts.
 */
export const computeSegmentProgression = (
  efforts: SegmentEffortWithMeta[],
): SegmentProgressionPoint[] => {
  const sorted = [...efforts].sort(
    (a, b) =>
      new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime(),
  );

  return sorted.map((e) => {
    const distKm = e.distance / 1000;
    const pace = distKm > 0 ? e.elapsed_time / 60 / distKm : 0;

    return {
      date: e.activityDate,
      pace: Number(pace.toFixed(2)),
      time: e.elapsed_time,
      avgHr: e.average_heartrate ?? null,
      activityName: e.activityName,
    };
  });
};

// ----- Best effort -----

/**
 * Returns the PR (fastest) effort for a set of segment efforts.
 */
export const computeSegmentBest = (
  efforts: SegmentEffortWithMeta[],
): SegmentEffortWithMeta | null => {
  if (efforts.length === 0) return null;

  return efforts.reduce((prev, curr) =>
    curr.elapsed_time < prev.elapsed_time ? curr : prev,
  );
};

// ----- Filtering -----

const filterEffortsByPeriod = (
  efforts: SegmentEffortWithMeta[],
  period: TimePeriod,
): SegmentEffortWithMeta[] => {
  const startDate = getTimePeriodStartDate(period);
  if (!startDate) return efforts;
  return efforts.filter((e) => new Date(e.activityDate) >= startDate);
};

// ----- Search helpers -----

/**
 * Filter segment summaries by a search query (name or city match).
 */
export const filterSegmentsByQuery = (
  segments: SegmentSummary[],
  query: string,
): SegmentSummary[] => {
  if (!query.trim()) return segments;

  const lower = query.toLowerCase();
  return segments.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.city.toLowerCase().includes(lower),
  );
};
