import {describe, expect, it} from 'vitest';
import {evaluateUnifiedWeeklyDistribution} from './weeklyDistributionEvaluator';
import type {UnifiedSession} from './cacheTypes';

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
