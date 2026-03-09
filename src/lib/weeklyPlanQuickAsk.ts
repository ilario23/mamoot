export * from "./physioPlanSlots";
export * from "./physioPlanWorkflow";
export * from "./weeklyPlanQuickAskCollab";
import type {MentionReference} from './mentionTypes';

export type WeeklyPlanQuickAskAction =
  | 'skip_day'
  | 'injured'
  | 'reduce_volume'
  | 'swap_workouts'
  | 'regenerate'
  | 'create_weekly_plan'
  | 'create_training_block';

export interface WeeklyPlanQuickAskOption {
  id: WeeklyPlanQuickAskAction;
  label: string;
}

export interface WeeklyPlanQuickAskContext {
  weekTitle?: string | null;
  weekStart?: string | null;
  athleteGoal?: string | null;
  allergyNames?: string[] | null;
  injurySummaries?: string[] | null;
  trainingBalance?: number | null;
}

export interface WeeklyPlanQuickAskDraft {
  id: string;
  persona: 'coach';
  text: string;
  mentions: MentionReference[];
  startNewConversation: boolean;
}

export const WEEKLY_PLAN_QUICK_ASK_OPTIONS: WeeklyPlanQuickAskOption[] = [
  {id: 'skip_day', label: 'Skip a day'},
  {id: 'injured', label: "I'm injured"},
  {id: 'reduce_volume', label: 'Reduce volume'},
  {id: 'swap_workouts', label: 'Swap workouts'},
  {id: 'regenerate', label: 'Regenerate week'},
];

const PLAN_MENTION: MentionReference = {
  categoryId: 'plan',
  label: 'Weekly Plan',
};

export const isWeeklyPlanQuickAskAction = (
  value: string | null,
): value is WeeklyPlanQuickAskAction =>
  value === 'skip_day' ||
  value === 'injured' ||
  value === 'reduce_volume' ||
  value === 'swap_workouts' ||
  value === 'regenerate' ||
  value === 'create_weekly_plan' ||
  value === 'create_training_block';

const buildAthleteContextLine = (context?: WeeklyPlanQuickAskContext): string => {
  const hasGoal = Boolean(context?.athleteGoal?.trim());
  const hasAllergies = (context?.allergyNames?.length ?? 0) > 0;
  const hasInjuries = (context?.injurySummaries?.length ?? 0) > 0;
  const hasTrainingBalance = typeof context?.trainingBalance === 'number';
  if (!hasGoal && !hasAllergies && !hasInjuries && !hasTrainingBalance) {
    return '';
  }
  return 'Consider my goal, training balance, and current training status from my profile data.';
};

const buildPlanContextLine = (context?: WeeklyPlanQuickAskContext): string => {
  const title = context?.weekTitle?.trim();
  const weekStart = context?.weekStart?.trim();
  if (title && weekStart) return `Current plan: ${title} (${weekStart}).`;
  if (title) return `Current plan: ${title}.`;
  if (weekStart) return `Current plan week starting ${weekStart}.`;
  return 'Please use my current weekly plan as context.';
};

export const buildWeeklyPlanQuickAskText = (
  action: WeeklyPlanQuickAskAction,
  context?: WeeklyPlanQuickAskContext,
): string => {
  const planContext = buildPlanContextLine(context);
  const athleteContext = buildAthleteContextLine(context);
  const withAthleteContext = (text: string) =>
    athleteContext ? `${text}\n${athleteContext}` : text;
  switch (action) {
    case 'skip_day':
      return `${planContext} - I need to skip one training day this week. How should I adjust the rest of the week? `;
    case 'injured':
      return `${planContext} - I have a new injury concern. Help me adjust this week safely with lower-risk alternatives and recovery guidance.`;
    case 'reduce_volume':
      return `${planContext} - Please reduce this week's overall running volume while keeping the key intent of the week. Suggest exact adjustments.`;
    case 'swap_workouts':
      return `${planContext} - I want to swap workout days this week. Propose the best workout swaps while preserving session quality and recovery balance.`;
    case 'regenerate':
      return `${planContext} - Please regenerate this weekly plan from scratch based on my current context and constraints.`;
    case 'create_weekly_plan':
      return withAthleteContext(
        "I want to create a new weekly plan. Please start the chat planning flow for a weekly plan, propose sensible defaults from my profile, and ask me only the missing details one by one before generating.",
      );
    case 'create_training_block':
      return withAthleteContext(
        "I want to create a new training block. Please start the chat planning flow for a training block, infer a smart starting draft from my profile, and then ask for only the missing key inputs (event/date/constraints) before generating.",
      );
    default:
      return `${planContext} - Please review this week and suggest adjustments.`;
  }
};

export const buildWeeklyPlanQuickAskDraft = (
  action: WeeklyPlanQuickAskAction,
  context?: WeeklyPlanQuickAskContext,
): WeeklyPlanQuickAskDraft => ({
  id: `weekly-quick-ask-${action}-${Date.now()}`,
  persona: 'coach',
  text: buildWeeklyPlanQuickAskText(action, context),
  mentions:
    action === 'create_weekly_plan' || action === 'create_training_block'
      ? []
      : [PLAN_MENTION],
  startNewConversation: true,
});
