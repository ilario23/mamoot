import {describe, expect, it} from 'vitest';
import {
  normalizeCoachSessionStepTotals,
  validateCoachSessionStepTotals,
  validateCoachWeekVolumeVsBlockTarget,
  validateCombinedWeekSemantics,
} from './planSemanticValidators';
import type {CoachWeekOutput, PhysioWeekOutput, RunStep, RunStepLeaf} from './weeklyPlanSchema';
import {validateCoachWeekOutput} from './planSemanticValidators';

const WEEK_DATES = [
  '2026-03-02',
  '2026-03-03',
  '2026-03-04',
  '2026-03-05',
  '2026-03-06',
  '2026-03-07',
  '2026-03-08',
];

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

const rl = (label: string): RunStepLeaf => ({
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

const runPhases = () => ({
  warmupSteps: [rs('Warmup')],
  mainSteps: [rs('Main set')],
  cooldownSteps: [rs('Cooldown')],
});

const emptyPhases = () => ({
  warmupSteps: [] as RunStep[],
  mainSteps: [] as RunStep[],
  cooldownSteps: [] as RunStep[],
});

const makeCoachWeek = (overrides: Partial<CoachWeekOutput> = {}): CoachWeekOutput => ({
  sessions: [
    {day: 'Monday', date: WEEK_DATES[0], type: 'easy', description: 'Easy run', ...runPhases(), duration: '45 min', plannedDurationMin: 45, plannedDistanceKm: 8, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
    {day: 'Tuesday', date: WEEK_DATES[1], type: 'intervals', description: 'VO2', ...runPhases(), duration: '50 min', plannedDurationMin: 50, plannedDistanceKm: 9, targetPace: null, targetZone: 'Z4', targetZoneId: 4, notes: null},
    {day: 'Wednesday', date: WEEK_DATES[2], type: 'easy', description: 'Easy run', ...runPhases(), duration: '40 min', plannedDurationMin: 40, plannedDistanceKm: 7, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
    {day: 'Thursday', date: WEEK_DATES[3], type: 'strength', description: 'Strength slot', ...emptyPhases(), duration: null, plannedDurationMin: null, plannedDistanceKm: null, targetPace: null, targetZone: null, targetZoneId: null, notes: null},
    {day: 'Friday', date: WEEK_DATES[4], type: 'rest', description: 'Rest', ...emptyPhases(), duration: null, plannedDurationMin: null, plannedDistanceKm: null, targetPace: null, targetZone: null, targetZoneId: null, notes: null},
    {day: 'Saturday', date: WEEK_DATES[5], type: 'long', description: 'Long run', ...runPhases(), duration: '90 min', plannedDurationMin: 90, plannedDistanceKm: 16, targetPace: null, targetZone: 'Z2', targetZoneId: 2, notes: null},
    {day: 'Sunday', date: WEEK_DATES[6], type: 'recovery', description: 'Recovery run', ...runPhases(), duration: '30 min', plannedDurationMin: 30, plannedDistanceKm: 5, targetPace: null, targetZone: 'Z1', targetZoneId: 1, notes: null},
  ],
  ...overrides,
});

const makePhysioWeek = (
  overrides: Partial<PhysioWeekOutput> = {},
): PhysioWeekOutput => ({
  sessions: [
    {
      day: 'Thursday',
      date: WEEK_DATES[3],
      type: 'strength',
      exercises: [{name: 'Split squat', sets: '3', reps: '8', tempo: null, notes: null}],
      duration: '35 min',
      notes: 'Light technique',
    },
  ],
  ...overrides,
});

describe('plan semantic validators', () => {
  it('rejects duplicate coach dates', () => {
    const coach = makeCoachWeek();
    coach.sessions[6].date = coach.sessions[5].date;
    const result = validateCombinedWeekSemantics(coach, makePhysioWeek());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('duplicate dates');
  });

  it('rejects physio sessions outside coach week', () => {
    const physio = makePhysioWeek({
      sessions: [
        {
          day: 'Monday',
          date: '2026-03-15',
          type: 'mobility',
          exercises: [],
          duration: null,
          notes: null,
        },
      ],
    });
    const result = validateCombinedWeekSemantics(makeCoachWeek(), physio);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('outside coach week');
  });

  it('rejects missing physio for coach strength slots', () => {
    const result = validateCombinedWeekSemantics(
      makeCoachWeek(),
      makePhysioWeek({sessions: []}),
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not filled by a strength physio session');
  });

  it('accepts coach week when planned run volume matches block target band', () => {
    const coach = makeCoachWeek();
    const result = validateCoachWeekVolumeVsBlockTarget(coach, 45);
    expect(result.ok).toBe(true);
  });

  it('rejects coach week when run volume is far from block target', () => {
    const coach = makeCoachWeek();
    const result = validateCoachWeekVolumeVsBlockTarget(coach, 80);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('outside the block target band');
  });

  it('rejects coach week when a run day omits plannedDistanceKm under block target', () => {
    const coach = makeCoachWeek();
    coach.sessions[0].plannedDistanceKm = null;
    const result = validateCoachWeekVolumeVsBlockTarget(coach, 45);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('plannedDistanceKm');
  });

  it('rejects coach week when a running day is missing a run phase', () => {
    const coach = makeCoachWeek();
    coach.sessions[0].cooldownSteps = [];
    const result = validateCoachWeekOutput(coach);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('cooldown steps');
  });

  it('rejects coach week when rest/strength has non-empty run phases', () => {
    const coach = makeCoachWeek();
    coach.sessions[4].warmupSteps = [rs('oops')];
    const result = validateCoachWeekOutput(coach);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('empty');
  });

  it('accepts coach week with full run phases', () => {
    expect(validateCoachWeekOutput(makeCoachWeek()).ok).toBe(true);
  });

  it('rejects strength immediately before hard/long when not marked low-DOMS', () => {
    const coach = makeCoachWeek();
    coach.sessions[2] = {
      day: 'Wednesday',
      date: WEEK_DATES[2],
      type: 'strength',
      description: 'Heavy lower-body strength',
      ...emptyPhases(),
      duration: null,
      plannedDurationMin: null,
      plannedDistanceKm: null,
      targetPace: null,
      targetZone: null,
      targetZoneId: null,
      notes: null,
    };
    coach.sessions[3] = {
      day: 'Thursday',
      date: WEEK_DATES[3],
      type: 'intervals',
      description: 'Track intervals',
      ...runPhases(),
      duration: '50 min',
      plannedDurationMin: 50,
      plannedDistanceKm: 9,
      targetPace: null,
      targetZone: 'Z4',
      targetZoneId: 4,
      notes: null,
    };
    const result = validateCoachWeekOutput(coach);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('too close');
  });

  it('accepts strength before hard/long when description signals low-DOMS', () => {
    const coach = makeCoachWeek();
    coach.sessions[2] = {
      day: 'Wednesday',
      date: WEEK_DATES[2],
      type: 'strength',
      description: 'Light mobility, core, and activation — low fatigue',
      ...emptyPhases(),
      duration: null,
      plannedDurationMin: null,
      plannedDistanceKm: null,
      targetPace: null,
      targetZone: null,
      targetZoneId: null,
      notes: null,
    };
    coach.sessions[3] = {
      day: 'Thursday',
      date: WEEK_DATES[3],
      type: 'intervals',
      description: 'Track intervals',
      ...runPhases(),
      duration: '50 min',
      plannedDurationMin: 50,
      plannedDistanceKm: 9,
      targetPace: null,
      targetZone: 'Z4',
      targetZoneId: 4,
      notes: null,
    };
    expect(validateCoachWeekOutput(coach).ok).toBe(true);
  });

  it('rejects mismatched step totals and plannedDistanceKm', () => {
    const coach = makeCoachWeek();
    coach.sessions[0].plannedDistanceKm = 5;
    coach.sessions[0].warmupSteps = [{...rs('Warmup'), distanceKm: 2}];
    coach.sessions[0].mainSteps = [{...rs('Main'), distanceKm: 5}];
    coach.sessions[0].cooldownSteps = [{...rs('Cooldown'), distanceKm: 1}];
    const result = validateCoachSessionStepTotals(coach);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Distance mismatch');
  });

  it('normalizes mismatched step totals to plannedDistanceKm', () => {
    const coach = makeCoachWeek();
    coach.sessions[0].plannedDistanceKm = 6;
    coach.sessions[0].warmupSteps = [{...rs('Warmup'), distanceKm: 2}];
    coach.sessions[0].mainSteps = [{...rs('Main'), distanceKm: 6}];
    coach.sessions[0].cooldownSteps = [{...rs('Cooldown'), distanceKm: 2}];
    const changed = normalizeCoachSessionStepTotals(coach);
    expect(changed).toBe(true);
    expect(validateCoachSessionStepTotals(coach).ok).toBe(true);
  });

  it('normalizes distance in repeat_block subSteps to match plannedDistanceKm', () => {
    const coach = makeCoachWeek();
    // 2 + 5*(2+1) + 1 = 18 km in steps vs 12 planned — distances only on leaves inside repeat_block
    coach.sessions[1].plannedDistanceKm = 12;
    coach.sessions[1].warmupSteps = [{...rs('Warmup'), distanceKm: 2}];
    coach.sessions[1].mainSteps = [
      {
        ...rs('5 x interval'),
        stepKind: 'repeat_block',
        repeatCount: 5,
        distanceKm: null,
        subSteps: [
          {...rl('800m'), distanceKm: 2},
          {...rl('jog'), distanceKm: 1},
        ],
      },
    ];
    coach.sessions[1].cooldownSteps = [{...rs('Cooldown'), distanceKm: 1}];
    expect(validateCoachSessionStepTotals(coach).ok).toBe(false);
    const changed = normalizeCoachSessionStepTotals(coach);
    expect(changed).toBe(true);
    expect(validateCoachSessionStepTotals(coach).ok).toBe(true);
  });

  it('supports nested repeat-block step structures', () => {
    const coach = makeCoachWeek();
    coach.sessions[1].mainSteps = [
      {
        ...rs('6 x sprint+jog'),
        stepKind: 'repeat_block',
        repeatCount: 6,
        subSteps: [
          {...rl('30s sprint'), durationMin: 0.5},
          {...rl('90s jog'), durationMin: 1.5},
        ],
      },
    ];
    expect(validateCoachWeekOutput(coach).ok).toBe(true);
  });
});
