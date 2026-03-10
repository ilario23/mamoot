import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {
  evaluateClause,
  findBestSegmentMatch,
} from './lib/text-match.mjs';

const AI_PROMPTS_PATH = new URL('../src/lib/aiPrompts.ts', import.meta.url);
const CONTRACTS_PATH = new URL('./prompt-contracts.json', import.meta.url);

const run = async () => {
  const [promptSource, contractsSource] = await Promise.all([
    readFile(AI_PROMPTS_PATH, 'utf8'),
    readFile(CONTRACTS_PATH, 'utf8'),
  ]);
  const contracts = JSON.parse(contractsSource);
  if (!Array.isArray(contracts)) {
    throw new Error('prompt-contracts.json must be an array');
  }

  const failures = [];
  for (let index = 0; index < contracts.length; index += 1) {
    const rawClause = contracts[index];
    const fallbackId = `prompt-contract-${index + 1}`;
    const result = evaluateClause(promptSource, rawClause, fallbackId);
    if (result.ok) continue;
    failures.push(result);
  }

  if (failures.length === 0) {
    console.log(
      `[prompt-contracts] PASS (${contracts.length} checks verified)`,
    );
    return;
  }

  console.error('[prompt-contracts] FAIL missing checks:');
  for (const failure of failures) {
    console.error(`- ${failure.clause.id}`);
    for (const phrase of failure.missing) {
      const nearest = findBestSegmentMatch(promptSource, phrase);
      console.error(`  - missing "${phrase}"`);
      console.error(
        `    nearest (${nearest.score.toFixed(2)}): "${nearest.segment}"`,
      );
    }
  }
  process.exit(1);
};

run().catch((error) => {
  console.error('[prompt-contracts] FAIL unexpected error:', error);
  process.exit(1);
});
