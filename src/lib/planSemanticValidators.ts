import type {CoachWeekOutput, PhysioWeekOutput, RunStep} from '@/lib/weeklyPlanSchema';
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

const RUN_TYPES_WITH_PHASES = new Set<
  CoachWeekOutput['sessions'][number]['type']
>(['easy', 'intervals', 'tempo', 'long', 'recovery']);

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

const collectCoachStrengthText = (session: CoachWeekOutput['sessions'][number]): string => {
  if (session.type !== 'strength') return '';
  return `${session.description ?? ''} ${session.notes ?? ''}`.toLowerCase();
};

/** Coach copy signals low-DOMS strength; allows the next day to be hard/long (matches prompt / skeleton edge cases). */
const coachStrengthIsExplicitlyLowDoms = (session: CoachWeekOutput['sessions'][number]): boolean => {
  if (session.type !== 'strength') return false;
  const text = collectCoachStrengthText(session);
  return LIGHT_STRENGTH_HINTS.some((hint) => text.includes(hint));
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
    if (!HARD_OR_LONG_RUN_TYPES.has(next.type)) continue;
    if (coachStrengthIsExplicitlyLowDoms(session)) continue;
    return {
      ok: false,
      reason: `Strength slot on ${session.date} is too close to hard/long run on ${next.date}. Move strength, insert easy/recovery/rest between, or state low-DOMS work in description/notes (e.g. light, mobility, activation, primer, prehab, bodyweight).`,
    };
  }

  for (const session of value.sessions) {
    if (RUN_TYPES_WITH_PHASES.has(session.type)) {
      if (
        !session.warmupSteps.length ||
        !session.mainSteps.length ||
        !session.cooldownSteps.length
      ) {
        return {
          ok: false,
          reason: `Coach output must include warmup, main, and cooldown steps for ${session.date} (${session.type})`,
        };
      }
    } else if (session.type === 'rest' || session.type === 'strength') {
      if (
        session.warmupSteps.length ||
        session.mainSteps.length ||
        session.cooldownSteps.length
      ) {
        return {
          ok: false,
          reason: `Coach output must leave warmup/main/cooldown step arrays empty for ${session.type} on ${session.date}`,
        };
      }
    }
    const validateSteps = (steps: RunStep[]): {ok: boolean; reason?: string} => {
      for (const step of steps) {
        if (step.stepKind === 'repeat_block' && (!step.repeatCount || step.repeatCount < 1)) {
          return {ok: false, reason: `Repeat block on ${session.date} requires repeatCount >= 1`};
        }
        if ((step.stepKind === 'repeat_block' || step.stepKind === 'composite') && (!step.subSteps || step.subSteps.length === 0)) {
          return {ok: false, reason: `Step ${step.label} on ${session.date} requires subSteps`};
        }
      }
      return {ok: true};
    };

    const warmupCheck = validateSteps(session.warmupSteps);
    if (!warmupCheck.ok) return warmupCheck;
    const mainCheck = validateSteps(session.mainSteps);
    if (!mainCheck.ok) return mainCheck;
    const cooldownCheck = validateSteps(session.cooldownSteps);
    if (!cooldownCheck.ok) return cooldownCheck;
  }

  return {ok: true};
};

const sumStepMetricRecursive = (
  steps: RunStep[] | undefined,
  metric: 'distanceKm' | 'durationMin',
): number => {
  if (!steps?.length) return 0;
  return steps.reduce((acc, step) => {
    const current = Number.isFinite(step[metric] ?? null) ? (step[metric] as number) : 0;
    const nested = sumStepMetricRecursive(step.subSteps ?? undefined, metric);
    const blockBase = nested > 0 ? nested : current;
    const multiplier = step.stepKind === 'repeat_block' && step.repeatCount ? step.repeatCount : 1;
    return acc + (blockBase * multiplier);
  }, 0);
};

const withinTolerance = (actual: number, expected: number, toleranceRatio = 0.12): boolean => {
  if (expected <= 0) return true;
  const delta = Math.abs(actual - expected);
  return delta <= Math.max(0.3, expected * toleranceRatio);
};

/** Scale every distanceKm on this row and nested subSteps (repeat_block / composite). */
const scaleDistanceKmOnSteps = (steps: RunStep[] | undefined, scale: number): boolean => {
  if (!steps?.length) return false;
  let changed = false;
  for (const step of steps) {
    if (step.distanceKm != null) {
      step.distanceKm = Math.max(0.1, Math.round(step.distanceKm * scale * 10) / 10);
      changed = true;
    }
    const subs = step.subSteps ?? undefined;
    if (subs?.length && scaleDistanceKmOnSteps(subs as RunStep[], scale)) {
      changed = true;
    }
  }
  return changed;
};

/** Scale every durationMin on this row and nested subSteps. */
const scaleDurationMinOnSteps = (steps: RunStep[] | undefined, scale: number): boolean => {
  if (!steps?.length) return false;
  let changed = false;
  for (const step of steps) {
    if (step.durationMin != null) {
      step.durationMin = Math.max(1, Math.round(step.durationMin * scale));
      changed = true;
    }
    const subs = step.subSteps ?? undefined;
    if (subs?.length && scaleDurationMinOnSteps(subs as RunStep[], scale)) {
      changed = true;
    }
  }
  return changed;
};

export const validateCoachSessionStepTotals = (
  coach: CoachWeekOutput,
): {ok: boolean; reason?: string} => {
  for (const session of coach.sessions) {
    if (!RUN_TYPES_WITH_PHASES.has(session.type)) continue;
    const allSteps = [
      ...session.warmupSteps,
      ...session.mainSteps,
      ...session.cooldownSteps,
    ];
    const stepDistance = sumStepMetricRecursive(allSteps, 'distanceKm');
    const stepDuration = sumStepMetricRecursive(allSteps, 'durationMin');
    if (session.plannedDistanceKm != null && stepDistance > 0 && !withinTolerance(stepDistance, session.plannedDistanceKm)) {
      return {
        ok: false,
        reason: `Distance mismatch on ${session.date}: steps ${stepDistance.toFixed(1)}km vs planned ${session.plannedDistanceKm.toFixed(1)}km`,
      };
    }
    if (session.plannedDurationMin != null && stepDuration > 0 && !withinTolerance(stepDuration, session.plannedDurationMin, 0.2)) {
      return {
        ok: false,
        reason: `Duration mismatch on ${session.date}: steps ${Math.round(stepDuration)}min vs planned ${Math.round(session.plannedDurationMin)}min`,
      };
    }
  }
  return {ok: true};
};

export const normalizeCoachSessionStepTotals = (
  coach: CoachWeekOutput,
): boolean => {
  let changed = false;
  for (const session of coach.sessions) {
    if (!RUN_TYPES_WITH_PHASES.has(session.type)) continue;
    const allSteps = [
      ...session.warmupSteps,
      ...session.mainSteps,
      ...session.cooldownSteps,
    ];
    const stepDistance = sumStepMetricRecursive(allSteps, 'distanceKm');
    const stepDuration = sumStepMetricRecursive(allSteps, 'durationMin');
    if (session.plannedDistanceKm != null && stepDistance > 0 && !withinTolerance(stepDistance, session.plannedDistanceKm)) {
      const scale = session.plannedDistanceKm / stepDistance;
      for (const phase of [session.warmupSteps, session.mainSteps, session.cooldownSteps]) {
        if (scaleDistanceKmOnSteps(phase, scale)) changed = true;
      }
    }
    if (session.plannedDurationMin != null && stepDuration > 0 && !withinTolerance(stepDuration, session.plannedDurationMin, 0.2)) {
      const scale = session.plannedDurationMin / stepDuration;
      for (const phase of [session.warmupSteps, session.mainSteps, session.cooldownSteps]) {
        if (scaleDurationMinOnSteps(phase, scale)) changed = true;
      }
    }
  }
  return changed;
};

/** Session types whose plannedDistanceKm counts toward weekly block volume. */
const RUN_VOLUME_SESSION_TYPES = new Set<
  CoachWeekOutput['sessions'][number]['type']
>(['easy', 'intervals', 'tempo', 'long', 'recovery']);

export const sumCoachWeekRunPlannedKm = (value: CoachWeekOutput): number => {
  let sum = 0;
  for (const session of value.sessions) {
    if (!RUN_VOLUME_SESSION_TYPES.has(session.type)) continue;
    const km = session.plannedDistanceKm;
    if (km == null || !Number.isFinite(km)) continue;
    sum += km;
  }
  return sum;
};

/** Enforces block volumeTargetKm when the athlete has a periodized outline for this week. */
export const validateCoachWeekVolumeVsBlockTarget = (
  value: CoachWeekOutput,
  volumeTargetKm: number,
  options?: {toleranceRatio?: number},
): {ok: boolean; reason?: string} => {
  if (!Number.isFinite(volumeTargetKm) || volumeTargetKm <= 0) {
    return {ok: true};
  }
  const toleranceRatio = options?.toleranceRatio ?? 0.06;
  const low = volumeTargetKm * (1 - toleranceRatio);
  const high = volumeTargetKm * (1 + toleranceRatio);

  for (const session of value.sessions) {
    if (!RUN_VOLUME_SESSION_TYPES.has(session.type)) continue;
    const km = session.plannedDistanceKm;
    if (km == null || !Number.isFinite(km) || km <= 0) {
      return {
        ok: false,
        reason: `Training block volume is ${volumeTargetKm} km: every ${session.type} session must set plannedDistanceKm (missing or invalid on ${session.date})`,
      };
    }
  }

  const sumKm = sumCoachWeekRunPlannedKm(value);
  if (sumKm < low || sumKm > high) {
    return {
      ok: false,
      reason: `Weekly planned run volume ${sumKm.toFixed(1)} km is outside the block target band ${low.toFixed(1)}–${high.toFixed(1)} km (target ${volumeTargetKm} km, ±${Math.round(toleranceRatio * 100)}%)`,
    };
  }

  return {ok: true};
};

export const summarizeBlockVolumeForPrompt = (
  value: CoachWeekOutput,
  volumeTargetKm: number,
  toleranceRatio = 0.06,
): string => {
  const low = volumeTargetKm * (1 - toleranceRatio);
  const high = volumeTargetKm * (1 + toleranceRatio);
  const sumKm = sumCoachWeekRunPlannedKm(value);
  const lines = value.sessions.map((session) => {
    if (!RUN_VOLUME_SESSION_TYPES.has(session.type)) {
      return `- ${session.date} (${session.type}): not counted toward run volume`;
    }
    const km = session.plannedDistanceKm;
    return `- ${session.date} (${session.type}): ${km == null ? 'missing km' : `${km} km`}`;
  });
  return [
    `Block weekly run volume target: ${volumeTargetKm} km (acceptable total: ${low.toFixed(1)}–${high.toFixed(1)} km).`,
    `Current sum of plannedDistanceKm on run days: ${sumKm.toFixed(2)} km.`,
    'Per-day breakdown:',
    ...lines,
    'Repair: set plannedDistanceKm on every easy/intervals/tempo/long/recovery day so the total matches the target band. Keep workout intent and HR zones coherent.',
  ].join('\n');
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
  const reservedStrengthDates = coach.sessions
    .filter((session) => session.type === 'strength')
    .map((session) => session.date);
  for (const strengthDate of reservedStrengthDates) {
    const physioSession = physioByDate.get(strengthDate);
    if (!physioSession || physioSession.type !== 'strength') {
      return {
        ok: false,
        reason: `Reserved strength slot on ${strengthDate} was not filled by a strength physio session`,
      };
    }
  }

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
  canonicalTotalWeeks: number,
  firstActiveWeekNumber = 1,
): {ok: boolean; reason?: string} => {
  const first = Math.max(1, Math.floor(firstActiveWeekNumber));
  const expectedLen = canonicalTotalWeeks - first + 1;
  if (weekOutlines.length !== expectedLen) {
    return {
      ok: false,
      reason: `Expected ${expectedLen} week outlines (weeks ${first}–${canonicalTotalWeeks}), got ${weekOutlines.length}`,
    };
  }

  for (let index = 0; index < weekOutlines.length; index += 1) {
    const expectedWeekNumber = first + index;
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
