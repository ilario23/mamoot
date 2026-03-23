import {describe, expect, it} from 'vitest';
import {
  blockCurrentCanonicalWeek,
  blockWeekStartMondayIso,
  canonicalWeekFromPlanWeekStart,
  mondayWeeksInclusiveSpan,
  readFirstActiveWeekNumber,
  resolveTrainingBlockWeekParams,
} from './trainingBlockWeekMath';

describe('mondayWeeksInclusiveSpan', () => {
  it('counts weeks from start Monday through goal week', () => {
    expect(mondayWeeksInclusiveSpan('2026-03-30', '2026-04-16')).toBe(3);
  });

  it('returns 1 when goal is same week as start', () => {
    expect(mondayWeeksInclusiveSpan('2026-03-30', '2026-04-01')).toBe(1);
  });
});

describe('resolveTrainingBlockWeekParams', () => {
  it('uses full template when no client weeks (auto)', () => {
    const r = resolveTrainingBlockWeekParams({
      startMondayIso: '2026-03-30',
      goalDateIso: '2026-07-20',
      autoTemplateWeeks: () => 12,
    });
    expect(r.templateWeeks).toBe(12);
    expect(r.firstActiveWeekNumber).toBe(1);
    expect(r.forwardWeekCount).toBe(12);
  });

  it('offsets first active week when template exceeds remaining calendar weeks', () => {
    const r = resolveTrainingBlockWeekParams({
      clientTemplateWeeks: 16,
      startMondayIso: '2026-03-30',
      goalDateIso: '2026-04-16',
      autoTemplateWeeks: () => 4,
    });
    expect(r.weeksRemaining).toBe(3);
    expect(r.firstActiveWeekNumber).toBe(14);
    expect(r.forwardWeekCount).toBe(3);
  });
});

describe('blockWeekStartMondayIso', () => {
  it('maps canonical week to Monday ISO using first active', () => {
    expect(
      blockWeekStartMondayIso({
        blockStartMondayIso: '2026-04-20',
        weekNumber: 10,
        firstActiveWeekNumber: 9,
      }),
    ).toBe('2026-04-27');
  });
});

describe('blockCurrentCanonicalWeek', () => {
  it('returns first active on start boundary', () => {
    const w = blockCurrentCanonicalWeek({
      blockStartMondayIso: '2026-04-20',
      firstActiveWeekNumber: 9,
      canonicalTotalWeeks: 16,
      nowMs: new Date('2026-04-20T12:00:00.000Z').getTime(),
    });
    expect(w).toBe(9);
  });
});

describe('canonicalWeekFromPlanWeekStart', () => {
  it('aligns plan week with canonical index', () => {
    expect(
      canonicalWeekFromPlanWeekStart({
        blockStartMondayIso: '2026-04-20',
        planWeekStartMondayIso: '2026-04-20',
        firstActiveWeekNumber: 9,
        canonicalTotalWeeks: 16,
      }),
    ).toBe(9);
  });
});

describe('readFirstActiveWeekNumber', () => {
  it('defaults invalid values to 1', () => {
    expect(readFirstActiveWeekNumber(undefined)).toBe(1);
    expect(readFirstActiveWeekNumber(0)).toBe(1);
    expect(readFirstActiveWeekNumber(5)).toBe(5);
  });
});
