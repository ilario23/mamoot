// ============================================================
// Zone Breakdown Computation
// Computes per-zone time and distance from HR stream data,
// giving accurate zone distribution instead of using avgHr.
// ============================================================

import type {StreamPoint, UserSettings} from './activityModel';
import {getZoneForHr} from './activityModel';

// ----- Types -----

export interface ZoneTotals {
  /** Time spent in this zone (seconds) */
  time: number;
  /** Distance covered in this zone (km) */
  distance: number;
}

export interface ZoneBreakdown {
  /** Per-zone totals keyed by zone number (1–6) */
  zones: Record<number, ZoneTotals>;
  /** Hash of the zone settings used for computation (for cache invalidation) */
  settingsHash: string;
}

export interface AggregatedZoneTotals {
  /** Per-zone totals keyed by zone number (1–6) */
  zones: Record<number, ZoneTotals>;
  /** Total seconds across all zones */
  totalTime: number;
  /** Total distance (km) across all zones */
  totalDistance: number;
}

const ZONE_KEYS = [1, 2, 3, 4, 5, 6] as const;

// ----- Settings hash -----

/**
 * Creates a simple hash string from zone settings so we can detect
 * when the user changes their zone boundaries and invalidate cached breakdowns.
 */
export const hashZoneSettings = (zones: UserSettings['zones']): string => {
  const values = [
    zones.z1[0], zones.z1[1],
    zones.z2[0], zones.z2[1],
    zones.z3[0], zones.z3[1],
    zones.z4[0], zones.z4[1],
    zones.z5[0], zones.z5[1],
    zones.z6[0], zones.z6[1],
  ];
  return values.join('-');
};

// ----- Core computation -----

/**
 * Computes per-zone time and distance from an activity's HR stream data.
 * Iterates consecutive stream points and classifies each interval by its HR value.
 *
 * @param stream - Array of StreamPoint with time, distance, and heartrate
 * @param zones  - User's HR zone boundaries
 * @returns ZoneBreakdown with per-zone time (seconds) and distance (km)
 */
export const computeZoneBreakdown = (
  stream: StreamPoint[],
  zones: UserSettings['zones'],
): ZoneBreakdown => {
  const totals: Record<number, ZoneTotals> = {};
  ZONE_KEYS.forEach((z) => {
    totals[z] = {time: 0, distance: 0};
  });

  for (let i = 0; i < stream.length - 1; i++) {
    const current = stream[i];
    const next = stream[i + 1];

    // Skip data points with no HR sensor data
    if (current.heartrate <= 0) continue;

    const dt = next.time - current.time; // seconds
    const dd = (next.distance - current.distance) / 1000; // meters -> km

    // Skip unreasonable gaps (> 60s likely a pause)
    if (dt <= 0 || dt > 60) continue;

    const zone = getZoneForHr(current.heartrate, zones);
    totals[zone].time += dt;
    totals[zone].distance += Math.max(0, dd); // guard against negative distance
  }

  // Round values for cleaner storage
  ZONE_KEYS.forEach((z) => {
    totals[z].time = Math.round(totals[z].time);
    totals[z].distance = Number(totals[z].distance.toFixed(3));
  });

  return {
    zones: totals,
    settingsHash: hashZoneSettings(zones),
  };
};

// ----- Aggregation -----

/**
 * Aggregates multiple per-activity zone breakdowns into a single total.
 */
export const aggregateZoneBreakdowns = (
  breakdowns: ZoneBreakdown[],
): AggregatedZoneTotals => {
  const totals: Record<number, ZoneTotals> = {};
  ZONE_KEYS.forEach((z) => {
    totals[z] = {time: 0, distance: 0};
  });

  for (const breakdown of breakdowns) {
    for (const z of ZONE_KEYS) {
      const zoneData = breakdown.zones[z];
      if (zoneData) {
        totals[z].time += zoneData.time;
        totals[z].distance += zoneData.distance;
      }
    }
  }

  let totalTime = 0;
  let totalDistance = 0;
  ZONE_KEYS.forEach((z) => {
    totals[z].time = Math.round(totals[z].time);
    totals[z].distance = Number(totals[z].distance.toFixed(2));
    totalTime += totals[z].time;
    totalDistance += totals[z].distance;
  });

  return {
    zones: totals,
    totalTime,
    totalDistance: Number(totalDistance.toFixed(2)),
  };
};
