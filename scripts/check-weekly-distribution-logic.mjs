import {readFile} from 'node:fs/promises';
import process from 'node:process';

const WEEKLY_PLAN_ROUTE = new URL('../app/api/ai/weekly-plan/route.ts', import.meta.url);
const DISTRIBUTION_EVALUATOR = new URL(
  '../src/lib/weeklyDistributionEvaluator.ts',
  import.meta.url,
);
const WEEKLY_PROMPTS = new URL('../src/lib/weeklyPlanPrompts.ts', import.meta.url);

const REQUIRED_ROUTE_SNIPPETS = [
  'evaluateCoachWeeklyDistribution',
  'evaluateUnifiedWeeklyDistribution',
  'weekly_distribution_coach_evaluated',
  'weekly_distribution_final_evaluated',
  'weekly_distribution_final_repaired',
  'distributionScore',
  'distributionAccepted',
  'distributionRepairApplied',
];

const REQUIRED_EVALUATOR_SNIPPETS = [
  'DEFAULT_DISTRIBUTION_POLICY',
  'acceptanceThreshold',
  'hard_run_day_overload',
  'adjacent_hard_days',
  'weekend_load_too_high',
  'summarizeDistributionForPrompt',
];

const REQUIRED_PROMPT_SNIPPETS = [
  'Weekly distribution targets (deterministic scorer aligned)',
  'Distribution alignment with deterministic scorer',
];

const run = async () => {
  const [routeSource, evaluatorSource, promptsSource] = await Promise.all([
    readFile(WEEKLY_PLAN_ROUTE, 'utf8'),
    readFile(DISTRIBUTION_EVALUATOR, 'utf8'),
    readFile(WEEKLY_PROMPTS, 'utf8'),
  ]);

  const missingRoute = REQUIRED_ROUTE_SNIPPETS.filter(
    (snippet) => !routeSource.includes(snippet),
  );
  const missingEvaluator = REQUIRED_EVALUATOR_SNIPPETS.filter(
    (snippet) => !evaluatorSource.includes(snippet),
  );
  const missingPrompts = REQUIRED_PROMPT_SNIPPETS.filter(
    (snippet) => !promptsSource.includes(snippet),
  );

  const result = {
    routeChecks: REQUIRED_ROUTE_SNIPPETS.length,
    evaluatorChecks: REQUIRED_EVALUATOR_SNIPPETS.length,
    promptChecks: REQUIRED_PROMPT_SNIPPETS.length,
    missingRoute,
    missingEvaluator,
    missingPrompts,
    pass:
      missingRoute.length === 0 &&
      missingEvaluator.length === 0 &&
      missingPrompts.length === 0,
  };

  console.log(`[weekly-distribution-logic] ${JSON.stringify(result)}`);
  if (!result.pass) {
    console.error(
      '[weekly-distribution-logic] FAIL missing required distribution logic snippets',
    );
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[weekly-distribution-logic] FAIL unexpected error:', error);
  process.exit(1);
});
