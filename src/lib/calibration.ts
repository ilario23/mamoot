import type {OptimizationPriority} from '@/lib/trainingStrategy';
import type {RiskIntelligence} from '@/utils/trainingLoad';

export interface CalibrationInput {
  recentAdherence?: number | null;
  recentFatigue?: number | null;
  recentConfidence?: number | null;
  risk: RiskIntelligence;
}

export interface CalibrationResult {
  recommendedPriority: OptimizationPriority;
  reason: string;
}

export const calibratePriorityFromOutcomes = (
  input: CalibrationInput,
): CalibrationResult => {
  if (input.risk.riskLevel === 'high' || (input.recentFatigue ?? 3) >= 4) {
    return {
      recommendedPriority: 'injury_risk',
      reason: 'High risk or fatigue trend detected; prioritize safety and recovery.',
    };
  }

  if ((input.recentAdherence ?? 3) <= 2) {
    return {
      recommendedPriority: 'fitness_growth',
      reason: 'Low adherence detected; prioritize feasible sessions and routine stability.',
    };
  }

  if ((input.recentConfidence ?? 3) >= 4 && (input.recentAdherence ?? 3) >= 4) {
    return {
      recommendedPriority: 'race_performance',
      reason: 'Strong adherence and confidence support performance progression.',
    };
  }

  return {
    recommendedPriority: 'fitness_growth',
    reason: 'Default to consistency-first progression in neutral conditions.',
  };
};
