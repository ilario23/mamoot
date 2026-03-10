import {readFile} from 'node:fs/promises';
import process from 'node:process';

const SCENARIOS_PATH = new URL('./prompt-behavior-scenarios.json', import.meta.url);

const threshold = {
  minScenarioCount: 9,
  minReliabilityScore: 0.8,
};
const REQUIRED_IDS = new Set([
  'all-personas-followup-tool',
  'all-personas-confidence-policy',
  'all-personas-red-flag-refusal',
]);
const ALLOWED_SHARED_MUST_INCLUDE = new Set([
  'Head over to the **Weekly Plan** page and tap **Generate Weekly Plan**',
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
  const mustIncludeMap = new Map();
  for (const scenario of scenarios) {
    const scenarioId =
      typeof scenario?.id === 'string' ? scenario.id : '(missing-id)';
    const mustInclude = Array.isArray(scenario?.mustInclude)
      ? scenario.mustInclude
      : [];
    for (const rawPhrase of mustInclude) {
      if (typeof rawPhrase !== 'string') continue;
      const phrase = rawPhrase.trim();
      if (!phrase) continue;
      if (!mustIncludeMap.has(phrase)) mustIncludeMap.set(phrase, []);
      mustIncludeMap.get(phrase).push(scenarioId);
    }
  }
  const duplicateMustIncludePhrases = [...mustIncludeMap.entries()]
    .filter(([phrase, owners]) =>
      owners.length > 1 && !ALLOWED_SHARED_MUST_INCLUDE.has(phrase),
    )
    .map(([phrase, owners]) => ({phrase, scenarioIds: owners}));
  const reliabilityScore =
    scenarioCount === 0 ? 0 : scenariosWithAssertions / scenarioCount;

  const result = {
    scenarioCount,
    scenariosWithAssertions,
    duplicateIds,
    duplicateMustIncludePhrases,
    missingRequiredIds,
    reliabilityScore: Number(reliabilityScore.toFixed(3)),
    pass:
      scenarioCount >= threshold.minScenarioCount &&
      reliabilityScore >= threshold.minReliabilityScore &&
      duplicateIds.length === 0 &&
      duplicateMustIncludePhrases.length === 0 &&
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
