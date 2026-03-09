import {z} from 'zod';

const personSchema = z.enum(['coach', 'nutritionist', 'physio']);

const uiMessagePartSchema = z.object({
  type: z.string(),
}).passthrough();

const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(uiMessagePartSchema).optional(),
}).passthrough();

export const chatRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1),
  persona: personSchema,
  memory: z.string().nullable().optional(),
  model: z.string().optional(),
  athleteId: z.number().int().positive().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  explicitContext: z.array(
    z.object({
      categoryId: z.string(),
      label: z.string(),
      data: z.string(),
    }).passthrough(),
  ).nullable().optional(),
});

export const weeklyPlanRequestSchema = z.object({
  athleteId: z.number().int().positive(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  model: z.string().optional(),
  preferences: z.string().optional(),
  mode: z.enum(['full', 'remaining_days']).optional(),
  sourcePlanId: z.string().optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  strategySelectionMode: z.enum(['auto', 'preset']).optional(),
  strategyPreset: z.string().optional(),
  optimizationPriority: z.string().optional(),
  useMultiAgent: z.boolean().optional(),
  editSourcePlanId: z.string().optional(),
  editInstructions: z.string().optional(),
  editTargetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const weeklyPlanSessionStatusSchema = z.enum([
  'planned',
  'completed',
  'skipped',
  'modified',
]);

const weeklyPlanPhysioExerciseSchema = z.object({
  name: z.string(),
  sets: z.string().optional(),
  reps: z.string().optional(),
  tempo: z.string().optional(),
  notes: z.string().optional(),
});

const weeklyPlanRunSchema = z.object({
  type: z.string(),
  description: z.string(),
  duration: z.string().optional(),
  plannedDurationMin: z.number().positive().optional(),
  plannedDistanceKm: z.number().positive().optional(),
  targetPace: z.string().optional(),
  targetZone: z.string().optional(),
  targetZoneId: z.number().int().min(1).max(6).optional(),
  notes: z.string().optional(),
});

const weeklyPlanPhysioSchema = z.object({
  type: z.string(),
  exercises: z.array(weeklyPlanPhysioExerciseSchema),
  duration: z.string().optional(),
  notes: z.string().optional(),
});

const weeklyPlanActualActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  distanceKm: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  avgPaceSecPerKm: z.number().nonnegative().optional(),
  avgHr: z.number().nonnegative().optional(),
  elevationGainM: z.number().nonnegative().optional(),
});

const weeklyPlanBlockIntentSchema = z.object({
  blockId: z.string(),
  weekNumber: z.number().int().positive(),
  goalEvent: z.string(),
  goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekType: z.string(),
  volumeTargetKm: z.number().nonnegative(),
  intensityLevel: z.string(),
  keyWorkouts: z.array(z.string()),
});

const weeklyPlanComplianceSchema = z.object({
  matchedPlanType: z.boolean().optional(),
  notes: z.string().optional(),
});

const weeklyPlanStrengthSlotSchema = z.object({
  focus: z.string().optional(),
  load: z.enum(['light', 'moderate', 'heavy']).optional(),
  notes: z.string().optional(),
});

export const weeklyPlanSessionSchema = z.object({
  day: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  run: weeklyPlanRunSchema.optional(),
  physio: weeklyPlanPhysioSchema.optional(),
  strengthSlot: weeklyPlanStrengthSlotSchema.optional(),
  notes: z.string().optional(),
  status: weeklyPlanSessionStatusSchema.optional(),
  actualActivity: weeklyPlanActualActivitySchema.optional(),
  blockIntent: weeklyPlanBlockIntentSchema.optional(),
  compliance: weeklyPlanComplianceSchema.optional(),
});

export const trainingBlockRequestSchema = z.object({
  athleteId: z.number().int().positive(),
  mode: z.enum(['create', 'adapt']).optional(),
  goalEvent: z.string().min(1),
  goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requirements: z.string().optional(),
  totalWeeks: z.number().int().positive().optional(),
  model: z.string().optional(),
  adaptationType: z.enum([
    'recalibrate_remaining_weeks',
    'insert_event',
    'shift_target_date',
  ]).optional(),
  sourceBlockId: z.string().optional(),
  effectiveFromWeek: z.number().int().positive().optional(),
  event: z.object({
    name: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    distanceKm: z.number().positive().optional(),
    priority: z.enum(['A', 'B', 'C']).optional(),
  }).optional(),
  strategySelectionMode: z.enum(['auto', 'preset']).optional(),
  strategyPreset: z.string().optional(),
  optimizationPriority: z.string().optional(),
  useMultiAgent: z.boolean().optional(),
});
