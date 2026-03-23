import {z} from 'zod';

export const trainingPhaseSchema = z.object({
  name: z.string().describe('Phase name, e.g. "Base", "Build 1", "Taper"'),
  weekNumbers: z
    .array(z.number())
    .describe('1-indexed week numbers belonging to this phase'),
  focus: z
    .string()
    .describe('One-sentence description of the phase focus'),
  volumeDirection: z
    .enum(['build', 'hold', 'reduce'])
    .describe('Volume trend during this phase'),
});

export const weekOutlineSchema = z.object({
  weekNumber: z.number().describe('1-indexed week number'),
  phase: z.string().describe('Phase name this week belongs to'),
  weekType: z
    .enum(['build', 'recovery', 'peak', 'taper', 'race', 'base', 'off-load'])
    .describe('Week archetype'),
  volumeTargetKm: z
    .number()
    .describe('Target weekly running volume in km'),
  intensityLevel: z
    .enum(['low', 'moderate', 'high'])
    .describe('Overall intensity for the week'),
  keyWorkouts: z
    .array(z.string())
    .describe('1-3 key workouts, e.g. ["Tempo 8km", "Long run 20km"]'),
  notes: z
    .string()
    .describe('Brief coaching note for this week'),
});

export const trainingBlockOutputSchema = z.object({
  phases: z
    .array(trainingPhaseSchema)
    .min(2)
    .describe('Ordered training phases covering all weeks'),
  weekOutlines: z
    .array(weekOutlineSchema)
    .min(4)
    .describe('One outline per week, ordered by weekNumber'),
});

export type TrainingBlockOutput = z.infer<typeof trainingBlockOutputSchema>;

/** Zod schema for a block with exactly `forwardWeekCount` week outlines (partial blocks). */
export const buildTrainingBlockOutputSchema = (forwardWeekCount: number) =>
  z.object({
    phases: z
      .array(trainingPhaseSchema)
      .min(2)
      .describe('Phases covering the active canonical week range'),
    weekOutlines: z
      .array(weekOutlineSchema)
      .length(forwardWeekCount)
      .describe('One outline per active week, ordered by ascending weekNumber'),
  });

export type TrainingBlockOutputPartial = z.infer<
  ReturnType<typeof buildTrainingBlockOutputSchema>
>;
