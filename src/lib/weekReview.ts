/**
 * Shared week-review logic: compares a weekly plan's running sessions
 * against actual activities to produce a text summary for prompt injection.
 */

import {getDb} from '@/db';
import {
  activityDetails as activityDetailsTable,
  activityLabels as activityLabelsTable,
} from '@/db/schema';
import {and, eq, inArray} from 'drizzle-orm';
import type {ActivitySummary, UserSettings} from './activityModel';
import {formatPace} from './activityModel';
import {
  classifyWorkout,
  formatLabelForAI,
  type WorkoutLabel,
} from './workoutLabel';
import type {StravaDetailedActivity} from './strava';
import {addDaysIso} from './weekTime';
import type {UnifiedSession} from './cacheTypes';
import {formatRunPhasesSummary} from './runPlanFormat';

type UnifiedSessionShape = {
  day: string;
  date: string;
  run?: {type: string; description: string; targetPace?: string; targetZone?: string};
  physio?: unknown;
  notes?: string;
};

async function fetchOrComputeLabels(
  athleteId: number,
  activityIds: number[],
  zones: UserSettings['zones'],
): Promise<Map<number, WorkoutLabel>> {
  const result = new Map<number, WorkoutLabel>();
  if (activityIds.length === 0) return result;

  const db = getDb();
  try {
    const existing = await db
      .select()
      .from(activityLabelsTable)
      .where(
        and(
          eq(activityLabelsTable.athleteId, athleteId),
          inArray(activityLabelsTable.id, activityIds),
        ),
      );

    for (const row of existing) {
      result.set(row.id, row.data as WorkoutLabel);
    }
  } catch {
    // Labels table might not exist yet
  }

  const missingIds = activityIds.filter((id) => !result.has(id));
  if (missingIds.length === 0) return result;

  try {
    const details = await db
      .select()
      .from(activityDetailsTable)
      .where(
        and(
          eq(activityDetailsTable.athleteId, athleteId),
          inArray(activityDetailsTable.id, missingIds),
        ),
      );

    const newLabels: Array<{
      id: number;
      athleteId: number;
      data: WorkoutLabel;
      computedAt: number;
    }> = [];

    for (const row of details) {
      const detail = row.data as StravaDetailedActivity;
      const label = classifyWorkout(detail, zones);
      if (label) {
        result.set(row.id, label);
        newLabels.push({
          id: row.id,
          athleteId,
          data: label,
          computedAt: Date.now(),
        });
      }
    }

    if (newLabels.length > 0) {
      db.insert(activityLabelsTable)
        .values(newLabels)
        .onConflictDoNothing()
        .catch(() => {});
    }
  } catch {
    // Activity details may not exist for all IDs
  }

  return result;
}

/**
 * Build a text summary comparing a weekly plan against actual activities.
 *
 * @param plan - The weekly plan row (must have `sessions` and `weekStart`)
 * @param allActivities - All loaded activities (will be filtered to the plan's week)
 * @param zones - HR zones for workout classification (nullable)
 * @returns A text summary suitable for prompt injection, or null if no meaningful comparison
 */
export async function buildWeekReview(
  athleteId: number,
  plan: {sessions: unknown; weekStart: string},
  allActivities: ActivitySummary[],
  zones: UserSettings['zones'] | undefined,
): Promise<string | null> {
  const unifiedSessions = (plan.sessions ?? []) as UnifiedSessionShape[];

  const sessions = unifiedSessions
    .filter((s) => s.run || s.notes)
    .map((s) => ({
      day: s.day,
      date: s.date,
      type: s.run?.type ?? 'rest',
      description: s.run
        ? formatRunPhasesSummary(s.run as NonNullable<UnifiedSession['run']>)
        : (s.notes || 'Rest'),
      targetPace: s.run?.targetPace,
      targetZone: s.run?.targetZone,
    }));

  const weekStartDate = plan.weekStart;
  const weekEndDate = addDaysIso(weekStartDate, 6);

  const weekSessions = sessions.filter((s) => {
    if (!s.date) return false;
    return s.date >= weekStartDate && s.date <= weekEndDate;
  });

  const weekActivities = allActivities.filter(
    (a) => a.date >= weekStartDate && a.date <= weekEndDate,
  );

  if (weekSessions.length === 0 && weekActivities.length === 0) {
    return null;
  }

  const activityIds = weekActivities.map((a) => Number(a.id));
  const labels = zones
    ? await fetchOrComputeLabels(athleteId, activityIds, zones)
    : new Map<number, WorkoutLabel>();

  const plannedDates = new Set(weekSessions.map((s) => s.date));
  const actualByDate = new Map<string, typeof weekActivities>();
  for (const a of weekActivities) {
    const existing = actualByDate.get(a.date) ?? [];
    existing.push(a);
    actualByDate.set(a.date, existing);
  }

  const lines = [
    `Week of ${weekStartDate} to ${weekEndDate}`,
    '',
    '| Date | Planned | Actual | Status |',
    '|------|---------|--------|--------|',
  ];

  let hitCount = 0;
  let missCount = 0;
  let modifiedCount = 0;

  for (const session of weekSessions) {
    const date = session.date!;
    const actuals = actualByDate.get(date) ?? [];

    if (actuals.length === 0) {
      if (session.type === 'rest') {
        lines.push(`| ${date} | ${session.type}: ${session.description} | Rest day | Hit |`);
        hitCount++;
      } else {
        lines.push(`| ${date} | ${session.type}: ${session.description} | -- | Missed |`);
        missCount++;
      }
      continue;
    }

    const actual = actuals[0];
    const label = labels.get(Number(actual.id));
    const actualStr = label
      ? formatLabelForAI(label)
      : `${actual.name} | ${actual.distance.toFixed(1)}km ${formatPace(actual.avgPace)}/km`;

    const plannedType = session.type.toLowerCase();
    const actualCategory = label?.category ?? '';
    const typeMatch =
      plannedType === actualCategory ||
      (plannedType === 'easy' && actualCategory === 'recovery') ||
      (plannedType === 'recovery' && actualCategory === 'easy');

    let status: string;
    if (typeMatch) {
      status = 'Hit';
      hitCount++;
    } else if (actuals.length > 0) {
      status = 'Modified';
      modifiedCount++;
    } else {
      status = 'Missed';
      missCount++;
    }

    let paceNote = '';
    if (label && session.targetPace) {
      paceNote = ` (target: ${session.targetPace}, actual: ${formatPace(label.mainWork.avgPace)}/km)`;
    }

    lines.push(`| ${date} | ${session.type}: ${session.description} | ${actualStr}${paceNote} | ${status} |`);

    actualByDate.set(date, actuals.filter((a) => a !== actual));
  }

  let unplannedCount = 0;
  for (const [date, actuals] of actualByDate) {
    for (const a of actuals) {
      if (!plannedDates.has(date)) {
        const label = labels.get(Number(a.id));
        const actualStr = label
          ? formatLabelForAI(label)
          : `${a.name} | ${a.distance.toFixed(1)}km`;
        lines.push(`| ${date} | -- | ${actualStr} | Unplanned |`);
        unplannedCount++;
      }
    }
  }

  const totalPlanned = weekSessions.filter((s) => s.type !== 'rest').length;
  const parts = [];
  if (hitCount > 0) parts.push(`${hitCount}/${totalPlanned} planned sessions hit`);
  if (modifiedCount > 0) parts.push(`${modifiedCount} modified`);
  if (missCount > 0) parts.push(`${missCount} missed`);
  if (unplannedCount > 0) parts.push(`${unplannedCount} unplanned`);

  lines.push('', `Summary: ${parts.join(', ') || 'No data to compare.'}`);

  return lines.join('\n');
}
