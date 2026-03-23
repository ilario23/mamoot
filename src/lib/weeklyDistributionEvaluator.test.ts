import {describe, expect, it} from 'vitest';
import {
  evaluateUnifiedWeeklyDistribution,
  evaluateCoachWeeklyDistribution,
  suggestCoachRepairDates,
} from './weeklyDistributionEvaluator';
import type {UnifiedSession} from './cacheTypes';
import type {CoachWeekOutput, RunStep} from './weeklyPlanSchema';

const BASE_WEEK = [
  '2026-03-02',
  '2026-03-03',
  '2026-03-04',
  '2026-03-05',
  '2026-03-06',
  '2026-03-07',
  '2026-03-08',
];

const withRuns = (
  runs: Array<UnifiedSession['run'] | undefined>,
): UnifiedSession[] =>
  BASE_WEEK.map((date, index) => ({
    day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index],
    date,
    ...(runs[index] ? {run: runs[index]} : {}),
  }));

describe('weekly distribution evaluator', () => {
  it('flags adjacent hard days as a critical issue', () => {
    const sessions = withRuns([
      {type: 'intervals', description: 'VO2', plannedDurationMin: 50},
      {type: 'tempo', description: 'Threshold', plannedDurationMin: 45},
      {type: 'easy', description: 'Recovery', plannedDurationMin: 40},
      undefined,
      {type: 'easy', description: 'Aerobic', plannedDurationMin: 45},
      {type: 'easy', description: 'Easy', plannedDurationMin: 55},
      undefined,
    ]);

    const result = evaluateUnifiedWeeklyDistribution(sessions);
    expect(result.issues.some((issue) => issue.code === 'adjacent_hard_days')).toBe(true);
  });

  it('flags weekend load spikes beyond policy threshold', () => {
    const sessions = withRuns([
      {type: 'easy', description: 'Easy', plannedDurationMin: 35},
      {type: 'easy', description: 'Easy', plannedDurationMin: 30},
      undefined,
      {type: 'easy', description: 'Easy', plannedDurationMin: 35},
      undefined,
      {type: 'long', description: 'Long run', plannedDurationMin: 110},
      {type: 'tempo', description: 'Tempo', plannedDurationMin: 80},
    ]);

    const result = evaluateUnifiedWeeklyDistribution(sessions);
    expect(result.issues.some((issue) => issue.code === 'weekend_load_too_high')).toBe(true);
  });

  it('penalizes plans where easy minutes are not dominant', () => {
    const sessions = withRuns([
      {type: 'intervals', description: 'VO2', plannedDurationMin: 60},
      {type: 'tempo', description: 'Tempo', plannedDurationMin: 55},
      undefined,
      {type: 'steady', description: 'Steady', plannedDurationMin: 50},
      undefined,
      {type: 'easy', description: 'Easy', plannedDurationMin: 35},
      undefined,
    ]);

    const result = evaluateUnifiedWeeklyDistribution(sessions);
    expect(result.issues.some((issue) => issue.code === 'easy_minutes_not_dominant')).toBe(true);
    expect(result.score).toBeLessThan(70);
  });
});

const emptyPhases = (): {warmupSteps: RunStep[]; mainSteps: RunStep[]; cooldownSteps: RunStep[]} => ({
  warmupSteps: [],
  mainSteps: [],
  cooldownSteps: [],
});

const rs = (label: string): RunStep => ({
  label,
  durationMin: null,
  distanceKm: null,
  targetPace: null,
  targetZone: null,
  targetZoneId: null,
  recovery: null,
  repeatCount: null,
  notes: null,
  stepKind: null,
  subSteps: null,
});

const runPhases = () => ({
  warmupSteps: [rs('W')],
  mainSteps: [rs('M')],
  cooldownSteps: [rs('C')],
});

const makeCoachWeekAdjacentHard = (): CoachWeekOutput => ({
  sessions: [
    {day: 'Monday', date: BASE_WEEK[0], type: 'intervals', description: 'A', ...runPhases(), duration: '50 min', plannedDurationMin: 50, plannedDistanceKm: 8, targetPace: null, targetZone: 'Z4', targetZoneId: 4, notes: null},
    {day: 'Tuesday', date: BASE_WEEK[1], type: 'tempo', description: 'B', ...runPhases(), duration: '45 min', plannedDurationMin: 45, plannedDistanceKm: 7, targetPace: null, targetZone: 'Z4', targetZoneId: 4, notes: null},
    {day: 'Wednesday', date: BASE_WEEK[2], type: 'easy', description: 'C', ...runPhases(), duration: '40 min', plannedDurationMin: 40, plannedDistanceKm: 6, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
    {day: 'Thursday', date: BASE_WEEK[3], type: 'rest', description: 'R', ...emptyPhases(), duration: null, plannedDurationMin: null, plannedDistanceKm: null, targetPace: null, targetZone: null, targetZoneId: null, notes: null},
    {day: 'Friday', date: BASE_WEEK[4], type: 'easy', description: 'D', ...runPhases(), duration: '40 min', plannedDurationMin: 40, plannedDistanceKm: 6, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
    {day: 'Saturday', date: BASE_WEEK[5], type: 'long', description: 'L', ...runPhases(), duration: '90 min', plannedDurationMin: 90, plannedDistanceKm: 16, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
    {day: 'Sunday', date: BASE_WEEK[6], type: 'recovery', description: 'E', ...runPhases(), duration: '30 min', plannedDurationMin: 30, plannedDistanceKm: 5, targetPace: null, targetZone: 'Z1', targetZoneId: 1, notes: null},
  ],
});

describe('suggestCoachRepairDates', () => {
  it('suggests adjacent hard pair dates when evaluation flags adjacent_hard_days', () => {
    const coach = makeCoachWeekAdjacentHard();
    const evaluation = evaluateCoachWeeklyDistribution(coach);
    expect(evaluation.issues.some((i) => i.code === 'adjacent_hard_days')).toBe(true);
    const dates = suggestCoachRepairDates(coach, evaluation, 3);
    expect(dates).toContain(BASE_WEEK[0]);
    expect(dates).toContain(BASE_WEEK[1]);
  });
});
