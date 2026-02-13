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

// ----- Share Training Plan -----

export const shareTrainingPlanSchema = z.object({
  title: z
    .string()
    .describe(
      'Short title for the training plan, e.g. "Half Marathon Build — Weeks 1-4"',
    ),
  summary: z
    .string()
    .optional()
    .describe('1-2 sentence overview of the plan'),
  goal: z
    .string()
    .optional()
    .describe('The target race or goal this plan is for, e.g. "sub-1:45 half marathon"'),
  durationWeeks: z
    .number()
    .optional()
    .describe('How many weeks the plan spans'),
  sessions: z
    .array(planSessionSchema)
    .describe(
      'Array of planned workout sessions — one per training day in the plan',
    ),
  content: z
    .string()
    .describe(
      'Full markdown rendering of the complete plan for display. Include all details, tables, and formatting.',
    ),
});

export type ShareTrainingPlanInput = z.infer<typeof shareTrainingPlanSchema>;

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

// ----- Physio Plan Session -----

export const physioSessionSchema = z.object({
  day: z
    .string()
    .describe('Day label, e.g. "Monday", "Tuesday", or "Day 1"'),
  date: z
    .string()
    .optional()
    .describe(
      'ISO date for this session, e.g. "2026-02-10". Include dates so sessions align with the Coach plan.',
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

// ----- Share Physio Plan -----

export const sharePhysioPlanSchema = z.object({
  title: z
    .string()
    .describe(
      'Short title for the plan, e.g. "Base Phase Strength — Weeks 1-4"',
    ),
  summary: z
    .string()
    .optional()
    .describe('1-2 sentence overview of the plan'),
  phase: z
    .string()
    .optional()
    .describe('Training phase: "base", "build", "taper", or "maintenance"'),
  strengthSessionsPerWeek: z
    .number()
    .optional()
    .describe(
      'How many dedicated strength sessions per week this plan prescribes (e.g. 2 or 3). The Coach uses this to leave room in the running schedule.',
    ),
  sessions: z
    .array(physioSessionSchema)
    .describe(
      'Array of planned physio sessions — strength, mobility, warm-up, and cool-down routines',
    ),
  content: z
    .string()
    .describe(
      'Full markdown rendering of the complete plan for display. Include all details, tables, and formatting.',
    ),
});

export type SharePhysioPlanInput = z.infer<typeof sharePhysioPlanSchema>;

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
