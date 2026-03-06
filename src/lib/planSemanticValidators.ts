import type {CoachWeekOutput, PhysioWeekOutput} from '@/lib/weeklyPlanSchema';
import type {WeekOutline} from '@/lib/cacheTypes';

const HARD_RUN_TYPES = new Set(['intervals', 'tempo', 'threshold', 'race']);
const HARD_OR_LONG_RUN_TYPES = new Set(['intervals', 'tempo', 'threshold', 'race', 'long']);
const HEAVY_PHYSIO_TYPES = new Set(['strength', 'full-strength']);
const LIGHT_STRENGTH_HINTS = [
  'light',
  'primer',
  'activation',
  'prehab',
  'mobility',
  'isometric',
  'recovery',
  'low load',
  'bodyweight',
];
const HEAVY_STRENGTH_HINTS = [
  'heavy',
  'full strength',
  'compound',
  'eccentric',
  'squat',
  'deadlift',
  'rdl',
  'lunge',
  'split squat',
  'hip thrust',
  'plyometric',
];

const collectPhysioText = (session: PhysioWeekOutput['sessions'][number]): string => {
  const notes = session.notes ?? '';
  const exerciseText = session.exercises
    .map((exercise) =>
      [exercise.name, exercise.sets, exercise.reps, exercise.tempo, exercise.notes]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');
  return `${notes} ${exerciseText}`.toLowerCase();
};

const isLikelyHeavyStrength = (session: PhysioWeekOutput['sessions'][number]): boolean => {
  if (session.type !== 'strength') return false;

  const text = collectPhysioText(session);
  const hasLightHint = LIGHT_STRENGTH_HINTS.some((hint) => text.includes(hint));
  const hasHeavyHint = HEAVY_STRENGTH_HINTS.some((hint) => text.includes(hint));

  if (hasHeavyHint) return true;
  if (hasLightHint) return false;

  // Conservative fallback: most full strength sessions with several exercises create DOMS risk.
  return session.exercises.length >= 4;
};

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
  const coachDates = coach.sessions.map((session) => session.date);
  const coachDateSet = new Set(coachDates);
  if (coachDateSet.size !== coachDates.length) {
    return {ok: false, reason: 'Coach output has duplicate dates'};
  }

  const physioDates = physio.sessions.map((session) => session.date);
  if (new Set(physioDates).size !== physioDates.length) {
    return {ok: false, reason: 'Physio output has duplicate dates'};
  }

  for (const physioSession of physio.sessions) {
    if (!coachDateSet.has(physioSession.date)) {
      return {
        ok: false,
        reason: `Physio session date ${physioSession.date} is outside coach week`,
      };
    }
  }

  const physioByDate = new Map(physio.sessions.map((session) => [session.date, session]));

  for (let index = 0; index < coach.sessions.length; index += 1) {
    const runSession = coach.sessions[index];
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

    if (runSession.type === 'strength' && physioSession.type !== 'strength') {
      return {
        ok: false,
        reason: `Coach strength slot not filled with strength physio on ${runSession.date}`,
      };
    }

    if (isLikelyHeavyStrength(physioSession)) {
      const nextRunSession = coach.sessions[index + 1];
      if (
        nextRunSession &&
        HARD_OR_LONG_RUN_TYPES.has(nextRunSession.type)
      ) {
        return {
          ok: false,
          reason: `DOMS risk: heavy strength on ${runSession.date} before ${nextRunSession.type} on ${nextRunSession.date}`,
        };
      }
    }
  }

  for (const runSession of coach.sessions) {
    if (runSession.type !== 'strength') continue;
    const physioSession = physioByDate.get(runSession.date);
    if (!physioSession) {
      return {
        ok: false,
        reason: `Coach strength slot missing physio session on ${runSession.date}`,
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
