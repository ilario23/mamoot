import type {ActivitySummary} from '@/lib/activityModel';
import type {OptimizationPriority, TrainingStrategyPreset} from '@/lib/trainingStrategy';
import type {RiskIntelligence} from '@/utils/trainingLoad';

export interface TwinProfile {
  fatigueSensitivity: number;
  performanceResponsiveness: number;
  adherenceProbability: number;
  archetype: 'durability_limited' | 'balanced' | 'high_responder';
}

export interface CounterfactualOption {
  strategy: TrainingStrategyPreset;
  expectedPerformanceBenefit: number;
  injuryRiskPenalty: number;
  adherenceFeasibility: number;
  compositeScore: number;
  rationale: string;
}

const bounded = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const buildAthleteDigitalTwin = (input: {
  activities: ActivitySummary[];
  recentFeedback?: {
    adherence?: number | null;
    fatigue?: number | null;
    confidence?: number | null;
  } | null;
  risk: RiskIntelligence;
}): TwinProfile => {
  const recentRuns = [...input.activities]
    .filter((activity) => activity.type === 'Run')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 28);
  const first = recentRuns[0];
  const last = recentRuns[recentRuns.length - 1];
  const observedWeeks =
    first && last
      ? Math.max(
          1,
          Math.ceil(
            (new Date(first.date).getTime() - new Date(last.date).getTime() + 86400000) /
              (7 * 86400000),
          ),
        )
      : 1;
  const weeklyDistance =
    recentRuns.reduce((sum, run) => sum + run.distance, 0) / observedWeeks;

  const feedbackFatigue = input.recentFeedback?.fatigue ?? 3;
  const feedbackAdherence = input.recentFeedback?.adherence ?? 3;
  const feedbackConfidence = input.recentFeedback?.confidence ?? 3;

  const fatigueSensitivity = bounded(
    0.4 +
      input.risk.riskScore / 140 +
      (feedbackFatigue - 3) * 0.08 +
      (weeklyDistance > 55 ? 0.12 : 0),
    0.2,
    1,
  );

  const performanceResponsiveness = bounded(
    0.5 + (feedbackConfidence - 3) * 0.08 + (weeklyDistance > 40 ? 0.1 : 0),
    0.2,
    1,
  );

  const adherenceProbability = bounded(
    0.55 + (feedbackAdherence - 3) * 0.1 - (input.risk.riskScore > 60 ? 0.15 : 0),
    0.2,
    0.95,
  );

  const archetype: TwinProfile['archetype'] =
    fatigueSensitivity >= 0.75
      ? 'durability_limited'
      : performanceResponsiveness >= 0.75 && adherenceProbability >= 0.7
        ? 'high_responder'
        : 'balanced';

  return {
    fatigueSensitivity,
    performanceResponsiveness,
    adherenceProbability,
    archetype,
  };
};

export const rankCounterfactualStrategies = (input: {
  twin: TwinProfile;
  risk: RiskIntelligence;
  optimizationPriority: OptimizationPriority;
}): CounterfactualOption[] => {
  const basePresets: TrainingStrategyPreset[] = [
    'polarized_80_20',
    'pyramidal',
    'daniels_periodized',
    'lydiard_periodized',
  ];

  const options = basePresets.map((strategy) => {
    const strategyRiskMultiplier =
      strategy === 'daniels_periodized'
        ? 1.15
        : strategy === 'pyramidal'
          ? 1.05
          : strategy === 'lydiard_periodized'
            ? 1.0
            : 0.9;
    const strategyBenefitMultiplier =
      strategy === 'daniels_periodized'
        ? 1.1
        : strategy === 'lydiard_periodized'
          ? 1.05
          : strategy === 'pyramidal'
            ? 1.0
            : 0.95;
    const strategyAdherenceModifier =
      strategy === 'daniels_periodized'
        ? -0.08
        : strategy === 'polarized_80_20'
          ? 0.05
          : strategy === 'lydiard_periodized'
            ? 0.03
            : 0;

    const expectedPerformanceBenefit = bounded(
      input.twin.performanceResponsiveness * 100 * strategyBenefitMultiplier,
      10,
      95,
    );
    const injuryRiskPenalty = bounded(
      input.risk.riskScore * strategyRiskMultiplier * (0.7 + input.twin.fatigueSensitivity * 0.4),
      5,
      100,
    );
    const adherenceFeasibility = bounded(
      input.twin.adherenceProbability * 100 + strategyAdherenceModifier * 100,
      10,
      95,
    );

    const priorityBoost =
      input.optimizationPriority === 'race_performance'
        ? expectedPerformanceBenefit * 0.1
        : input.optimizationPriority === 'fitness_growth'
          ? adherenceFeasibility * 0.15
          : -injuryRiskPenalty * 0.05;

    const compositeScore =
      expectedPerformanceBenefit - injuryRiskPenalty * 0.65 + adherenceFeasibility * 0.45 + priorityBoost;

    return {
      strategy,
      expectedPerformanceBenefit: Number(expectedPerformanceBenefit.toFixed(1)),
      injuryRiskPenalty: Number(injuryRiskPenalty.toFixed(1)),
      adherenceFeasibility: Number(adherenceFeasibility.toFixed(1)),
      compositeScore: Number(compositeScore.toFixed(1)),
      rationale:
        strategy === 'polarized_80_20'
          ? 'Lower-risk intensity distribution supports durability and adherence.'
          : strategy === 'pyramidal'
            ? 'Balanced distribution with moderate progression pressure.'
            : strategy === 'daniels_periodized'
              ? 'Race-specific periodization boosts targeted performance upside.'
              : 'Base-to-peak progression supports durable long-term adaptation.',
    } as CounterfactualOption;
  });

  return options.sort((a, b) => b.compositeScore - a.compositeScore);
};
