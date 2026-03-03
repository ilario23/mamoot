export type TrainingStrategyPreset =
  | 'polarized_80_20'
  | 'pyramidal'
  | 'daniels_periodized'
  | 'lydiard_periodized';

export type StrategySelectionMode = 'auto' | 'preset';

export type OptimizationPriority =
  | 'race_performance'
  | 'fitness_growth'
  | 'injury_risk';

export interface StrategyRecommendationInput {
  acwr: number | null;
  tsb: number | null;
  monotony: number | null;
  goal: string | null;
  priority: OptimizationPriority;
}

export interface StrategyRecommendation {
  strategy: TrainingStrategyPreset;
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}

export const STRATEGY_PRESET_LABELS: Record<TrainingStrategyPreset, string> = {
  polarized_80_20: 'Polarized 80/20',
  pyramidal: 'Pyramidal',
  daniels_periodized: 'Daniels-Style Periodized',
  lydiard_periodized: 'Lydiard Base/Build/Peak',
};

export const OPTIMIZATION_PRIORITY_LABELS: Record<OptimizationPriority, string> = {
  race_performance: 'Race Performance',
  fitness_growth: 'Fitness Growth',
  injury_risk: 'Injury-Risk Aware',
};

export const AUTO_STRATEGY_LABEL = 'Auto (recommended)';

export const describeAutoStrategySelection = (): string =>
  'The system automatically picks the most suitable preset from your current load/readiness metrics, goal context, and selected optimization priority.';

export const describeStrategyPreset = (
  preset: TrainingStrategyPreset,
): string => {
  const map: Record<TrainingStrategyPreset, string> = {
    polarized_80_20:
      'About 80% of total training time stays low intensity (easy aerobic work) and about 20% is high intensity (interval/VO2-type quality), with very little middle-zone tempo. This works well for endurance progression while limiting chronic fatigue from too much moderate work. Typical week: several easy runs, one long run, and 1-2 clearly hard sessions.',
    pyramidal:
      'Most training remains easy, a meaningful secondary portion is moderate (tempo/threshold), and only a small fraction is very high intensity. This is often practical for consistent weekly training and tends to balance performance gains with recovery better than high-intensity-heavy plans. Typical week: easy mileage foundation, one threshold-oriented workout, optional light speed support.',
    daniels_periodized:
      'A phased approach inspired by Daniels-style planning: aerobic/base development first, then specific quality blocks (threshold, interval, race-pace work), followed by a structured taper before key events. It is race-performance oriented and emphasizes the right workout type at the right phase. Best when you have a target race date and want progressive specificity.',
    lydiard_periodized:
      'Classic base-to-peak progression: a strong aerobic base period, then hill/strength emphasis, then sharpening/speed, and finally taper. This is especially useful when long-term aerobic durability is a priority and the athlete benefits from clear phase separation. It can be conservative early and more specific later as race day approaches.',
  };
  return map[preset];
};

const isHighFatigue = (acwr: number | null, tsb: number | null): boolean => {
  if (acwr != null && acwr > 1.3) return true;
  if (tsb != null && tsb < -12) return true;
  return false;
};

export const recommendStrategy = ({
  acwr,
  tsb,
  monotony,
  goal,
  priority,
}: StrategyRecommendationInput): StrategyRecommendation => {
  const hasRaceIntent = !!goal && /(race|marathon|half|10k|5k|event)/i.test(goal);
  const highFatigue = isHighFatigue(acwr, tsb);
  const highMonotony = monotony != null && monotony > 2;

  if (priority === 'injury_risk' || highFatigue || highMonotony) {
    return {
      strategy: 'pyramidal',
      confidence: highFatigue ? 'high' : 'medium',
      rationale:
        'Current load profile suggests conservative progression with more moderate work and tighter fatigue control.',
    };
  }

  if (priority === 'race_performance' && hasRaceIntent) {
    return {
      strategy: 'daniels_periodized',
      confidence: 'high',
      rationale:
        'Race-oriented goals benefit from explicit phase progression and structured sharpening.',
    };
  }

  if (priority === 'fitness_growth') {
    return {
      strategy: 'polarized_80_20',
      confidence: 'medium',
      rationale:
        'A polarized split is robust for long-term aerobic growth while preserving quality work.',
    };
  }

  return {
    strategy: 'lydiard_periodized',
    confidence: 'low',
    rationale:
      'Defaulting to classic base/build/peak progression when constraints are neutral.',
  };
};
