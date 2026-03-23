import {describe, expect, it} from 'vitest';
import {appendRunPhasesMarkdown} from '@/lib/runPlanFormat';
import type {RunStep, RunStepLeaf} from '@/lib/weeklyPlanSchema';

const baseStep = (label: string): RunStep => ({
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

const baseLeaf = (label: string): RunStepLeaf => ({
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

describe('runPlanFormat', () => {
  it('renders nested repeat blocks with child rows', () => {
    const lines: string[] = [];
    appendRunPhasesMarkdown(lines, {
      type: 'intervals',
      description: 'Track intervals',
      warmupSteps: [baseStep('10 min easy')],
      mainSteps: [
        {
          ...baseStep('6 x sprint+jog'),
          stepKind: 'repeat_block',
          repeatCount: 6,
          subSteps: [
            {...baseLeaf('30s sprint'), durationMin: 0.5},
            {...baseLeaf('90s jog'), durationMin: 1.5},
          ],
        },
      ],
      cooldownSteps: [baseStep('10 min easy')],
    });
    const markdown = lines.join('\n');
    expect(markdown).toContain('6 x sprint+jog (×6)');
    expect(markdown).toContain('↳ 30s sprint');
    expect(markdown).toContain('↳ 90s jog');
  });
});
