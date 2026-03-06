export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface ReliabilityEnvelope {
  confidence: ConfidenceTier;
  citationRequired: boolean;
  refusalRequired: boolean;
  rationale: string;
}

const RED_FLAG_PATTERNS: RegExp[] = [
  /\b(chest pain|faint|fainted|collapsed|collapse|severe pain)\b/i,
  /\b(blood in urine|blood in stool|coughing blood)\b/i,
  /\b(stress fracture|can't walk|cannot walk|unable to bear weight)\b/i,
  /\b(suicidal|self-harm)\b/i,
];

const LOW_CONFIDENCE_PATTERNS: RegExp[] = [
  /\b(diagnose|diagnosis|prescribe|medication)\b/i,
  /\b(medical emergency|clinical)\b/i,
];

export const detectRedFlagInput = (text: string): boolean =>
  RED_FLAG_PATTERNS.some((pattern) => pattern.test(text));

export const detectLowConfidenceDomain = (text: string): boolean =>
  LOW_CONFIDENCE_PATTERNS.some((pattern) => pattern.test(text));

export const buildReliabilityEnvelope = (input: {
  userText: string;
  hasGroundingData: boolean;
  citesNumbers: boolean;
}): ReliabilityEnvelope => {
  if (detectRedFlagInput(input.userText)) {
    return {
      confidence: 'low',
      citationRequired: false,
      refusalRequired: true,
      rationale: 'Red-flag safety pattern detected in user input.',
    };
  }

  if (detectLowConfidenceDomain(input.userText)) {
    return {
      confidence: 'low',
      citationRequired: false,
      refusalRequired: true,
      rationale: 'Clinical/diagnostic scope detected; require safe refusal.',
    };
  }

  if (!input.hasGroundingData) {
    return {
      confidence: 'low',
      citationRequired: true,
      refusalRequired: false,
      rationale: 'No athlete grounding data found.',
    };
  }

  if (!input.citesNumbers) {
    return {
      confidence: 'medium',
      citationRequired: true,
      refusalRequired: false,
      rationale: 'Grounding exists but no numeric evidence references.',
    };
  }

  return {
    confidence: 'high',
    citationRequired: true,
    refusalRequired: false,
    rationale: 'Grounded data and numeric references available.',
  };
};
