import {z} from 'zod';

const personSchema = z.enum(['coach', 'nutritionist', 'physio', 'orchestrator']);

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
});

export const trainingBlockRequestSchema = z.object({
  athleteId: z.number().int().positive(),
  mode: z.enum(['create', 'adapt']).optional(),
  goalEvent: z.string().min(1),
  goalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
});
