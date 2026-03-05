// ============================================================
// AI Tool Schemas — Zod schemas for AI SDK tool calls
// ============================================================
//
// Defines structured input schemas for tools the AI personas can
// call. These are used server-side in streamText() and the types
// are re-exported for client-side rendering of tool results.

import {z} from 'zod';

// ----- Plan Session -----

export const planSessionSchema = z.object({
  day: z
    .string()
    .describe('Day label, e.g. "Monday", "Tuesday", or "Day 1"'),
  date: z
    .string()
    .optional()
    .describe(
      'ISO date for this session, e.g. "2026-02-10". Always include dates so planned workouts can be matched to actual activities.',
    ),
  type: z
    .enum([
      'easy',
      'intervals',
      'tempo',
      'long',
      'rest',
      'strength',
      'recovery',
    ])
    .describe('Workout type category'),
  description: z
    .string()
    .describe(
      'Detailed workout description, e.g. "6x1000m at 4:15/km with 90s jog recovery"',
    ),
  duration: z
    .string()
    .optional()
    .describe('Expected duration, e.g. "45 min", "1:30"'),
  targetPace: z
    .string()
    .optional()
    .describe('Target pace range, e.g. "5:00-5:15/km"'),
  targetZone: z
    .string()
    .optional()
    .describe('Target heart rate zone, e.g. "Z2", "Z4"'),
  notes: z.string().optional().describe('Additional notes or instructions'),
});

export type PlanSessionInput = z.infer<typeof planSessionSchema>;

// ----- Physio Exercise -----

export const physioExerciseSchema = z.object({
  name: z
    .string()
    .describe('Exercise name, e.g. "Single-leg glute bridge", "Pallof press"'),
  sets: z
    .string()
    .optional()
    .describe('Number of sets, e.g. "3"'),
  reps: z
    .string()
    .optional()
    .describe('Reps or hold duration, e.g. "12 each side", "30s hold"'),
  tempo: z
    .string()
    .optional()
    .describe('Tempo or execution cue, e.g. "3s eccentric", "explosive"'),
  notes: z
    .string()
    .optional()
    .describe('Form cues or additional instructions'),
});

// ----- Physio Session -----

export const physioSessionSchema = z.object({
  day: z
    .string()
    .describe('Day label, e.g. "Monday", "Tuesday", or "Day 1"'),
  date: z
    .string()
    .optional()
    .describe(
      'ISO date for this session, e.g. "2026-02-10". Include dates so sessions align with the weekly plan.',
    ),
  type: z
    .enum(['strength', 'mobility', 'warmup', 'cooldown', 'recovery'])
    .describe('Session type category'),
  exercises: z
    .array(physioExerciseSchema)
    .describe('Array of exercises for this session'),
  duration: z
    .string()
    .optional()
    .describe('Expected duration, e.g. "30 min", "15 min"'),
  notes: z.string().optional().describe('Additional notes or instructions'),
});

export type PhysioSessionInput = z.infer<typeof physioSessionSchema>;

// ----- Suggest Follow-Ups -----

export const suggestFollowUpsSchema = z.object({
  suggestions: z
    .array(
      z.string().describe('A short follow-up question or prompt, max 8 words'),
    )
    .min(2)
    .max(3)
    .describe('2-3 short follow-up suggestions for the user'),
});

export type SuggestFollowUpsInput = z.infer<typeof suggestFollowUpsSchema>;

// ----- Save Weekly Preferences -----

export const saveWeeklyPreferencesSchema = z.object({
  preferences: z
    .string()
    .describe(
      'Free-text summary of athlete preferences/constraints for the upcoming week, e.g. "Can\'t run Tuesday and Thursday. Focus on tempo work. Recovering from knee soreness."',
    ),
});

// ----- Update Training Block -----

export const updateTrainingBlockSchema = z.object({
  weekNumber: z.number().describe('Which week to modify (1-indexed)'),
  weekType: z
    .enum(['build', 'recovery', 'peak', 'taper', 'race', 'base', 'off-load'])
    .optional()
    .describe('New week type'),
  volumeTargetKm: z.number().optional().describe('New volume target in km'),
  intensityLevel: z.enum(['low', 'moderate', 'high']).optional(),
  keyWorkouts: z.array(z.string()).optional(),
  notes: z.string().optional().describe('Updated notes for this week'),
});

export type UpdateTrainingBlockInput = z.infer<typeof updateTrainingBlockSchema>;

export const adaptTrainingBlockSchema = z.object({
  adaptationType: z.enum([
    'recalibrate_remaining_weeks',
    'insert_event',
    'shift_target_date',
  ]),
  effectiveFromWeek: z.number().optional(),
  eventName: z.string().optional(),
  eventDate: z.string().optional(),
  eventDistanceKm: z.number().optional(),
  eventPriority: z.enum(['A', 'B', 'C']).optional(),
  goalDate: z.string().optional(),
});

export type AdaptTrainingBlockInput = z.infer<typeof adaptTrainingBlockSchema>;

// ----- Orchestrator state tools -----

export const orchestratorGoalSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  status: z.enum(['active', 'on_hold', 'done']).default('active'),
});

export const orchestratorGoalUpdateSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  status: z.enum(['active', 'on_hold', 'done']).optional(),
});

export const orchestratorPlanItemSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
  ownerPersona: z.enum(['coach', 'nutritionist', 'physio']).optional(),
  dueDate: z.string().optional(),
});

export const orchestratorPlanItemUpdateSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
  ownerPersona: z.enum(['coach', 'nutritionist', 'physio']).optional(),
  dueDate: z.string().optional(),
});

export const orchestratorBlockerSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  linkedPlanItemId: z.string().optional(),
  status: z.enum(['open', 'resolved']).default('open'),
});

export const orchestratorBlockerUpdateSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  linkedPlanItemId: z.string().optional(),
  status: z.enum(['open', 'resolved']).optional(),
});

export const orchestratorHandoffSchema = z.object({
  targetPersona: z.enum(['coach', 'nutritionist', 'physio']),
  title: z.string().min(1),
  detail: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'done', 'cancelled']).default('pending'),
});

export const orchestratorHandoffUpdateSchema = z.object({
  id: z.string(),
  targetPersona: z.enum(['coach', 'nutritionist', 'physio']).optional(),
  title: z.string().optional(),
  detail: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'done', 'cancelled']).optional(),
});

export type OrchestratorGoalInput = z.infer<typeof orchestratorGoalSchema>;
export type OrchestratorGoalUpdateInput = z.infer<
  typeof orchestratorGoalUpdateSchema
>;
export type OrchestratorPlanItemInput = z.infer<typeof orchestratorPlanItemSchema>;
export type OrchestratorPlanItemUpdateInput = z.infer<
  typeof orchestratorPlanItemUpdateSchema
>;
export type OrchestratorBlockerInput = z.infer<typeof orchestratorBlockerSchema>;
export type OrchestratorBlockerUpdateInput = z.infer<
  typeof orchestratorBlockerUpdateSchema
>;
export type OrchestratorHandoffInput = z.infer<typeof orchestratorHandoffSchema>;
export type OrchestratorHandoffUpdateInput = z.infer<
  typeof orchestratorHandoffUpdateSchema
>;
