import {readFile} from 'node:fs/promises';
import process from 'node:process';

const WEEKLY_PLAN_ROUTE = new URL('../app/api/ai/weekly-plan/route.ts', import.meta.url);
const TRAINING_BLOCK_ROUTE = new URL(
  '../app/api/ai/training-block/route.ts',
  import.meta.url,
);

const REQUIRED_WEEKLY_SNIPPETS = [
  'weekly_multi_agent_conflicts_checked',
  'weekly_multi_agent_repair_applied',
  'conflictCount',
  'highSeverityConflictCount',
  'roundCount',
  'specialistTurnsUsed',
  'repairTurnsUsed',
];

const REQUIRED_BLOCK_SNIPPETS = [
  'multiAgentEnabled',
  'roundCount',
  'specialistTurnsUsed',
  'collaborationSummary',
];

const run = async () => {
  const [weeklySource, blockSource] = await Promise.all([
    readFile(WEEKLY_PLAN_ROUTE, 'utf8'),
    readFile(TRAINING_BLOCK_ROUTE, 'utf8'),
  ]);

  const missingWeekly = REQUIRED_WEEKLY_SNIPPETS.filter(
    (snippet) => !weeklySource.includes(snippet),
  );
  const missingBlock = REQUIRED_BLOCK_SNIPPETS.filter(
    (snippet) => !blockSource.includes(snippet),
  );

  const result = {
    weeklyChecks: REQUIRED_WEEKLY_SNIPPETS.length,
    blockChecks: REQUIRED_BLOCK_SNIPPETS.length,
    missingWeekly,
    missingBlock,
    pass: missingWeekly.length === 0 && missingBlock.length === 0,
  };

  console.log(`[multi-agent-telemetry] ${JSON.stringify(result)}`);
  if (!result.pass) {
    console.error(
      '[multi-agent-telemetry] FAIL missing required telemetry fields/snippets',
    );
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[multi-agent-telemetry] FAIL unexpected error:', error);
  process.exit(1);
});
