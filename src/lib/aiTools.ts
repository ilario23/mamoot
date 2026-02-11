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
