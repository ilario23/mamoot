import process from 'node:process';

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requireNumberFromEnv = (key) => {
  const raw = process.env[key];
  if (raw == null || raw === '') {
    throw new Error(`Missing required env var: ${key}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env var: ${key}`);
  }
  return parsed;
};

const run = async () => {
  const sampleWeeks = parseNumber(process.env.COHORT_REPLAY_SAMPLE_WEEKS, 24);
  const baselineAdherence = requireNumberFromEnv('BASELINE_ADHERENCE');
  const candidateAdherence = requireNumberFromEnv('CANDIDATE_ADHERENCE');
  const baselineSafetyIncidents = requireNumberFromEnv('BASELINE_SAFETY_INCIDENTS');
  const candidateSafetyIncidents = requireNumberFromEnv('CANDIDATE_SAFETY_INCIDENTS');

  const adherenceDelta = Number((candidateAdherence - baselineAdherence).toFixed(3));
  const safetyDelta = candidateSafetyIncidents - baselineSafetyIncidents;

  const result = {
    sampleWeeks,
    baseline: {
      adherence: baselineAdherence,
      safetyIncidents: baselineSafetyIncidents,
    },
    candidate: {
      adherence: candidateAdherence,
      safetyIncidents: candidateSafetyIncidents,
    },
    deltas: {
      adherence: adherenceDelta,
      safetyIncidents: safetyDelta,
    },
    pass: adherenceDelta >= 0 && safetyDelta <= 0,
  };

  console.log(`[cohort-replay] ${JSON.stringify(result)}`);
  if (!result.pass) {
    console.error('[cohort-replay] FAIL candidate underperforms baseline.');
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[cohort-replay] FAIL unexpected error:', error);
  process.exit(1);
});
