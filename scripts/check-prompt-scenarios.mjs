import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {
  evaluateClause,
  findBestSegmentMatch,
} from './lib/text-match.mjs';

const AI_PROMPTS_PATH = new URL('../src/lib/aiPrompts.ts', import.meta.url);
const SCENARIOS_PATH = new URL(
  './prompt-behavior-scenarios.json',
  import.meta.url,
);

const run = async () => {
  const [promptSource, scenariosSource] = await Promise.all([
    readFile(AI_PROMPTS_PATH, 'utf8'),
    readFile(SCENARIOS_PATH, 'utf8'),
  ]);

  const scenarios = JSON.parse(scenariosSource);
  if (!Array.isArray(scenarios)) {
    throw new Error('prompt-behavior-scenarios.json must be an array');
  }

  const failures = [];

  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== 'object') continue;
    const id = typeof scenario.id === 'string' ? scenario.id : 'unknown-scenario';
    const checks = Array.isArray(scenario.mustInclude) ? scenario.mustInclude : [];
    const scenarioFailures = [];
    for (let index = 0; index < checks.length; index += 1) {
      const check = checks[index];
      const result = evaluateClause(
        promptSource,
        check,
        `${id}#mustInclude-${index + 1}`,
      );
      if (!result.ok) scenarioFailures.push(result);
    }
    if (scenarioFailures.length > 0) {
      failures.push({id, scenarioFailures});
    }
  }

  if (failures.length === 0) {
    console.log(`[prompt-scenarios] PASS (${scenarios.length} scenarios verified)`);
    return;
  }

  console.error('[prompt-scenarios] FAIL missing scenario clauses:');
  for (const failure of failures) {
    console.error(`- ${failure.id}`);
    for (const scenarioFailure of failure.scenarioFailures) {
      console.error(`  - clause ${scenarioFailure.clause.id}`);
      for (const phrase of scenarioFailure.missing) {
        const nearest = findBestSegmentMatch(promptSource, phrase);
        console.error(`    - missing "${phrase}"`);
        console.error(
          `      nearest (${nearest.score.toFixed(2)}): "${nearest.segment}"`,
        );
      }
    }
  }
  process.exit(1);
};

run().catch((error) => {
  console.error('[prompt-scenarios] FAIL unexpected error:', error);
  process.exit(1);
});
