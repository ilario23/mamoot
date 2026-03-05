import type {CoachWeekOutput, PhysioWeekOutput} from '@/lib/weeklyPlanSchema';
import type {WeekOutline} from '@/lib/cacheTypes';

const HARD_RUN_TYPES = new Set(['intervals', 'tempo', 'threshold', 'race']);
const HEAVY_PHYSIO_TYPES = new Set(['strength', 'full-strength']);

export const validateCoachWeekOutput = (
  value: CoachWeekOutput,
): {ok: boolean; reason?: string} => {
  const uniqueDates = new Set(value.sessions.map((session) => session.date));
  if (uniqueDates.size !== 7) {
    return {ok: false, reason: 'Coach output must include 7 unique dates'};
  }

  const hardCount = value.sessions.filter((session) =>
    HARD_RUN_TYPES.has(session.type),
  ).length;
  if (hardCount > 4) {
    return {
      ok: false,
      reason: `Coach output has too many hard sessions (${hardCount}/7)`,
    };
  }

  return {ok: true};
};

export const validateCombinedWeekSemantics = (
  coach: CoachWeekOutput,
  physio: PhysioWeekOutput,
): {ok: boolean; reason?: string} => {
  const physioByDate = new Map(physio.sessions.map((session) => [session.date, session]));

  for (const runSession of coach.sessions) {
    const physioSession = physioByDate.get(runSession.date);
    if (!physioSession) continue;
    if (
      HARD_RUN_TYPES.has(runSession.type) &&
      HEAVY_PHYSIO_TYPES.has(physioSession.type)
    ) {
      return {
        ok: false,
        reason: `Hard run + heavy physio collision on ${runSession.date}`,
      };
    }
  }

  return {ok: true};
};

export const validateTrainingBlockWeekOutlines = (
  weekOutlines: WeekOutline[],
  totalWeeks: number,
): {ok: boolean; reason?: string} => {
  if (weekOutlines.length !== totalWeeks) {
    return {
      ok: false,
      reason: `Expected ${totalWeeks} week outlines, got ${weekOutlines.length}`,
    };
  }

  for (let index = 0; index < weekOutlines.length; index += 1) {
    const expectedWeekNumber = index + 1;
    const current = weekOutlines[index];
    if (current.weekNumber !== expectedWeekNumber) {
      return {
        ok: false,
        reason: `Week outline index ${index} should be week ${expectedWeekNumber}`,
      };
    }

    if (index === 0) continue;
    const previous = weekOutlines[index - 1];
    const maxAllowed =
      previous.weekType === 'recovery' || previous.weekType === 'off-load'
        ? previous.volumeTargetKm * 1.2
        : previous.volumeTargetKm * 1.15;
    if (current.volumeTargetKm > maxAllowed) {
      return {
        ok: false,
        reason: `Week ${current.weekNumber} volume jump is too aggressive`,
      };
    }
  }

  return {ok: true};
};
