import {describe, expect, it} from 'vitest';
import {autoGeneratePaceZones} from '@/lib/paceZoneAutoGeneration';
import type {StravaDetailedActivity, StravaSummaryActivity} from '@/lib/strava';

const zones = {
  z1: [90, 120] as [number, number],
  z2: [121, 140] as [number, number],
  z3: [141, 155] as [number, number],
  z4: [156, 168] as [number, number],
  z5: [169, 182] as [number, number],
  z6: [183, 195] as [number, number],
};

const baseRun = (id: number, avgHr: number, avgSpeed: number): StravaSummaryActivity => ({
  id,
  name: `Run ${id}`,
  type: 'Run',
  sport_type: 'Run',
  distance: 10_000,
  moving_time: 3000,
  elapsed_time: 3150,
  total_elevation_gain: 40,
  start_date: '2026-03-01T07:00:00Z',
  start_date_local: `2026-03-0${(id % 7) + 1}T07:00:00Z`,
  timezone: 'UTC',
  average_speed: avgSpeed,
  max_speed: avgSpeed + 0.8,
  has_heartrate: true,
  average_heartrate: avgHr,
  max_heartrate: avgHr + 10,
});

const detailWithSplits = (
  run: StravaSummaryActivity,
  splitHr: number,
  splitSpeed: number,
): StravaDetailedActivity => ({
  ...run,
  description: '',
  device_name: 'watch',
  calories: 600,
  segment_efforts: [],
  splits_metric: [
    {
      distance: 1000,
      elapsed_time: 320,
      elevation_difference: 8,
      moving_time: 315,
      average_speed: splitSpeed,
      pace_zone: 0,
      split: 1,
      average_heartrate: splitHr,
    },
    {
      distance: 1000,
      elapsed_time: 322,
      elevation_difference: 6,
      moving_time: 320,
      average_speed: splitSpeed,
      pace_zone: 0,
      split: 2,
      average_heartrate: splitHr,
    },
  ],
  laps: [],
  best_efforts: [],
});

describe('autoGeneratePaceZones', () => {
  it('produces auto zones when enough split evidence exists', () => {
    const runs = Array.from({length: 8}, (_, index) =>
      baseRun(index + 1, 132, 3.0 + index * 0.03),
    );
    const details = new Map<number, StravaDetailedActivity>(
      runs.map((run, index) => [
        run.id,
        detailWithSplits(run, 132, 3.0 + index * 0.03),
      ]),
    );

    const result = autoGeneratePaceZones({
      zones,
      runs,
      runDetailsById: details,
      nowMs: new Date('2026-03-10T00:00:00Z').getTime(),
    });

    expect(result.paceZones.z2.source).toBe('auto');
    expect(result.paceZones.z2.lowerSecPerKm).not.toBeNull();
    expect(result.paceZones.z2.upperSecPerKm).not.toBeNull();
    expect(result.paceZones.z2.confidence).toBeGreaterThan(0.35);
    expect(result.diagnostics.splitSamples).toBeGreaterThan(0);
    expect(result.paceZones.z1.lowerSecPerKm).toBeNull();
    expect(result.paceZones.z6.upperSecPerKm).toBeNull();
  });

  it('uses low-confidence inferred pace when evidence is sparse', () => {
    const run = baseRun(10, 150, 3.3);
    const result = autoGeneratePaceZones({
      zones,
      runs: [run],
      runDetailsById: new Map(),
      nowMs: new Date('2026-03-10T00:00:00Z').getTime(),
    });

    expect(result.paceZones.z3.source).toBe('auto');
    expect(result.paceZones.z3.lowerSecPerKm).not.toBeNull();
    expect(result.paceZones.z3.upperSecPerKm).not.toBeNull();
    expect((result.paceZones.z3.confidence ?? 1)).toBeLessThanOrEqual(0.35);
  });

  it('keeps six-zone output by inferring missing z6 when needed', () => {
    const runs = Array.from({length: 7}, (_, index) =>
      baseRun(index + 20, 171, 3.8 + index * 0.05),
    );
    const details = new Map<number, StravaDetailedActivity>(
      runs.map((run, index) => [
        run.id,
        detailWithSplits(run, 171, 3.8 + index * 0.05),
      ]),
    );
    const result = autoGeneratePaceZones({
      zones,
      runs,
      runDetailsById: details,
      nowMs: new Date('2026-03-10T00:00:00Z').getTime(),
    });

    expect(result.paceZones.z5.source).toBe('auto');
    expect(result.paceZones.z6.source).toBe('auto');
    expect(result.paceZones.z6.lowerSecPerKm).not.toBeNull();
    expect(result.paceZones.z6.upperSecPerKm).toBeNull();
    expect(result.paceZones.z6.lowerSecPerKm).toBe(result.paceZones.z5.lowerSecPerKm);
  });

  it('enforces contiguous boundaries without pace gaps between zones', () => {
    const runs = Array.from({length: 12}, (_, index) =>
      baseRun(index + 100, 145 + (index % 3) * 8, 2.9 + index * 0.04),
    );
    const details = new Map<number, StravaDetailedActivity>(
      runs.map((run, index) => [
        run.id,
        detailWithSplits(run, 130 + (index % 5) * 10, 2.95 + index * 0.03),
      ]),
    );
    const result = autoGeneratePaceZones({
      zones,
      runs,
      runDetailsById: details,
      nowMs: new Date('2026-03-10T00:00:00Z').getTime(),
    });

    expect(result.paceZones.z1.upperSecPerKm).toBe(result.paceZones.z2.upperSecPerKm);
    expect(result.paceZones.z2.lowerSecPerKm).toBe(result.paceZones.z3.upperSecPerKm);
    expect(result.paceZones.z3.lowerSecPerKm).toBe(result.paceZones.z4.upperSecPerKm);
    expect(result.paceZones.z4.lowerSecPerKm).toBe(result.paceZones.z5.upperSecPerKm);
    expect(result.paceZones.z5.lowerSecPerKm).toBe(result.paceZones.z6.lowerSecPerKm);
  });

  it('keeps an ordered full boundary chain across all six zones', () => {
    const runs = Array.from({length: 16}, (_, index) =>
      baseRun(index + 300, 126 + (index % 6) * 10, 2.7 + index * 0.05),
    );
    const details = new Map<number, StravaDetailedActivity>(
      runs.map((run, index) => [
        run.id,
        detailWithSplits(run, 120 + (index % 6) * 11, 2.75 + index * 0.05),
      ]),
    );
    const result = autoGeneratePaceZones({
      zones,
      runs,
      runDetailsById: details,
      nowMs: new Date('2026-03-10T00:00:00Z').getTime(),
    });

    const b1 = result.paceZones.z1.upperSecPerKm ?? 0;
    const b2 = result.paceZones.z2.lowerSecPerKm ?? 0;
    const b3 = result.paceZones.z3.lowerSecPerKm ?? 0;
    const b4 = result.paceZones.z4.lowerSecPerKm ?? 0;
    const b5 = result.paceZones.z5.lowerSecPerKm ?? 0;
    const b6 = result.paceZones.z6.lowerSecPerKm ?? 0;

    expect(b1).toBeGreaterThan(b2);
    expect(b2).toBeGreaterThan(b3);
    expect(b3).toBeGreaterThan(b4);
    expect(b4).toBeGreaterThan(b5);
    expect(b5).toBeGreaterThanOrEqual(b6);
    expect(result.paceZones.z1.lowerSecPerKm).toBeNull();
    expect(result.paceZones.z6.upperSecPerKm).toBeNull();
  });
});
