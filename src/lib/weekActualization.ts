import type {ActivitySummary} from '@/lib/mockData';
import {formatPace} from '@/lib/mockData';
import type {UnifiedSession} from '@/lib/cacheTypes';

type SourceSession = UnifiedSession | undefined;

const coalesceRunType = (source: SourceSession): string => source?.run?.type ?? 'easy';

const buildRunDescription = (activity: ActivitySummary): string =>
  `${activity.name} (${activity.distance.toFixed(1)} km at ${formatPace(activity.avgPace)}/km)`;

export interface BuildActualizedWeekContextInput {
  weekDates: Array<{day: string; date: string}>;
  sourceSessions: UnifiedSession[];
  activities: ActivitySummary[];
  todayIso: string;
}

export interface BuildActualizedWeekContextResult {
  lockedByDate: Map<string, UnifiedSession>;
  completedPastCount: number;
  unplannedCount: number;
  summary: string;
}

export const buildActualizedWeekContext = ({
  weekDates,
  sourceSessions,
  activities,
  todayIso,
}: BuildActualizedWeekContextInput): BuildActualizedWeekContextResult => {
  const sourceByDate = new Map(sourceSessions.map((session) => [session.date, session]));
  const weekDateSet = new Set(weekDates.map((entry) => entry.date));

  const activitiesByDate = new Map<string, ActivitySummary[]>();
  for (const activity of activities) {
    if (!weekDateSet.has(activity.date)) continue;
    const list = activitiesByDate.get(activity.date) ?? [];
    list.push(activity);
    activitiesByDate.set(activity.date, list);
  }

  const lockedByDate = new Map<string, UnifiedSession>();
  let completedPastCount = 0;
  let unplannedCount = 0;

  for (const {day, date} of weekDates) {
    if (date >= todayIso) continue;

    const source = sourceByDate.get(date);
    const actuals = activitiesByDate.get(date) ?? [];
    const primaryActual = actuals[0];

    if (primaryActual) {
      completedPastCount += 1;
      if (!source?.run) {
        unplannedCount += 1;
      }
      const actualized: UnifiedSession = {
        day,
        date,
        run: {
          type: coalesceRunType(source),
          description: buildRunDescription(primaryActual),
          notes: source?.run
            ? `Completed activity used as source of truth. Planned: ${source.run.description}`
            : 'Completed activity used as source of truth (unplanned).',
        },
      };
      lockedByDate.set(date, actualized);
      continue;
    }

    if (source) {
      lockedByDate.set(date, {
        ...source,
        notes: source.notes ?? 'No completed activity found for this past day.',
      });
      continue;
    }

    lockedByDate.set(date, {day, date, notes: 'No plan and no completed activity.'});
  }

  const summaryParts: string[] = [];
  summaryParts.push(`Completed past days: ${completedPastCount}`);
  if (unplannedCount > 0) {
    summaryParts.push(`Unplanned completed days: ${unplannedCount}`);
  }
  summaryParts.push(`Locked days: ${lockedByDate.size}`);

  return {
    lockedByDate,
    completedPastCount,
    unplannedCount,
    summary: summaryParts.join(' | '),
  };
};
