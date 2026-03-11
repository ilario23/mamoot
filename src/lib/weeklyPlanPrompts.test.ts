import {describe, expect, it} from 'vitest';
import {buildCoachPipelinePrompt} from '@/lib/weeklyPlanPrompts';

describe('buildCoachPipelinePrompt', () => {
  it('includes pace-zone guidance and precedence rules', () => {
    const prompt = buildCoachPipelinePrompt({
      athleteName: 'Runner',
      hrZones: 'Z1 90-110 | Z2 111-130',
      paceZones: 'Z1: 6:00/km - 6:30/km (auto, confidence 70%)',
      weight: 70,
      trainingBalance: 40,
      weekStart: '2026-03-09',
      weekEnd: '2026-03-15',
      recentTraining: '- Week of 2026-03-02: 45.0 km',
      injuries: 'None',
      goal: '10k PR',
      personalRecords: '- 10.0 km at 4:10',
      preferences: null,
      lastWeekReview: null,
      trainingBlockContext: null,
      strategyLabel: 'Polarized',
      strategyDescription: 'Keep easy volume dominant.',
      optimizationPriorityLabel: 'Race performance',
      metricsSummary: null,
    });

    expect(prompt).toContain('Pace Zones (secondary guidance)');
    expect(prompt).toContain('Pace precedence rules');
    expect(prompt).toContain('If pace confidence is low or unavailable, omit targetPace');
  });
});
