import type {
  OptimizationPriority,
  StrategySelectionMode,
  TrainingStrategyPreset,
} from '@/lib/trainingStrategy';

export type CoachIntakeIntent = 'weekly_plan' | 'training_block';
export type WeeklyTargetWeek = 'current' | 'next';
export type WeeklyPlanIntensity = 'conservative' | 'balanced' | 'aggressive';

export interface WeeklyPlanRequirements {
  targetWeek: WeeklyTargetWeek;
  generationMode: 'full' | 'remaining_days';
  runDaysPerWeek: number;
  preferredLongRunDay: string;
  unavailableDays: string[];
  intensity: WeeklyPlanIntensity;
  focus: string;
  notes: string;
  strategySelectionMode: StrategySelectionMode;
  strategyPreset?: TrainingStrategyPreset;
  optimizationPriority: OptimizationPriority;
}

export interface TrainingBlockRequirements {
  goalEvent: string;
  goalDate: string;
  totalWeeks?: number;
  runDaysPerWeek: number;
  unavailableDays: string[];
  weeklyKmBackground: string;
  notes: string;
  strategySelectionMode: StrategySelectionMode;
  strategyPreset?: TrainingStrategyPreset;
  optimizationPriority: OptimizationPriority;
}

export const WEEKDAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const defaultWeeklyPlanRequirements = (): WeeklyPlanRequirements => ({
  targetWeek: 'next',
  generationMode: 'full',
  runDaysPerWeek: 5,
  preferredLongRunDay: 'Sunday',
  unavailableDays: [],
  intensity: 'balanced',
  focus: 'Build aerobic durability with one quality session.',
  notes: '',
  strategySelectionMode: 'auto',
  optimizationPriority: 'fitness_growth',
});

export const defaultTrainingBlockRequirements = (): TrainingBlockRequirements => ({
  goalEvent: '',
  goalDate: '',
  totalWeeks: undefined,
  runDaysPerWeek: 5,
  unavailableDays: [],
  weeklyKmBackground: '',
  notes: '',
  strategySelectionMode: 'auto',
  optimizationPriority: 'fitness_growth',
});

const NEW_PLAN_RE = /\b(new|create|build|generate|start)\b[\s\S]{0,40}\b(weekly\s*plan|plan for (this|next) week|next week plan|new plan)\b/i;
const NEW_BLOCK_RE = /\b(new|create|build|generate|start)\b[\s\S]{0,40}\b(training\s*block|block|macro plan|marathon block)\b/i;

export const detectCoachIntakeIntent = (
  text: string,
): CoachIntakeIntent | null => {
  const clean = text.trim();
  if (!clean) return null;
  if (NEW_BLOCK_RE.test(clean)) return 'training_block';
  if (NEW_PLAN_RE.test(clean)) return 'weekly_plan';
  return null;
};

export const summarizeWeeklyPlanRequirements = (
  input: WeeklyPlanRequirements,
): string => {
  const constraints =
    input.unavailableDays.length > 0
      ? `Unavailable days: ${input.unavailableDays.join(', ')}.`
      : 'No unavailable days provided.';
  return [
    `Target week: ${input.targetWeek}.`,
    `Generation mode: ${input.generationMode}.`,
    `Run days target: ${input.runDaysPerWeek}/week.`,
    `Preferred long run day: ${input.preferredLongRunDay}.`,
    `Intensity preference: ${input.intensity}.`,
    `Focus: ${input.focus}.`,
    constraints,
    input.notes.trim() ? `Notes: ${input.notes.trim()}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
};

export const summarizeTrainingBlockRequirements = (
  input: TrainingBlockRequirements,
): string => {
  const constraints =
    input.unavailableDays.length > 0
      ? `Unavailable days: ${input.unavailableDays.join(', ')}.`
      : 'No unavailable days provided.';
  return [
    `Goal event: ${input.goalEvent}.`,
    `Goal date: ${input.goalDate}.`,
    input.totalWeeks ? `Requested length: ${input.totalWeeks} weeks.` : null,
    `Run days target: ${input.runDaysPerWeek}/week.`,
    input.weeklyKmBackground
      ? `Current baseline: ${input.weeklyKmBackground}.`
      : null,
    constraints,
    input.notes.trim() ? `Notes: ${input.notes.trim()}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
};
