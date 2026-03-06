import {readFile} from 'node:fs/promises';
import process from 'node:process';

const SCENARIOS_PATH = new URL('./prompt-behavior-scenarios.json', import.meta.url);

const threshold = {
  minScenarioCount: 11,
  minReliabilityScore: 0.8,
};
const REQUIRED_IDS = new Set([
  'all-personas-followup-tool',
  'all-personas-confidence-policy',
  'all-personas-red-flag-refusal',
  'orchestrator-bounded-multi-agent',
  'orchestrator-structured-handoffs',
]);

const run = async () => {
  const raw = await readFile(SCENARIOS_PATH, 'utf8');
  const scenarios = JSON.parse(raw);
  if (!Array.isArray(scenarios)) {
    throw new Error('prompt-behavior-scenarios.json must be an array');
  }

  const scenarioCount = scenarios.length;
  const scenariosWithAssertions = scenarios.filter(
    (scenario) => Array.isArray(scenario?.mustInclude) && scenario.mustInclude.length > 0,
  ).length;
  const ids = scenarios
    .map((scenario) => (typeof scenario?.id === 'string' ? scenario.id : null))
    .filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingRequiredIds = [...REQUIRED_IDS].filter((id) => !ids.includes(id));
  const reliabilityScore =
    scenarioCount === 0 ? 0 : scenariosWithAssertions / scenarioCount;

  const result = {
    scenarioCount,
    scenariosWithAssertions,
    duplicateIds,
    missingRequiredIds,
    reliabilityScore: Number(reliabilityScore.toFixed(3)),
    pass:
      scenarioCount >= threshold.minScenarioCount &&
      reliabilityScore >= threshold.minReliabilityScore &&
      duplicateIds.length === 0 &&
      missingRequiredIds.length === 0,
  };

  console.log(`[ai-evals] ${JSON.stringify(result)}`);

  if (!result.pass) {
    console.error(
      `[ai-evals] FAIL gates. Need scenarioCount>=${threshold.minScenarioCount} and reliabilityScore>=${threshold.minReliabilityScore}`,
    );
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[ai-evals] FAIL unexpected error:', error);
  process.exit(1);
});
