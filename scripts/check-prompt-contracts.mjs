import {readFile} from 'node:fs/promises';
import process from 'node:process';

const AI_PROMPTS_PATH = new URL('../src/lib/aiPrompts.ts', import.meta.url);

const REQUIRED_PHRASES = [
  {
    id: 'coach-no-weekly-plan-in-chat',
    phrase: 'write out weekly training plans',
  },
  {
    id: 'coach-medical-boundary',
    phrase: 'Never prescribe medication or diagnose injuries',
  },
  {
    id: 'nutritionist-allergy-safety',
    phrase:
      'NEVER suggest foods containing ingredients the athlete is allergic to',
  },
  {
    id: 'nutritionist-weekly-plan-first',
    phrase: 'ALWAYS call getWeeklyPlan as your first action',
  },
  {
    id: 'physio-no-diagnosis',
    phrase:
      'Never diagnose specific injuries or replace professional medical assessment',
  },
  {
    id: 'physio-no-full-weekly-plan-in-chat',
    phrase: 'write out full weekly strength/mobility programs',
  },
  {
    id: 'all-personas-followups-tool',
    phrase: 'ALWAYS call the suggestFollowUps tool',
  },
  {
    id: 'shared-data-first-context',
    phrase: 'always call at least one tool before answering',
  },
  {
    id: 'orchestrator-state-tooling',
    phrase: 'createOrchestratorGoal / updateOrchestratorGoal',
  },
  {
    id: 'orchestrator-handoff-tooling',
    phrase: 'createOrchestratorHandoff / updateOrchestratorHandoff',
  },
];

const run = async () => {
  const promptSource = await readFile(AI_PROMPTS_PATH, 'utf8');
  const missing = REQUIRED_PHRASES.filter(
    ({phrase}) => !promptSource.includes(phrase),
  );

  if (missing.length === 0) {
    console.log(
      `[prompt-contracts] PASS (${REQUIRED_PHRASES.length} checks verified)`,
    );
    return;
  }

  console.error('[prompt-contracts] FAIL missing checks:');
  for (const item of missing) {
    console.error(`- ${item.id}: "${item.phrase}"`);
  }
  process.exit(1);
};

run().catch((error) => {
  console.error('[prompt-contracts] FAIL unexpected error:', error);
  process.exit(1);
});
