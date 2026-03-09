import type {CoachWeekOutput, PhysioWeekOutput} from '@/lib/weeklyPlanSchema';
import type {WeekOutline} from '@/lib/cacheTypes';
import {
  evaluateUnifiedWeeklyDistribution,
  type DistributionEvaluation,
} from '@/lib/weeklyDistributionEvaluator';

const HARD_RUN_TYPES = new Set(['intervals', 'tempo', 'threshold', 'race']);
const HARD_OR_LONG_RUN_TYPES = new Set(['intervals', 'tempo', 'threshold', 'race', 'long']);
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

  const strengthIndices = value.sessions
    .map((session, index) => ({session, index}))
    .filter(({session}) => session.type === 'strength');
  if (strengthIndices.length > 3) {
    return {
      ok: false,
      reason: `Coach output has too many strength slots (${strengthIndices.length}/7)`,
    };
  }

  for (const {index, session} of strengthIndices) {
    const next = value.sessions[index + 1];
    if (!next) continue;
    if (HARD_OR_LONG_RUN_TYPES.has(next.type)) {
      return {
        ok: false,
        reason: `Strength slot on ${session.date} is too close to hard/long run on ${next.date}`,
      };
    }
  }

  return {ok: true};
};

export const validateCombinedWeekSemantics = (
  coach: CoachWeekOutput,
  physio: PhysioWeekOutput,
  options?: {allowMissingStrengthBeforeDate?: string},
): {ok: boolean; reason?: string; distribution?: DistributionEvaluation} => {
  const coachDates = coach.sessions.map((session) => session.date);
  const coachDateSet = new Set(coachDates);
  if (coachDateSet.size !== coachDates.length) {
    return {ok: false, reason: 'Coach output has duplicate dates'};
  }

  const physioDates = physio.sessions.map((session) => session.date);
  const dedupedPhysioSessions = (() => {
    const seen = new Set<string>();
    return physio.sessions.filter((session) => {
      if (seen.has(session.date)) return false;
      seen.add(session.date);
      return true;
    });
  })();
  for (const physioSession of dedupedPhysioSessions) {
    if (!coachDateSet.has(physioSession.date)) {
      return {
        ok: false,
        reason: `Physio session date ${physioSession.date} is outside coach week`,
      };
    }
  }

  const physioByDate = new Map(dedupedPhysioSessions.map((session) => [session.date, session]));

  for (let index = 0; index < coach.sessions.length; index += 1) {
    const runSession = coach.sessions[index];
    const physioSession = physioByDate.get(runSession.date);
    if (!physioSession) continue;
    if (runSession.type === 'strength' && physioSession.type !== 'strength') {
      return {
        ok: false,
        reason: `Coach strength slot not filled with strength physio on ${runSession.date}`,
      };
    }

    if (isLikelyHeavyStrength(physioSession)) {
      const nextRunSession = coach.sessions[index + 1];
      if (nextRunSession && HARD_OR_LONG_RUN_TYPES.has(nextRunSession.type)) {
        // Downstream deterministic conflict resolver handles this.
      }
    }
  }

  for (const runSession of coach.sessions) {
    if (runSession.type !== 'strength') continue;
    const physioSession = physioByDate.get(runSession.date);
    if (!physioSession) {
      if (
        options?.allowMissingStrengthBeforeDate &&
        runSession.date < options.allowMissingStrengthBeforeDate
      ) {
        continue;
      }
      return {
        ok: false,
        reason: `Coach strength slot missing physio session on ${runSession.date}`,
      };
    }
  }

  const mergedSessions = coach.sessions.map((runSession) => {
    const physioSession = physioByDate.get(runSession.date);
    return {
      day: runSession.day,
      date: runSession.date,
      run:
        runSession.type === 'rest'
          ? undefined
          : {
              type: runSession.type,
              description: runSession.description,
              duration: runSession.duration ?? undefined,
              targetPace: runSession.targetPace ?? undefined,
              targetZone: runSession.targetZone ?? undefined,
              notes: runSession.notes ?? undefined,
            },
      physio: physioSession
        ? {
            type: physioSession.type,
            exercises: physioSession.exercises.map((exercise) => ({
              name: exercise.name,
              sets: exercise.sets ?? undefined,
              reps: exercise.reps ?? undefined,
              tempo: exercise.tempo ?? undefined,
              notes: exercise.notes ?? undefined,
            })),
            duration: physioSession.duration ?? undefined,
            notes: physioSession.notes ?? undefined,
          }
        : undefined,
    };
  });
  const distribution = evaluateUnifiedWeeklyDistribution(mergedSessions);
  if (distribution.score < 50) {
    return {
      ok: false,
      reason: `Distribution safety floor not met (${distribution.score}/100)`,
      distribution,
    };
  }

  return {ok: true, distribution};
};

export const assessCombinedWeekDistribution = (
  coach: CoachWeekOutput,
  physio: PhysioWeekOutput,
): DistributionEvaluation => {
  const physioByDate = new Map(physio.sessions.map((session) => [session.date, session]));
  const mergedSessions = coach.sessions.map((runSession) => {
    const physioSession = physioByDate.get(runSession.date);
    return {
      day: runSession.day,
      date: runSession.date,
      run:
        runSession.type === 'rest'
          ? undefined
          : {
              type: runSession.type,
              description: runSession.description,
              duration: runSession.duration ?? undefined,
              targetPace: runSession.targetPace ?? undefined,
              targetZone: runSession.targetZone ?? undefined,
              notes: runSession.notes ?? undefined,
            },
      physio: physioSession
        ? {
            type: physioSession.type,
            exercises: physioSession.exercises.map((exercise) => ({
              name: exercise.name,
              sets: exercise.sets ?? undefined,
              reps: exercise.reps ?? undefined,
              tempo: exercise.tempo ?? undefined,
              notes: exercise.notes ?? undefined,
            })),
            duration: physioSession.duration ?? undefined,
            notes: physioSession.notes ?? undefined,
          }
        : undefined,
    };
  });
  return evaluateUnifiedWeeklyDistribution(mergedSessions);
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
