import {describe, expect, it} from 'vitest';
import {
  buildCoachDayRepairPrompt,
  buildCoachPipelinePrompt,
  buildWeekSkeletonPrompt,
  formatFrozenCoachWeekForRepair,
} from '@/lib/weeklyPlanPrompts';
import type {CoachWeekOutput, RunStep} from '@/lib/weeklyPlanSchema';

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
    expect(prompt).toContain('repeat_block');
    expect(prompt).toContain('subSteps');
  });

  it('builds a focused week skeleton prompt', () => {
    const prompt = buildWeekSkeletonPrompt({
      weekStart: '2026-03-09',
      weekEnd: '2026-03-15',
      recentTraining: '- Week of 2026-03-02: 45.0 km',
      goal: 'Half marathon',
      preferences: 'No hard workouts on Tuesday',
      trainingBlockContext: '- Volume Target: 40 km',
      optimizationPriorityLabel: 'Race performance',
      strategyLabel: 'Polarized',
      strategyDescription: 'Easy dominant',
      riskPolicyBanner: null,
    });
    expect(prompt).toContain('Output only day-level structure');
    expect(prompt).toContain('sessionType, dayTargetKm, dayTargetMin');
    expect(prompt).toContain('exactly 7 days');
  });

  it('buildCoachDayRepairPrompt scopes output to repair dates only', () => {
    const rs = (label: string): RunStep => ({
      label,
      durationMin: null,
      distanceKm: null,
      targetPace: null,
      targetZone: null,
      targetZoneId: null,
      recovery: null,
      repeatCount: null,
      notes: null,
      stepKind: null,
      subSteps: null,
    });
    const phases = {warmupSteps: [rs('w')], mainSteps: [rs('m')], cooldownSteps: [rs('c')]};
    const coach: CoachWeekOutput = {
      sessions: [
        {day: 'Monday', date: '2026-03-09', type: 'easy', description: 'E', ...phases, duration: '40 min', plannedDurationMin: 40, plannedDistanceKm: 8, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
        {day: 'Tuesday', date: '2026-03-10', type: 'intervals', description: 'I', ...phases, duration: '50 min', plannedDurationMin: 50, plannedDistanceKm: 9, targetPace: null, targetZone: 'Z4', targetZoneId: 4, notes: null},
        {day: 'Wednesday', date: '2026-03-11', type: 'rest', description: 'R', warmupSteps: [], mainSteps: [], cooldownSteps: [], duration: null, plannedDurationMin: null, plannedDistanceKm: null, targetPace: null, targetZone: null, targetZoneId: null, notes: null},
        {day: 'Thursday', date: '2026-03-12', type: 'easy', description: 'E2', ...phases, duration: '40 min', plannedDurationMin: 40, plannedDistanceKm: 7, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
        {day: 'Friday', date: '2026-03-13', type: 'tempo', description: 'T', ...phases, duration: '45 min', plannedDurationMin: 45, plannedDistanceKm: 8, targetPace: null, targetZone: 'Z3', targetZoneId: 3, notes: null},
        {day: 'Saturday', date: '2026-03-14', type: 'long', description: 'L', ...phases, duration: '90 min', plannedDurationMin: 90, plannedDistanceKm: 18, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
        {day: 'Sunday', date: '2026-03-15', type: 'recovery', description: 'Rec', ...phases, duration: '30 min', plannedDurationMin: 30, plannedDistanceKm: 5, targetPace: null, targetZone: 'Z1', targetZoneId: 1, notes: null},
      ],
    };
    const prompt = buildCoachDayRepairPrompt({
      weekStart: '2026-03-09',
      weekEnd: '2026-03-15',
      repairDates: ['2026-03-10', '2026-03-14'],
      frozenWeekSummary: formatFrozenCoachWeekForRepair(coach),
      distributionFeedback: 'score low',
      skeletonSummary: '- Mon easy',
      blockVolumeHint: null,
    });
    expect(prompt).toContain('2026-03-10');
    expect(prompt).toContain('2026-03-14');
    expect(prompt).toContain('ONLY these dates');
  });
});
