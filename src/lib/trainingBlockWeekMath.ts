import {addDaysIso, getMondayIsoForDate, normalizeIsoDate} from '@/lib/weekTime';

const MS_PER_DAY = 86400000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export const DEFAULT_TRAINING_BLOCK_MIN_FORWARD_WEEKS = 4;

export function parseIsoDateUtcNoon(iso: string): Date {
  const n = normalizeIsoDate(iso);
  if (!n) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return new Date(`${n}T12:00:00.000Z`);
}

/** Weeks from block start Monday through the week that contains goalDate (inclusive). */
export function mondayWeeksInclusiveSpan(
  blockStartMondayIso: string,
  goalDateIso: string,
): number {
  const start = parseIsoDateUtcNoon(blockStartMondayIso);
  const raceMondayIso = getMondayIsoForDate(goalDateIso);
  const raceMonday = parseIsoDateUtcNoon(raceMondayIso);
  const diffMs = raceMonday.getTime() - start.getTime();
  if (diffMs < 0) {
    return 1;
  }
  const weeksBetween = Math.floor(diffMs / MS_PER_WEEK);
  return weeksBetween + 1;
}

export type ResolvedTrainingBlockWeekParams = {
  templateWeeks: number;
  firstActiveWeekNumber: number;
  forwardWeekCount: number;
  weeksRemaining: number;
};

/**
 * When the client requests an explicit template length (e.g. 16) but fewer
 * calendar weeks remain until the goal, treat early canonical weeks as "given"
 * and start the live plan at `firstActiveWeekNumber`.
 */
export function resolveTrainingBlockWeekParams(options: {
  clientTemplateWeeks?: number;
  startMondayIso: string;
  goalDateIso: string;
  autoTemplateWeeks: (start: string, goal: string) => number;
}): ResolvedTrainingBlockWeekParams {
  const weeksRemaining = mondayWeeksInclusiveSpan(
    options.startMondayIso,
    options.goalDateIso,
  );
  if (
    typeof options.clientTemplateWeeks === 'number' &&
    options.clientTemplateWeeks > 0
  ) {
    const templateWeeks = options.clientTemplateWeeks;
    const firstActiveWeekNumber = Math.max(
      1,
      templateWeeks - weeksRemaining + 1,
    );
    const forwardWeekCount = templateWeeks - firstActiveWeekNumber + 1;
    return {
      templateWeeks,
      firstActiveWeekNumber,
      forwardWeekCount,
      weeksRemaining,
    };
  }
  const templateWeeks = options.autoTemplateWeeks(
    options.startMondayIso,
    options.goalDateIso,
  );
  return {
    templateWeeks,
    firstActiveWeekNumber: 1,
    forwardWeekCount: templateWeeks,
    weeksRemaining,
  };
}

/** 1-indexed canonical week number for "today" within the block. */
export function blockCurrentCanonicalWeek(options: {
  blockStartMondayIso: string;
  firstActiveWeekNumber: number;
  canonicalTotalWeeks: number;
  nowMs?: number;
}): number {
  const start = parseIsoDateUtcNoon(options.blockStartMondayIso);
  const now = options.nowMs ?? Date.now();
  const diffMs = Math.max(0, now - start.getTime());
  const weeksElapsed = Math.floor(diffMs / MS_PER_WEEK);
  const raw = options.firstActiveWeekNumber + weeksElapsed;
  return Math.max(
    options.firstActiveWeekNumber,
    Math.min(options.canonicalTotalWeeks, raw),
  );
}

/** Monday ISO for a canonical week number (must be >= firstActiveWeekNumber). */
export function blockWeekStartMondayIso(options: {
  blockStartMondayIso: string;
  weekNumber: number;
  firstActiveWeekNumber: number;
}): string {
  const offset = options.weekNumber - options.firstActiveWeekNumber;
  if (offset < 0) {
    throw new Error('weekNumber is before firstActiveWeekNumber');
  }
  return addDaysIso(options.blockStartMondayIso, offset * 7);
}

/** Map a weekly plan `weekStart` Monday to canonical block week (1-indexed). */
export function canonicalWeekFromPlanWeekStart(options: {
  blockStartMondayIso: string;
  planWeekStartMondayIso: string;
  firstActiveWeekNumber: number;
  canonicalTotalWeeks: number;
}): number {
  const start = parseIsoDateUtcNoon(options.blockStartMondayIso).getTime();
  const week = parseIsoDateUtcNoon(options.planWeekStartMondayIso).getTime();
  const deltaWeeks = Math.round((week - start) / MS_PER_WEEK);
  const weekNum = options.firstActiveWeekNumber + deltaWeeks;
  return Math.max(
    options.firstActiveWeekNumber,
    Math.min(options.canonicalTotalWeeks, weekNum),
  );
}

export function readFirstActiveWeekNumber(
  value: number | null | undefined,
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  return 1;
}
