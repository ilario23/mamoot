import {z} from 'zod';

// OpenAI structured outputs require ALL properties in the `required` array.
// Use `.nullable()` instead of `.optional()` so fields stay required but can be null.

const pipelineExerciseSchema = z.object({
  name: z.string().describe('Exercise name, e.g. "Single-leg glute bridge"'),
  sets: z.string().nullable().describe('Number of sets, e.g. "3"'),
  reps: z.string().nullable().describe('Reps or hold duration, e.g. "12 each side", "30s hold"'),
  tempo: z.string().nullable().describe('Tempo or execution cue, e.g. "3s eccentric"'),
  notes: z.string().nullable().describe('Form cues or additional instructions'),
});

export const coachWeekSessionSchema = z.object({
  day: z.string().describe('Day name, e.g. "Monday"'),
  date: z.string().describe('ISO date, e.g. "2026-02-23"'),
  type: z
    .enum(['easy', 'intervals', 'tempo', 'long', 'rest', 'strength', 'recovery'])
    .describe('Workout type'),
  description: z.string().describe('Detailed workout description'),
  duration: z.string().nullable().describe('Expected duration, e.g. "45 min"'),
  plannedDurationMin: z.number().positive().nullable().describe('Planned duration in minutes, e.g. 45'),
  plannedDistanceKm: z.number().positive().nullable().describe('Planned run distance in km, e.g. 8'),
  targetPace: z.string().nullable().describe('Target pace, e.g. "5:00-5:15/km"'),
  targetZone: z.string().nullable().describe('Target HR zone, e.g. "Z2"'),
  targetZoneId: z.number().int().min(1).max(6).nullable().describe('Structured zone ID from 1-6'),
  notes: z.string().nullable().describe('Additional notes'),
});

export const coachWeekOutputSchema = z.object({
  sessions: z
    .array(coachWeekSessionSchema)
    .length(7)
    .describe('Exactly 7 sessions, one per day Monday through Sunday'),
});

export type CoachWeekOutput = z.infer<typeof coachWeekOutputSchema>;

export const physioWeekSessionSchema = z.object({
  day: z.string().describe('Day name, e.g. "Monday"'),
  date: z.string().describe('ISO date, e.g. "2026-02-23"'),
  type: z
    .enum(['strength', 'mobility', 'warmup', 'cooldown', 'recovery'])
    .describe('Session type'),
  exercises: z.array(pipelineExerciseSchema).describe('Exercises for this session'),
  duration: z.string().nullable().describe('Expected duration'),
  notes: z.string().nullable().describe('Additional notes'),
});

export const physioWeekOutputSchema = z.object({
  sessions: z
    .array(physioWeekSessionSchema)
    .min(1)
    .max(7)
    .describe('Physio sessions for the week — one per day that needs strength/mobility work'),
});

export type PhysioWeekOutput = z.infer<typeof physioWeekOutputSchema>;

export const planMetaSchema = z.object({
  title: z.string().describe('Short title, e.g. "Week 8 — Build Phase"'),
  summary: z.string().describe('1-2 sentence overview of the week'),
});

export type PlanMeta = z.infer<typeof planMetaSchema>;
