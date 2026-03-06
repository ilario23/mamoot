import {z} from 'zod';
import type {
  CoachWeekOutput,
  PhysioWeekOutput,
} from '@/lib/weeklyPlanSchema';

export const multiAgentRuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  maxSpecialistTurns: z.number().int().min(1).max(3),
  maxRepairTurns: z.number().int().min(0).max(2),
  maxRounds: z.number().int().min(1).max(5),
  maxRuntimeMs: z.number().int().min(5_000).max(120_000),
});

export type MultiAgentRuntimeConfig = z.infer<typeof multiAgentRuntimeConfigSchema>;

export const DEFAULT_MULTI_AGENT_RUNTIME_CONFIG: MultiAgentRuntimeConfig = {
  enabled: (process.env.AI_MULTI_AGENT_ENABLED ?? 'true').toLowerCase() !== 'false',
  maxSpecialistTurns: Number(process.env.AI_MULTI_AGENT_MAX_SPECIALIST_TURNS ?? '2'),
  maxRepairTurns: Number(process.env.AI_MULTI_AGENT_MAX_REPAIR_TURNS ?? '1'),
  maxRounds: Number(process.env.AI_MULTI_AGENT_MAX_ROUNDS ?? '3'),
  maxRuntimeMs: Number(process.env.AI_MULTI_AGENT_MAX_RUNTIME_MS ?? '45000'),
};

export const resolveMultiAgentRuntimeConfig = (): MultiAgentRuntimeConfig => {
  const parsed = multiAgentRuntimeConfigSchema.safeParse(
    DEFAULT_MULTI_AGENT_RUNTIME_CONFIG,
  );
  if (!parsed.success) {
    return {
      enabled: true,
      maxSpecialistTurns: 2,
      maxRepairTurns: 1,
      maxRounds: 3,
      maxRuntimeMs: 45000,
    };
  }
  return parsed.data;
};

export const sharedWeeklyBriefSchema = z.object({
  athleteId: z.number().int().positive(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  riskLevel: z.enum(['low', 'medium', 'high']),
  optimizationPriority: z.string(),
  strategyLabel: z.string(),
  hasInjuries: z.boolean(),
  maxHardRunDays: z.number().int().min(1).max(4).default(2),
  enforcePhysioSafetyPrecedence: z.boolean().default(true),
});

export type SharedWeeklyBrief = z.infer<typeof sharedWeeklyBriefSchema>;

export const conflictSeveritySchema = z.enum(['low', 'medium', 'high']);
export type ConflictSeverity = z.infer<typeof conflictSeveritySchema>;

export const weeklyAgentConflictSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rule: z.string(),
  severity: conflictSeveritySchema,
  message: z.string(),
  action: z.string(),
});

export type WeeklyAgentConflict = z.infer<typeof weeklyAgentConflictSchema>;

export const weeklyAgentResolutionSchema = z.object({
  conflicts: z.array(weeklyAgentConflictSchema),
  repairSuggested: z.boolean(),
  resolvedPhysioSessions: z.array(z.any()),
});

export type WeeklyAgentResolution = {
  conflicts: WeeklyAgentConflict[];
  repairSuggested: boolean;
  resolvedPhysioSessions: PhysioWeekOutput['sessions'];
};

const isHardRunType = (type: string | undefined): boolean =>
  type === 'intervals' || type === 'tempo' || type === 'long';

const isStrengthPhysioType = (type: string | undefined): boolean =>
  type === 'strength';

const addConflict = (
  list: WeeklyAgentConflict[],
  input: Omit<WeeklyAgentConflict, 'id'>,
): void => {
  list.push({
    id: crypto.randomUUID(),
    ...input,
  });
};

export const resolveWeeklyCoachPhysioConflicts = (
  coach: CoachWeekOutput,
  physio: PhysioWeekOutput,
): WeeklyAgentResolution => {
  const coachByDate = new Map(coach.sessions.map((s) => [s.date, s]));
  const sortedDates = [...coach.sessions]
    .map((s) => s.date)
    .sort((a, b) => a.localeCompare(b));
  const physioByDate = new Map(physio.sessions.map((s) => [s.date, {...s}]));
  const conflicts: WeeklyAgentConflict[] = [];

  for (let index = 0; index < sortedDates.length; index += 1) {
    const date = sortedDates[index];
    const currentCoach = coachByDate.get(date);
    const currentPhysio = physioByDate.get(date);
    if (!currentCoach || !currentPhysio) continue;

    if (isHardRunType(currentCoach.type) && isStrengthPhysioType(currentPhysio.type)) {
      addConflict(conflicts, {
        date,
        rule: 'hard_day_no_strength_overlay',
        severity: 'high',
        message:
          'Strength session collides with a high musculoskeletal stress running day.',
        action: 'Downgraded physio session from strength to mobility.',
      });
      physioByDate.set(date, {
        ...currentPhysio,
        type: 'mobility',
        notes: [currentPhysio.notes, 'Auto-adjusted for hard running day.']
          .filter(Boolean)
          .join(' '),
      });
    }

    const nextDate = sortedDates[index + 1];
    if (!nextDate) continue;
    const nextCoach = coachByDate.get(nextDate);
    if (!nextCoach || !isHardRunType(nextCoach.type)) continue;
    const updatedCurrentPhysio = physioByDate.get(date);
    if (!updatedCurrentPhysio || !isStrengthPhysioType(updatedCurrentPhysio.type)) continue;

    addConflict(conflicts, {
      date,
      rule: 'pre_hard_day_doms_buffer',
      severity: 'medium',
      message: 'Strength session is placed immediately before a hard run day.',
      action: 'Downgraded pre-hard-day strength to lower DOMS-risk mobility.',
    });
    physioByDate.set(date, {
      ...updatedCurrentPhysio,
      type: 'mobility',
      notes: [updatedCurrentPhysio.notes, 'Auto-adjusted to preserve hard-day freshness.']
        .filter(Boolean)
        .join(' '),
    });
  }

  const repairSuggested = conflicts.some((conflict) => conflict.severity === 'high');
  const resolvedPhysioSessions = [...physioByDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return {
    conflicts,
    repairSuggested,
    resolvedPhysioSessions,
  };
};

export const summarizeConflictResolution = (
  conflicts: WeeklyAgentConflict[],
): string => {
  if (conflicts.length === 0) return 'No coach/physio conflicts detected.';
  const high = conflicts.filter((c) => c.severity === 'high').length;
  const medium = conflicts.filter((c) => c.severity === 'medium').length;
  const low = conflicts.filter((c) => c.severity === 'low').length;
  return `Detected ${conflicts.length} conflicts (high: ${high}, medium: ${medium}, low: ${low}). Applied deterministic safety-first resolution.`;
};
