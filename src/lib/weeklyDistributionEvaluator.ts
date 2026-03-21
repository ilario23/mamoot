import type {UnifiedSession} from '@/lib/cacheTypes';
import type {CoachWeekOutput} from '@/lib/weeklyPlanSchema';

const HARD_RUN_TYPES = new Set(['intervals', 'tempo', 'threshold', 'race', 'vo2']);
const MODERATE_RUN_TYPES = new Set(['steady', 'marathon', 'threshold']);
const RECOVERY_RUN_TYPES = new Set(['easy', 'recovery']);

const TYPE_WEIGHTS = {
  hardDensity: 40,
  runDensity: 35,
  restDensity: 25,
} as const;

const INTENSITY_WEIGHTS = {
  hardMinutes: 55,
  moderateMinutes: 25,
  easyMinutes: 20,
} as const;

const SPREAD_WEIGHTS = {
  adjacentHardDays: 35,
  hardGap: 25,
  weekendLoadBias: 20,
  consecutiveRunStreak: 20,
} as const;

export interface DistributionIssue {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  penalty: number;
}

export interface DistributionMetrics {
  runDays: number;
  restDays: number;
  hardRunDays: number;
  moderateRunDays: number;
  easyRunDays: number;
  totalRunMinutes: number;
  hardMinutes: number;
  moderateMinutes: number;
  easyMinutes: number;
}

export interface DistributionEvaluation {
  score: number;
  threshold: number;
  accepted: boolean;
  subscores: {
    sessionType: number;
    intensity: number;
    loadSpread: number;
  };
  metrics: DistributionMetrics;
  issues: DistributionIssue[];
  repairHints: string[];
}

export interface DistributionPolicy {
  acceptanceThreshold: number;
  strictSafetyThreshold: number;
  targets: {
    runDays: {min: number; max: number};
    restDays: {min: number; max: number};
    hardRunDays: {min: number; max: number};
    hardIntensitySharePct: {min: number; max: number};
    moderateIntensitySharePct: {min: number; max: number};
    maxConsecutiveRunDays: number;
    maxAdjacentHardPairs: number;
    maxWeekendLoadSharePct: number;
  };
}

export const DEFAULT_DISTRIBUTION_POLICY: DistributionPolicy = {
  acceptanceThreshold: 70,
  strictSafetyThreshold: 50,
  targets: {
    runDays: {min: 3, max: 6},
    restDays: {min: 1, max: 3},
    hardRunDays: {min: 1, max: 3},
    hardIntensitySharePct: {min: 10, max: 30},
    moderateIntensitySharePct: {min: 10, max: 35},
    maxConsecutiveRunDays: 4,
    maxAdjacentHardPairs: 0,
    maxWeekendLoadSharePct: 55,
  },
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, value));
const toZoneId = (value?: number): 1 | 2 | 3 | 4 | 5 | 6 | undefined => {
  if (value == null) return undefined;
  if (value < 1 || value > 6) return undefined;
  return value as 1 | 2 | 3 | 4 | 5 | 6;
};

const parseDurationMinutes = (value?: string): number | null => {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*h(?:our|ours)?/);
  const minMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m(?:in|ins|inute|inutes)?/);

  if (hourMatch || minMatch) {
    const hours = hourMatch ? Number.parseFloat(hourMatch[1]) : 0;
    const minutes = minMatch ? Number.parseFloat(minMatch[1]) : 0;
    return Math.round(hours * 60 + minutes);
  }

  if (normalized.includes(':')) {
    const parts = normalized.split(':').map((part) => Number.parseFloat(part));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return Math.round(parts[0] * 60 + parts[1]);
    }
  }

  const standaloneNumber = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!standaloneNumber) return null;
  return Math.round(Number.parseFloat(standaloneNumber[1]));
};

const classifyRunIntensity = (session: {
  type: string;
  targetZone?: string;
  targetZoneId?: number;
}): 'hard' | 'moderate' | 'easy' => {
  const type = session.type.toLowerCase();
  const zone = session.targetZone?.toLowerCase() ?? '';
  const zoneId = session.targetZoneId;

  if (zoneId === 4 || zoneId === 5 || zoneId === 6) {
    return 'hard';
  }
  if (zoneId === 3) {
    return 'moderate';
  }
  if (zoneId === 1 || zoneId === 2) {
    return 'easy';
  }

  if (
    HARD_RUN_TYPES.has(type) ||
    zone.includes('z4') ||
    zone.includes('z5') ||
    zone.includes('threshold') ||
    zone.includes('vo2')
  ) {
    return 'hard';
  }

  if (
    MODERATE_RUN_TYPES.has(type) ||
    zone.includes('z3') ||
    zone.includes('tempo') ||
    zone.includes('steady')
  ) {
    return 'moderate';
  }

  if (RECOVERY_RUN_TYPES.has(type) || zone.includes('z1') || zone.includes('z2')) {
    return 'easy';
  }

  // Conservative default: unknown run intent is treated as moderate.
  return 'moderate';
};

const getConsecutiveRunDays = (sessions: UnifiedSession[]): number => {
  let longest = 0;
  let current = 0;

  for (const session of sessions) {
    if (session.run) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
};

const countAdjacentHardPairs = (sessions: UnifiedSession[]): number => {
  let pairs = 0;
  for (let index = 0; index < sessions.length - 1; index += 1) {
    const current = sessions[index].run;
    const next = sessions[index + 1].run;
    if (!current || !next) continue;
    const currentIntensity = classifyRunIntensity(current);
    const nextIntensity = classifyRunIntensity(next);
    if (currentIntensity === 'hard' && nextIntensity === 'hard') {
      pairs += 1;
    }
  }
  return pairs;
};

const calcWeekendLoadSharePct = (sessions: UnifiedSession[]): number => {
  let totalMinutes = 0;
  let weekendMinutes = 0;

  for (let index = 0; index < sessions.length; index += 1) {
    const run = sessions[index].run;
    if (!run) continue;
    const minutes = run.plannedDurationMin ?? parseDurationMinutes(run.duration) ?? 45;
    totalMinutes += minutes;
    if (index >= 5) {
      weekendMinutes += minutes;
    }
  }

  if (totalMinutes === 0) return 0;
  return Math.round((weekendMinutes / totalMinutes) * 100);
};

const buildMetrics = (sessions: UnifiedSession[]): DistributionMetrics => {
  let runDays = 0;
  let restDays = 0;
  let hardRunDays = 0;
  let moderateRunDays = 0;
  let easyRunDays = 0;
  let totalRunMinutes = 0;
  let hardMinutes = 0;
  let moderateMinutes = 0;
  let easyMinutes = 0;

  for (const session of sessions) {
    if (!session.run) {
      if (!session.physio && !session.strengthSlot) restDays += 1;
      continue;
    }

    runDays += 1;
    const minutes = session.run.plannedDurationMin ?? parseDurationMinutes(session.run.duration) ?? 45;
    const intensity = classifyRunIntensity(session.run);

    totalRunMinutes += minutes;
    if (intensity === 'hard') {
      hardRunDays += 1;
      hardMinutes += minutes;
      continue;
    }
    if (intensity === 'moderate') {
      moderateRunDays += 1;
      moderateMinutes += minutes;
      continue;
    }
    easyRunDays += 1;
    easyMinutes += minutes;
  }

  return {
    runDays,
    restDays,
    hardRunDays,
    moderateRunDays,
    easyRunDays,
    totalRunMinutes,
    hardMinutes,
    moderateMinutes,
    easyMinutes,
  };
};

const evaluateSessionType = (
  metrics: DistributionMetrics,
  policy: DistributionPolicy,
): {score: number; issues: DistributionIssue[]} => {
  const issues: DistributionIssue[] = [];
  let penalty = 0;

  if (metrics.hardRunDays > policy.targets.hardRunDays.max) {
    const overflow = metrics.hardRunDays - policy.targets.hardRunDays.max;
    const nextPenalty = overflow * TYPE_WEIGHTS.hardDensity;
    penalty += nextPenalty;
    issues.push({
      code: 'hard_run_day_overload',
      severity: 'critical',
      message: `Hard run days exceed target (${metrics.hardRunDays} vs max ${policy.targets.hardRunDays.max}).`,
      penalty: nextPenalty,
    });
  }

  if (metrics.runDays < policy.targets.runDays.min || metrics.runDays > policy.targets.runDays.max) {
    const distance = metrics.runDays < policy.targets.runDays.min
      ? policy.targets.runDays.min - metrics.runDays
      : metrics.runDays - policy.targets.runDays.max;
    const nextPenalty = distance * TYPE_WEIGHTS.runDensity;
    penalty += nextPenalty;
    issues.push({
      code: 'run_day_balance_out_of_range',
      severity: 'warning',
      message: `Run day count out of target range (${metrics.runDays} vs ${policy.targets.runDays.min}-${policy.targets.runDays.max}).`,
      penalty: nextPenalty,
    });
  }

  if (metrics.restDays < policy.targets.restDays.min || metrics.restDays > policy.targets.restDays.max) {
    const distance = metrics.restDays < policy.targets.restDays.min
      ? policy.targets.restDays.min - metrics.restDays
      : metrics.restDays - policy.targets.restDays.max;
    const nextPenalty = distance * TYPE_WEIGHTS.restDensity;
    penalty += nextPenalty;
    issues.push({
      code: 'rest_day_balance_out_of_range',
      severity: 'warning',
      message: `Rest day count out of target range (${metrics.restDays} vs ${policy.targets.restDays.min}-${policy.targets.restDays.max}).`,
      penalty: nextPenalty,
    });
  }

  return {score: clampScore(100 - penalty), issues};
};

const evaluateIntensity = (
  metrics: DistributionMetrics,
  policy: DistributionPolicy,
): {score: number; issues: DistributionIssue[]} => {
  if (metrics.totalRunMinutes === 0) {
    return {
      score: 100,
      issues: [],
    };
  }

  const hardShare = Math.round((metrics.hardMinutes / metrics.totalRunMinutes) * 100);
  const moderateShare = Math.round((metrics.moderateMinutes / metrics.totalRunMinutes) * 100);
  const issues: DistributionIssue[] = [];
  let penalty = 0;

  if (
    hardShare < policy.targets.hardIntensitySharePct.min ||
    hardShare > policy.targets.hardIntensitySharePct.max
  ) {
    const distance = hardShare < policy.targets.hardIntensitySharePct.min
      ? policy.targets.hardIntensitySharePct.min - hardShare
      : hardShare - policy.targets.hardIntensitySharePct.max;
    const nextPenalty = Math.round((distance / 10) * INTENSITY_WEIGHTS.hardMinutes);
    penalty += nextPenalty;
    issues.push({
      code: 'hard_intensity_share_out_of_range',
      severity: hardShare > policy.targets.hardIntensitySharePct.max ? 'critical' : 'warning',
      message: `Hard intensity share out of range (${hardShare}% vs ${policy.targets.hardIntensitySharePct.min}-${policy.targets.hardIntensitySharePct.max}%).`,
      penalty: nextPenalty,
    });
  }

  if (
    moderateShare < policy.targets.moderateIntensitySharePct.min ||
    moderateShare > policy.targets.moderateIntensitySharePct.max
  ) {
    const distance = moderateShare < policy.targets.moderateIntensitySharePct.min
      ? policy.targets.moderateIntensitySharePct.min - moderateShare
      : moderateShare - policy.targets.moderateIntensitySharePct.max;
    const nextPenalty = Math.round((distance / 10) * INTENSITY_WEIGHTS.moderateMinutes);
    penalty += nextPenalty;
    issues.push({
      code: 'moderate_intensity_share_out_of_range',
      severity: 'warning',
      message: `Moderate intensity share out of range (${moderateShare}% vs ${policy.targets.moderateIntensitySharePct.min}-${policy.targets.moderateIntensitySharePct.max}%).`,
      penalty: nextPenalty,
    });
  }

  if (metrics.easyMinutes <= metrics.hardMinutes + metrics.moderateMinutes) {
    const nextPenalty = INTENSITY_WEIGHTS.easyMinutes;
    penalty += nextPenalty;
    issues.push({
      code: 'easy_minutes_not_dominant',
      severity: 'warning',
      message:
        'Easy minutes are not the dominant share of weekly running load. Shift one quality/steady day to easy aerobic.',
      penalty: nextPenalty,
    });
  }

  return {score: clampScore(100 - penalty), issues};
};

const evaluateLoadSpread = (
  sessions: UnifiedSession[],
  policy: DistributionPolicy,
): {score: number; issues: DistributionIssue[]} => {
  const issues: DistributionIssue[] = [];
  let penalty = 0;

  const adjacentHardPairs = countAdjacentHardPairs(sessions);
  if (adjacentHardPairs > policy.targets.maxAdjacentHardPairs) {
    const nextPenalty = adjacentHardPairs * SPREAD_WEIGHTS.adjacentHardDays;
    penalty += nextPenalty;
    issues.push({
      code: 'adjacent_hard_days',
      severity: 'critical',
      message: `Found ${adjacentHardPairs} adjacent hard-day pair(s). Insert easy or rest buffers between quality sessions.`,
      penalty: nextPenalty,
    });
  }

  const maxConsecutive = getConsecutiveRunDays(sessions);
  if (maxConsecutive > policy.targets.maxConsecutiveRunDays) {
    const overflow = maxConsecutive - policy.targets.maxConsecutiveRunDays;
    const nextPenalty = overflow * SPREAD_WEIGHTS.consecutiveRunStreak;
    penalty += nextPenalty;
    issues.push({
      code: 'consecutive_run_streak_too_long',
      severity: 'warning',
      message: `Consecutive run streak too long (${maxConsecutive} vs max ${policy.targets.maxConsecutiveRunDays}).`,
      penalty: nextPenalty,
    });
  }

  const weekendShare = calcWeekendLoadSharePct(sessions);
  if (weekendShare > policy.targets.maxWeekendLoadSharePct) {
    const overflow = weekendShare - policy.targets.maxWeekendLoadSharePct;
    const nextPenalty = Math.round((overflow / 10) * SPREAD_WEIGHTS.weekendLoadBias);
    penalty += nextPenalty;
    issues.push({
      code: 'weekend_load_too_high',
      severity: 'warning',
      message: `Weekend run-load share is high (${weekendShare}% vs max ${policy.targets.maxWeekendLoadSharePct}%).`,
      penalty: nextPenalty,
    });
  }

  let hardGapPenaltyApplied = false;
  const hardIndices: number[] = [];
  sessions.forEach((session, index) => {
    if (!session.run) return;
    if (classifyRunIntensity(session.run) === 'hard') {
      hardIndices.push(index);
    }
  });
  for (let index = 1; index < hardIndices.length; index += 1) {
    if (hardIndices[index] - hardIndices[index - 1] <= 2) {
      hardGapPenaltyApplied = true;
      break;
    }
  }
  if (hardGapPenaltyApplied) {
    const nextPenalty = SPREAD_WEIGHTS.hardGap;
    penalty += nextPenalty;
    issues.push({
      code: 'hard_session_spacing_tight',
      severity: 'warning',
      message:
        'Hard sessions are closely spaced within a 48-hour window. Consider spreading them farther apart.',
      penalty: nextPenalty,
    });
  }

  return {score: clampScore(100 - penalty), issues};
};

const buildRepairHints = (issues: DistributionIssue[]): string[] => {
  const hints = new Set<string>();

  for (const issue of issues) {
    if (issue.code.includes('hard')) {
      hints.add('Reduce hard-session density and keep at least one easy/rest buffer between hard efforts.');
    }
    if (issue.code.includes('weekend')) {
      hints.add('Move part of the weekend load to Tuesday/Wednesday to smooth weekly load spread.');
    }
    if (issue.code.includes('rest_day')) {
      hints.add('Adjust one low-value run to a full recovery/rest day to restore weekly balance.');
    }
    if (issue.code.includes('moderate_intensity_share')) {
      hints.add('Reduce middle-zone work and replace with easy aerobic or clearly hard quality blocks.');
    }
    if (issue.code.includes('run_day_balance')) {
      hints.add('Align run-day count to a sustainable weekly pattern before adding more intensity.');
    }
  }

  return Array.from(hints);
};

const evaluateSessions = (
  sessions: UnifiedSession[],
  policy: DistributionPolicy,
): DistributionEvaluation => {
  const metrics = buildMetrics(sessions);
  const sessionType = evaluateSessionType(metrics, policy);
  const intensity = evaluateIntensity(metrics, policy);
  const loadSpread = evaluateLoadSpread(sessions, policy);
  const issues = [...sessionType.issues, ...intensity.issues, ...loadSpread.issues];
  const weightedScore = Math.round(
    (sessionType.score * 0.34) + (intensity.score * 0.33) + (loadSpread.score * 0.33),
  );
  const score = clampScore(weightedScore);

  return {
    score,
    threshold: policy.acceptanceThreshold,
    accepted: score >= policy.acceptanceThreshold,
    subscores: {
      sessionType: sessionType.score,
      intensity: intensity.score,
      loadSpread: loadSpread.score,
    },
    metrics,
    issues,
    repairHints: buildRepairHints(issues),
  };
};

export const evaluateUnifiedWeeklyDistribution = (
  sessions: UnifiedSession[],
  policy: DistributionPolicy = DEFAULT_DISTRIBUTION_POLICY,
): DistributionEvaluation => evaluateSessions(sessions, policy);

export const evaluateCoachWeeklyDistribution = (
  coachWeek: CoachWeekOutput,
  policy: DistributionPolicy = DEFAULT_DISTRIBUTION_POLICY,
): DistributionEvaluation => {
  const unifiedSessions: UnifiedSession[] = coachWeek.sessions.map((session) => {
    if (session.type === 'rest' || session.type === 'strength') {
      return {
        day: session.day,
        date: session.date,
        ...(session.type === 'strength'
          ? {
              strengthSlot: {
                load: 'moderate' as const,
                notes: session.description,
              },
            }
          : {}),
        notes: session.description,
      };
    }
    return {
      day: session.day,
      date: session.date,
      run: {
        type: session.type,
        description: session.description,
        warmupSteps: session.warmupSteps.length ? session.warmupSteps : undefined,
        mainSteps: session.mainSteps.length ? session.mainSteps : undefined,
        cooldownSteps: session.cooldownSteps.length ? session.cooldownSteps : undefined,
        duration: session.duration ?? undefined,
        plannedDurationMin: session.plannedDurationMin ?? undefined,
        plannedDistanceKm: session.plannedDistanceKm ?? undefined,
        targetPace: session.targetPace ?? undefined,
        targetZone: session.targetZone ?? undefined,
        targetZoneId: toZoneId(session.targetZoneId ?? undefined),
        notes: session.notes ?? undefined,
      },
    };
  });

  return evaluateSessions(unifiedSessions, policy);
};

export const summarizeDistributionForPrompt = (
  evaluation: DistributionEvaluation,
): string => {
  const summaryLines = [
    `Distribution score: ${evaluation.score}/${evaluation.threshold}`,
    `Subscores -> type ${evaluation.subscores.sessionType}, intensity ${evaluation.subscores.intensity}, spread ${evaluation.subscores.loadSpread}`,
    `Counts -> run ${evaluation.metrics.runDays}, rest ${evaluation.metrics.restDays}, hard ${evaluation.metrics.hardRunDays}`,
  ];
  const issueLines = evaluation.issues
    .slice(0, 5)
    .map((issue) => `- ${issue.code}: ${issue.message}`);
  return [...summaryLines, ...issueLines].join('\n');
};
