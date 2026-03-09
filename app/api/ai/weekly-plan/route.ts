import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {db} from '@/db';
import {
  activities as activitiesTable,
  userSettings,
  trainingBlocks,
  weeklyPlans,
  athleteReadinessSignals,
} from '@/db/schema';
import {eq, desc, and, ne, isNull, sql, gte} from 'drizzle-orm';
import {transformActivity} from '@/lib/strava';
import type {StravaSummaryActivity} from '@/lib/strava';
import {
  calcFitnessData,
  calcACWRData,
  calcAdvancedMetricsData,
  getLatestMetricsSnapshot,
  calcRiskIntelligence,
} from '@/utils/trainingLoad';
import {formatPace, formatDuration, type UserSettings, type ActivitySummary} from '@/lib/activityModel';
import {buildCoachPipelinePrompt} from '@/lib/weeklyPlanPrompts';
import {
  coachWeekOutputSchema, planMetaSchema, type CoachWeekOutput, type PlanMeta,
} from '@/lib/weeklyPlanSchema';
import type {UnifiedSession} from '@/lib/cacheTypes';
import {buildWeekReview} from '@/lib/weekReview';
import {buildActualizedWeekContext} from '@/lib/weekActualization';
import {NextResponse} from 'next/server';
import {
  describeStrategyPreset,
  OPTIMIZATION_PRIORITY_LABELS,
  recommendStrategy,
  STRATEGY_PRESET_LABELS,
  type OptimizationPriority,
  type StrategySelectionMode,
  type TrainingStrategyPreset,
} from '@/lib/trainingStrategy';
import {
  buildAthleteDigitalTwin,
  rankCounterfactualStrategies,
  type CounterfactualOption,
} from '@/lib/digitalTwin';
import {calibratePriorityFromOutcomes} from '@/lib/calibration';
import {weeklyPlanRequestSchema} from '@/lib/aiRequestSchemas';
import {generateObjectWithRetry} from '@/lib/aiGeneration';
import {
  validateCoachWeekOutput,
} from '@/lib/planSemanticValidators';
import {
  evaluateCoachWeeklyDistribution,
  evaluateUnifiedWeeklyDistribution,
  summarizeDistributionForPrompt,
  type DistributionEvaluation,
} from '@/lib/weeklyDistributionEvaluator';
import {createTraceContext, logAiTrace, promptHash} from '@/lib/aiTrace';
import {createAiErrorPayload} from '@/lib/aiErrors';
import {
  resolveMultiAgentRuntimeConfig,
} from '@/lib/multiAgentContracts';
import {
  encodeSseEvent,
  type AiProgressEvent,
  type AiProgressPhase,
} from '@/lib/aiProgress';

export const maxDuration = 120;
const ACTIVITY_CONTEXT_WINDOW_DAYS = 120;
const PLAN_PREFERENCES_PREFIX = '<!-- weekly-plan-preferences:';
const PLAN_PREFERENCES_SUFFIX = '-->';
const PLAN_STRATEGY_PREFIX = '<!-- weekly-plan-strategy:';
const PLAN_STRATEGY_SUFFIX = '-->';

const ALLOWED_MODELS: Record<string, () => ReturnType<typeof openai | typeof anthropic>> = {
  'gpt-4o-mini': () => openai('gpt-4o-mini'),
  'gpt-4o': () => openai('gpt-4o'),
  'gpt-4.1-mini': () => openai('gpt-4.1-mini'),
  'gpt-4.1': () => openai('gpt-4.1'),
  'gpt-4.1-nano': () => openai('gpt-4.1-nano'),
  'gpt-5-mini': () => openai('gpt-5-mini'),
  'gpt-5-nano': () => openai('gpt-5-nano'),
  'gpt-5.2': () => openai('gpt-5.2'),
  'gpt-5.3': () => openai('gpt-5.3'),
  'gpt-5.4': () => openai('gpt-5.4'),
  'claude-sonnet-4-5': () => anthropic('claude-sonnet-4-5'),
  'claude-haiku-3-5': () => anthropic('claude-3-5-haiku-latest'),
};

const getModel = (clientModel?: string) => {
  if (clientModel && ALLOWED_MODELS[clientModel]) {
    return ALLOWED_MODELS[clientModel]();
  }
  const provider = process.env.AI_PROVIDER ?? 'openai';
  const modelOverride = process.env.AI_MODEL;
  if (provider === 'anthropic') return anthropic(modelOverride ?? 'claude-sonnet-4-5');
  return openai(modelOverride ?? 'gpt-4o-mini');
};

const getNextMonday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  return monday.toISOString().slice(0, 10);
};

const getCurrentMonday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  return monday.toISOString().slice(0, 10);
};

const getSunday = (mondayStr: string): string => {
  const d = new Date(mondayStr);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const getDatesForWeek = (mondayStr: string): {day: string; date: string}[] => {
  const monday = new Date(mondayStr);
  return DAY_NAMES.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {day: name, date: d.toISOString().slice(0, 10)};
  });
};

const getActivityContextStartDate = (): string => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVITY_CONTEXT_WINDOW_DAYS);
  return cutoff.toISOString().slice(0, 10);
};

const buildGeneratedSessions = (
  weekDates: {day: string; date: string}[],
  coachSessions: CoachWeekOutput['sessions'],
): UnifiedSession[] => {
  const n2u = <T,>(value: T | null | undefined): T | undefined => value ?? undefined;
  const asZoneId = (
    value: number | null | undefined,
  ): 1 | 2 | 3 | 4 | 5 | 6 | undefined => {
    if (value == null) return undefined;
    if (value >= 1 && value <= 6) return value as 1 | 2 | 3 | 4 | 5 | 6;
    return undefined;
  };

  return weekDates.map(({day, date}) => {
    const coach = coachSessions.find((session) => session.date === date);
    const unified: UnifiedSession = {day, date};

    if (coach && coach.type !== 'rest' && coach.type !== 'strength') {
      unified.run = {
        type: coach.type,
        description: coach.description,
        duration: n2u(coach.duration),
        plannedDurationMin: n2u(coach.plannedDurationMin),
        plannedDistanceKm: n2u(coach.plannedDistanceKm),
        targetPace: n2u(coach.targetPace),
        targetZone: n2u(coach.targetZone),
        targetZoneId: asZoneId(coach.targetZoneId),
        notes: n2u(coach.notes),
      };
    }

    if (coach?.type === 'strength') {
      unified.strengthSlot = {
        load: 'moderate',
        notes: coach.description,
      };
    }

    if (coach?.type === 'rest') {
      unified.notes = coach.description;
    }

    return unified;
  });
};

export async function POST(req: Request) {
  const trace = createTraceContext('ai.weekly-plan', req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createAiErrorPayload('invalid_json_body', 'Invalid JSON body'),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }
  const parsedBody = weeklyPlanRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      createAiErrorPayload('invalid_request_body', 'Invalid request body', {
        issues: parsedBody.error.issues.map((issue) => issue.message),
      }),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }
  const parsedData = parsedBody.data as {
    athleteId: number;
    weekStartDate?: string;
    model?: string;
    preferences?: string;
    mode?: 'full' | 'remaining_days';
    sourcePlanId?: string;
    today?: string;
    strategySelectionMode?: StrategySelectionMode;
    strategyPreset?: TrainingStrategyPreset;
    optimizationPriority?: OptimizationPriority;
    editSourcePlanId?: string;
    editInstructions?: string;
    editTargetDates?: string[];
  };
  const {
    athleteId,
    weekStartDate,
    model: clientModel,
    preferences: clientPreferences,
    mode: generationMode,
    sourcePlanId,
    today,
    strategySelectionMode,
    strategyPreset,
    optimizationPriority,
    editSourcePlanId,
    editInstructions,
    editTargetDates,
  } = parsedData;

  if (!athleteId) {
    return NextResponse.json(
      createAiErrorPayload('athlete_id_required', 'athleteId required'),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }

  const mode = generationMode ?? 'full';
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  const multiAgentConfig = resolveMultiAgentRuntimeConfig();
  const multiAgentEnabled = false;
  let model = getModel(clientModel);
  let resolvedModel =
    clientModel && ALLOWED_MODELS[clientModel]
      ? clientModel
      : (process.env.AI_MODEL ??
        (process.env.AI_PROVIDER === 'anthropic'
          ? 'claude-sonnet-4-5'
          : 'gpt-4o-mini'));

  logAiTrace(trace, 'request_received', {
    athleteId,
    mode: generationMode ?? 'full',
    model: resolvedModel,
    persona: 'pipeline',
    sessionId: null,
    multiAgentEnabled,
    multiAgentConfig,
  });
  const requestStartedAt = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: AiProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };
      const sendProgress = (
        phase: AiProgressPhase,
        message: string,
        meta?: unknown,
      ) => {
        sendEvent({
          type: 'progress',
          phase,
          message,
          timestamp: Date.now(),
          ...(meta !== undefined ? {meta} : {}),
        });
      };
      const sendDone = (payload: unknown) => {
        sendEvent({
          type: 'done',
          phase: 'done',
          message: 'Weekly plan generation completed.',
          timestamp: Date.now(),
          payload,
        });
      };
      const sendError = (message: string, meta?: unknown) => {
        sendEvent({
          type: 'error',
          phase: 'error',
          message,
          timestamp: Date.now(),
          ...(meta !== undefined ? {meta} : {}),
        });
      };
      sendProgress('context', 'Request accepted. Preparing generation pipeline.');

      (async () => {
        try {
    // Step 1: Load context
    const activityContextStartDate = getActivityContextStartDate();
    const [settingsRows, activityRows, planRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.athleteId, athleteId)),
      db
        .select()
        .from(activitiesTable)
        .where(
          and(
            eq(activitiesTable.athleteId, athleteId),
            gte(activitiesTable.date, activityContextStartDate),
          ),
        )
        .orderBy(desc(activitiesTable.date)),
      db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.athleteId, athleteId))
        .orderBy(desc(weeklyPlans.createdAt)),
    ]);
    sendProgress('context', 'Loaded athlete context and historical plans.');

    let effectiveMode: 'full' | 'remaining_days' = mode;
    const currentMonday = getCurrentMonday();
    const hasActiveCurrentWeekPlan = planRows.some(
      (plan) => plan.isActive && plan.weekStart === currentMonday,
    );
    const weekStart = weekStartDate
      ?? (hasActiveCurrentWeekPlan ? getNextMonday() : currentMonday);
    const weekEnd = getSunday(weekStart);
    const weekDates = getDatesForWeek(weekStart);
    const elapsedMs = () => Date.now() - requestStartedAt;
    const hasRuntimeBudget = () => elapsedMs() < multiAgentConfig.maxRuntimeMs;
    let specialistTurnsUsed = 0;
    const repairTurnsUsed = 0;
    let roundCount = 0;
    const multiAgentConflicts: Array<{
      date: string;
      rule: string;
      severity: 'low' | 'medium' | 'high';
      action: string;
    }> = [];
    const repairApplied = false;
    let distributionRepairApplied = false;
    let distributionRepairAttempts = 0;
    let coachDistributionEvaluation: DistributionEvaluation | null = null;
    let finalDistributionEvaluation: DistributionEvaluation | null = null;
    const conflictSummary = 'Coach-only pipeline: no coach/physio conflict resolution step.';
    const isEditRequest =
      Boolean(editInstructions && editInstructions.trim()) ||
      Boolean(editSourcePlanId);
    const normalizedEditInstructions = editInstructions?.trim() ?? '';
    const normalizedEditTargetDates = (editTargetDates ?? []).filter(Boolean);

    console.log(`\n[WeeklyPlan] ========== Generating Plan ==========`);
    console.log(`[WeeklyPlan] Athlete: ${athleteId}`);
    console.log(`[WeeklyPlan] Mode: ${mode}`);
    console.log(`[WeeklyPlan] Week: ${weekStart} to ${weekEnd}`);

    const settings = settingsRows[0];
    const settingsModel =
      typeof settings?.aiModel === 'string'
        ? settings.aiModel
        : null;
    const effectiveClientModel =
      clientModel ??
      (settingsModel && ALLOWED_MODELS[settingsModel]
        ? settingsModel
        : undefined);
    model = getModel(effectiveClientModel);
    resolvedModel =
      effectiveClientModel && ALLOWED_MODELS[effectiveClientModel]
        ? effectiveClientModel
        : (process.env.AI_MODEL ??
          (process.env.AI_PROVIDER === 'anthropic'
            ? 'claude-sonnet-4-5'
            : 'gpt-4o-mini'));
    const preferences = clientPreferences || settings?.weeklyPreferences || null;
    const zonesRaw = settings?.zones as Record<string, [number, number]> | undefined;
    const typedZones = zonesRaw as UserSettings['zones'] | undefined;
    const hrZonesText = zonesRaw
      ? Object.entries(zonesRaw).map(([k, [min, max]]) => `${k.toUpperCase()} ${min}-${max}`).join(' | ')
      : null;
    const injuries = settings?.injuries as Array<{name?: string; notes?: string}> | undefined;
    const injuriesText = injuries?.length
      ? injuries.map((item) => item?.name || '').filter(Boolean).join(', ')
      : '';

    const allActivities = activityRows.map((r) =>
      transformActivity(r.data as StravaSummaryActivity),
    );

    // Recent 4 months summary
    const recentActivities = allActivities;

    const weeklyVolumes: Record<string, {distance: number; count: number; types: string[]}> = {};
    for (const act of recentActivities) {
      const d = new Date(act.date);
      const dayOfWeek = (d.getDay() + 6) % 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek);
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weeklyVolumes[weekKey]) weeklyVolumes[weekKey] = {distance: 0, count: 0, types: []};
      weeklyVolumes[weekKey].distance += act.distance;
      weeklyVolumes[weekKey].count += 1;
      weeklyVolumes[weekKey].types.push(act.type);
    }

    const recentTrainingLines = Object.entries(weeklyVolumes)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([week, data]) => `- Week of ${week}: ${data.distance.toFixed(1)} km, ${data.count} activities`)
      .join('\n');

    // ACWR
    let acwrText = '';
    let metricsSummary: string | null = null;
    let latestSnapshot = getLatestMetricsSnapshot([]);
    if (settings) {
      try {
        const fitnessResult = calcFitnessData(
          allActivities,
          settings.restingHr,
          settings.maxHr,
          180,
          typedZones,
        );
        const acwrData = calcACWRData(fitnessResult.data);
        const advancedData = calcAdvancedMetricsData(fitnessResult.data, allActivities);
        latestSnapshot = getLatestMetricsSnapshot(advancedData);
        const latestAcwr = acwrData[acwrData.length - 1];
        if (latestAcwr) {
          acwrText = `\n- ACWR: ${latestAcwr.acwr.toFixed(2)} (BF: ${latestAcwr.bf.toFixed(1)}, LI: ${latestAcwr.li.toFixed(1)})`;
        }
        metricsSummary = [
          latestSnapshot.ctl != null
            ? `- CTL/ATL/TSB: ${latestSnapshot.ctl.toFixed(1)} / ${latestSnapshot.atl?.toFixed(1)} / ${latestSnapshot.tsb?.toFixed(1)}`
            : null,
          latestSnapshot.rampRate != null
            ? `- Ramp rate: ${latestSnapshot.rampRate.toFixed(1)}%`
            : null,
          latestSnapshot.monotony != null
            ? `- Monotony: ${latestSnapshot.monotony.toFixed(2)}`
            : null,
          latestSnapshot.strain != null
            ? `- Strain: ${latestSnapshot.strain.toFixed(1)}`
            : null,
          latestSnapshot.thresholdPace != null
            ? `- Threshold pace estimate: ${formatPace(latestSnapshot.thresholdPace)}/km`
            : null,
          latestSnapshot.efficiencyFactor != null
            ? `- Efficiency factor proxy: ${latestSnapshot.efficiencyFactor.toFixed(4)} m/s/bpm`
            : null,
          latestSnapshot.decoupling != null
            ? `- Decoupling proxy: ${latestSnapshot.decoupling.toFixed(1)}%`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
      } catch {
        // Non-blocking
      }
    }

    // Personal records
    let prText = 'No personal records available';
    const last10 = recentActivities.slice(0, 10);
    if (last10.length > 0) {
      const paces = last10
        .filter((a) => a.type === 'Run' && a.distance > 0 && a.duration > 0)
        .map((a) => ({
          distance: a.distance,
          pace: formatPace(a.avgPace),
          duration: formatDuration(a.duration),
          date: a.date,
        }));
      if (paces.length > 0) {
        prText = paces
          .slice(0, 5)
          .map((p) => `- ${p.distance.toFixed(1)} km at ${p.pace} (${p.date})`)
          .join('\n');
      }
    }

    const recentTraining = `${recentTrainingLines}${acwrText}`;
    const resolvedPriority: OptimizationPriority =
      optimizationPriority ??
      (settings?.optimizationPriority as OptimizationPriority | undefined) ??
      'race_performance';
    const resolvedStrategyMode: StrategySelectionMode =
      strategySelectionMode ??
      (settings?.strategySelectionMode as StrategySelectionMode | undefined) ??
      'auto';
    const defaultPreset =
      (settings?.strategyPreset as TrainingStrategyPreset | undefined) ??
      'polarized_80_20';
    const strategyRecommendation = recommendStrategy({
      acwr: latestSnapshot.acwr,
      tsb: latestSnapshot.tsb,
      monotony: latestSnapshot.monotony,
      goal: settings?.goal ?? null,
      priority: resolvedPriority,
    });
    let resolvedPreset: TrainingStrategyPreset =
      resolvedStrategyMode === 'preset'
        ? strategyPreset ?? defaultPreset
        : strategyRecommendation.strategy;
    let strategyLabel = STRATEGY_PRESET_LABELS[resolvedPreset];
    let strategyDescription = `${describeStrategyPreset(
      resolvedPreset,
    )} ${resolvedStrategyMode === 'auto' ? `Auto-selected rationale: ${strategyRecommendation.rationale}` : ''}`.trim();
    let optimizationPriorityLabel = OPTIMIZATION_PRIORITY_LABELS[resolvedPriority];

    // Step 1b: Build last-week review (only for new-week generation, not retries)
    let lastWeekReview: string | null = null;
    try {
      const prevPlan = planRows[0];
      if (prevPlan && prevPlan.weekStart !== weekStart) {
        console.log(`[WeeklyPlan] New week detected (prev: ${prevPlan.weekStart}, new: ${weekStart}). Building review...`);
        lastWeekReview = await buildWeekReview(
          athleteId,
          {sessions: prevPlan.sessions, weekStart: prevPlan.weekStart},
          allActivities,
          typedZones,
        );
        if (lastWeekReview) {
          console.log(`[WeeklyPlan] Last week review injected (${lastWeekReview.split('\n').length} lines)`);
        }
      } else if (prevPlan) {
        console.log(`[WeeklyPlan] Same week retry (${weekStart}). Skipping review.`);
      }
    } catch {
      console.log(`[WeeklyPlan] Could not build last-week review (non-blocking)`);
    }

    const dbContextRows = await db.execute<{
      currentDb: string;
      currentSchema: string;
      readinessRegclass: string | null;
    }>(sql`
      select
        current_database() as "currentDb",
        current_schema() as "currentSchema",
        to_regclass('public.athlete_readiness_signals') as "readinessRegclass"
    `);
    const dbContext = dbContextRows.rows[0] ?? null;
    const readinessTableExists = Boolean(dbContext?.readinessRegclass);
    let readinessRows: Array<typeof athleteReadinessSignals.$inferSelect> = [];
    if (!readinessTableExists) {
    } else {
      try {
        readinessRows = await db
          .select()
          .from(athleteReadinessSignals)
          .where(eq(athleteReadinessSignals.athleteId, athleteId))
          .orderBy(desc(athleteReadinessSignals.date))
          .limit(1);
      } catch (error) {
        throw error;
      }
    }
    const latestReadiness = readinessRows[0] ?? null;
    const riskIntelligence = calcRiskIntelligence(latestSnapshot, {
      sleepHours: latestReadiness?.sleepHours ?? null,
      readinessScore: latestReadiness?.readinessScore ?? null,
      sessionRpe: latestReadiness?.sessionRpe ?? null,
    });
    const twinProfile = buildAthleteDigitalTwin({
      activities: allActivities,
      recentFeedback: null,
      risk: riskIntelligence,
    });
    const calibration = calibratePriorityFromOutcomes({
      recentAdherence: null,
      recentFatigue: null,
      recentConfidence: null,
      risk: riskIntelligence,
    });
    const calibratedPriority =
      resolvedStrategyMode === 'auto' ? calibration.recommendedPriority : resolvedPriority;
    optimizationPriorityLabel = OPTIMIZATION_PRIORITY_LABELS[calibratedPriority];
    const counterfactualRanking: CounterfactualOption[] = rankCounterfactualStrategies({
      twin: twinProfile,
      risk: riskIntelligence,
      optimizationPriority: calibratedPriority,
    });
    if (resolvedStrategyMode === 'auto' && counterfactualRanking.length > 0) {
      resolvedPreset = counterfactualRanking[0].strategy;
      strategyLabel = STRATEGY_PRESET_LABELS[resolvedPreset];
      strategyDescription = `${describeStrategyPreset(resolvedPreset)} Auto-selected by digital twin ranking: ${counterfactualRanking[0].rationale}`;
    }

    // Step 1c: Load training block context (macro periodization)
    type BlockPhase = {name: string; weekNumbers: number[]; focus: string; volumeDirection: string};
    type BlockOutline = {weekNumber: number; phase: string; weekType: string; volumeTargetKm: number; intensityLevel: string; keyWorkouts: string[]; notes: string};

    let trainingBlockContext: string | null = null;
    let activeBlockId: string | null = null;
    let blockWeekNumber: number | null = null;
    let currentBlockWeek: BlockOutline | null = null;
    let currentBlockGoalEvent: string | null = null;
    let currentBlockGoalDate: string | null = null;

    try {
      const blockRows = await db
        .select()
        .from(trainingBlocks)
        .where(
          and(
            eq(trainingBlocks.athleteId, athleteId),
            eq(trainingBlocks.isActive, true),
                isNull(trainingBlocks.deletedAt),
          ),
        )
        .orderBy(desc(trainingBlocks.createdAt))
        .limit(1);

      const block = blockRows[0];
      if (block) {
        activeBlockId = block.id;
        const outlines = block.weekOutlines as BlockOutline[];
        const phases = block.phases as BlockPhase[];
        const startMs = new Date(block.startDate).getTime();
        const weekMs = new Date(weekStart).getTime();
        const weekNum = Math.max(1, Math.min(block.totalWeeks, Math.round((weekMs - startMs) / (7 * 86400000)) + 1));
        blockWeekNumber = weekNum;

        const thisWeek = outlines.find((o) => o.weekNumber === weekNum);
        const prevWeek = outlines.find((o) => o.weekNumber === weekNum - 1);
        const nextWeek = outlines.find((o) => o.weekNumber === weekNum + 1);
        const currentPhase = phases.find((p) => p.weekNumbers.includes(weekNum));

        if (thisWeek) {
          currentBlockWeek = thisWeek;
          currentBlockGoalEvent = block.goalEvent;
          currentBlockGoalDate = block.goalDate;
          const lines = [
            `- Goal: ${block.goalEvent} — ${block.goalDate}`,
            currentPhase ? `- Phase: ${currentPhase.name} (weeks ${currentPhase.weekNumbers.join('-')})` : '',
            `- Current Week: ${weekNum} of ${block.totalWeeks}, Type: ${thisWeek.weekType}`,
            `- Volume Target: ${thisWeek.volumeTargetKm} km, Intensity: ${thisWeek.intensityLevel}`,
            `- Key Workouts: ${thisWeek.keyWorkouts.join(', ')}`,
            thisWeek.notes ? `- Notes: "${thisWeek.notes}"` : '',
            prevWeek ? `- Previous Week: Week ${prevWeek.weekNumber} — ${prevWeek.weekType}, ${prevWeek.volumeTargetKm}km target` : '',
            nextWeek ? `- Next Week: Week ${nextWeek.weekNumber} — ${nextWeek.weekType}, ${nextWeek.volumeTargetKm}km target` : '',
          ].filter(Boolean);
          trainingBlockContext = lines.join('\n');
          console.log(`[WeeklyPlan] Training block context injected (week ${weekNum} of ${block.totalWeeks}, ${thisWeek.weekType})`);
        }
      }
    } catch {
      console.log(`[WeeklyPlan] Could not load training block (non-blocking)`);
    }

    // Step 1d: Resolve source plan context for edit/replan flows
    const resolveSourcePlanContext = () => {
      const explicitSourceId = editSourcePlanId ?? sourcePlanId;
      if (explicitSourceId) {
        return planRows.find((plan) => plan.id === explicitSourceId) ?? null;
      }
      const activeForWeek = planRows.find(
        (plan) => plan.isActive && plan.weekStart === weekStart,
      );
      if (activeForWeek) return activeForWeek;
      const activeAnyWeek = planRows.find((plan) => plan.isActive);
      return activeAnyWeek ?? planRows[0] ?? null;
    };

    const sourcePlanContext = resolveSourcePlanContext();
    if (isEditRequest && !sourcePlanContext) {
      throw new Error('SOURCE_PLAN_NOT_FOUND_FOR_EDIT');
    }

    const sourcePlanSummary = sourcePlanContext
      ? [
          `Source plan: ${sourcePlanContext.title} (${sourcePlanContext.weekStart})`,
          ...(sourcePlanContext.sessions as UnifiedSession[]).map((session) => {
            const runPart = session.run
              ? `run ${session.run.type}: ${session.run.description}`
              : 'no run';
            const strengthPart = session.strengthSlot
              ? `strength slot (${session.strengthSlot.load ?? 'moderate'})`
              : 'no strength slot';
            return `- ${session.day} (${session.date}): ${runPart}; ${strengthPart}`;
          }),
        ].join('\n')
      : '';

    // Step 1e: In remaining-days mode, lock past days using completed activities
    let lockedPastByDate = new Map<string, UnifiedSession>();
    let sourcePlanForReplan: typeof weeklyPlans.$inferSelect | null = null;
    let remainingDaysNote: string | null = null;

    if (effectiveMode === 'remaining_days') {
      sourcePlanForReplan = sourcePlanContext;

      if (!sourcePlanForReplan) {
        effectiveMode = 'full';
        remainingDaysNote = 'No source weekly plan found for remaining-days mode. Falling back to full-week generation.';
        console.log('[WeeklyPlan] Remaining-days requested but no source plan found. Falling back to full mode.');
      } else {
        const weekActivities = allActivities.filter(
          (activity) => activity.date >= weekStart && activity.date <= weekEnd,
        );
        const actualized = buildActualizedWeekContext({
          weekDates,
          sourceSessions: sourcePlanForReplan.sessions as UnifiedSession[],
          activities: weekActivities,
          todayIso,
        });
        lockedPastByDate = actualized.lockedByDate;
        remainingDaysNote = actualized.summary;
        console.log(`[WeeklyPlan] Remaining-days lock summary: ${actualized.summary}`);
      }
    }

    // Step 2: Coach generates running sessions
    console.log(`[WeeklyPlan] Step 2: Coach generateObject...`);
    sendProgress('coach', 'Coach is drafting running sessions.');
    const generationPreferences = [
      preferences,
      isEditRequest
        ? 'Generation mode: guided edit of an existing weekly plan.'
        : null,
      isEditRequest && normalizedEditInstructions
        ? `Edit instructions:\n${normalizedEditInstructions}`
        : null,
      isEditRequest && normalizedEditTargetDates.length > 0
        ? `Edit target dates: ${normalizedEditTargetDates.join(', ')}`
        : null,
      isEditRequest && sourcePlanSummary
        ? `Source plan context:\n${sourcePlanSummary}`
        : null,
      isEditRequest && effectiveMode === 'full'
        ? 'Critical edit rule: keep day structure, workout intent, and session ordering unchanged unless explicitly changed by the edit instructions.'
        : null,
      effectiveMode === 'remaining_days'
        ? `Generation mode: remaining days only. Keep past days as historical truth and regenerate only from ${todayIso} onward.`
        : null,
      remainingDaysNote ? `Past-week actualization summary: ${remainingDaysNote}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const coachPrompt = buildCoachPipelinePrompt({
      athleteName: null,
      hrZones: hrZonesText,
      weight: settings?.weight ?? null,
      trainingBalance: settings?.trainingBalance ?? null,
      weekStart,
      weekEnd,
      recentTraining,
      injuries: injuriesText,
      goal: settings?.goal ?? null,
      personalRecords: prText,
      preferences: generationPreferences || null,
      lastWeekReview,
      trainingBlockContext,
      strategyLabel,
      strategyDescription,
      optimizationPriorityLabel,
      metricsSummary,
    });
    const coachEditDirective = isEditRequest
      ? `\n\n## Weekly Plan Edit Instructions\nYou are editing an existing weekly plan, not creating from scratch.\n${normalizedEditInstructions ? `Apply these requested edits exactly when safe:\n${normalizedEditInstructions}\n` : ''}${sourcePlanSummary ? `Reference source plan:\n${sourcePlanSummary}\n` : ''}${normalizedEditTargetDates.length > 0 ? `Prioritize changes to these dates: ${normalizedEditTargetDates.join(', ')}.\n` : ''}${effectiveMode === 'full' ? 'For all other days, preserve previous plan intent and minimize unnecessary changes.\n' : 'Only regenerate remaining/future days; keep past days anchored to historical truth.\n'}`
      : '';
    const finalCoachPrompt = isEditRequest
      ? `${coachPrompt}${coachEditDirective}`
      : coachPrompt;

    logAiTrace(trace, 'coach_prompt_built', {
      promptHash: promptHash(finalCoachPrompt),
      mode: effectiveMode,
    });
    if (!hasRuntimeBudget()) {
      throw new Error('MULTI_AGENT_RUNTIME_BUDGET_EXCEEDED_BEFORE_COACH');
    }
    let coachObject = await generateObjectWithRetry<CoachWeekOutput>({
      model,
      schema: coachWeekOutputSchema,
      prompt: finalCoachPrompt,
      semanticCheck: validateCoachWeekOutput,
    });
    specialistTurnsUsed += 1;
    roundCount += 1;

    let coachSessions = coachObject.sessions;
    coachDistributionEvaluation = evaluateCoachWeeklyDistribution(coachObject);
    logAiTrace(trace, 'weekly_distribution_coach_evaluated', {
      athleteId,
      score: coachDistributionEvaluation.score,
      threshold: coachDistributionEvaluation.threshold,
      accepted: coachDistributionEvaluation.accepted,
      subscores: coachDistributionEvaluation.subscores,
      issueCount: coachDistributionEvaluation.issues.length,
      mode: effectiveMode,
    });
    if (
      !coachDistributionEvaluation.accepted &&
      hasRuntimeBudget() &&
      roundCount < multiAgentConfig.maxRounds
    ) {
      sendProgress('coach', 'Applying coach distribution repair pass.');
      const repairPrompt = `${finalCoachPrompt}\n\n## Deterministic Weekly Distribution Feedback\n${summarizeDistributionForPrompt(
        coachDistributionEvaluation,
      )}\n\nRepair instructions:\n- Keep all dates.\n- Reduce hard clustering.\n- Keep easy volume dominant.\n- Preserve key block intent and safety constraints.\n- Minimize unnecessary restructuring.`;
      coachObject = await generateObjectWithRetry<CoachWeekOutput>({
        model,
        schema: coachWeekOutputSchema,
        prompt: repairPrompt,
        semanticCheck: validateCoachWeekOutput,
      });
      coachSessions = coachObject.sessions;
      coachDistributionEvaluation = evaluateCoachWeeklyDistribution(coachObject);
      distributionRepairApplied = true;
      distributionRepairAttempts += 1;
      roundCount += 1;
      specialistTurnsUsed += 1;
      logAiTrace(trace, 'weekly_distribution_coach_repaired', {
        athleteId,
        score: coachDistributionEvaluation.score,
        threshold: coachDistributionEvaluation.threshold,
        accepted: coachDistributionEvaluation.accepted,
        issueCount: coachDistributionEvaluation.issues.length,
        repairAttempts: distributionRepairAttempts,
      });
    }
    console.log(`[WeeklyPlan] Coach produced ${coachSessions.length} sessions`);
    sendProgress('coach', 'Coach draft ready.', {
      sessionCount: coachSessions.length,
      distributionScore: coachDistributionEvaluation.score,
      distributionAccepted: coachDistributionEvaluation.accepted,
    });

    // Step 3: Merge by date
    sendProgress('merge', 'Building unified coach week with strength slots.');
    const physioFallbackReason: 'runtime_budget' | null = null;
    let generatedSessions: UnifiedSession[] = buildGeneratedSessions(
      weekDates,
      coachSessions,
    );
    finalDistributionEvaluation = evaluateUnifiedWeeklyDistribution(generatedSessions);
    logAiTrace(trace, 'weekly_distribution_final_evaluated', {
      athleteId,
      score: finalDistributionEvaluation.score,
      threshold: finalDistributionEvaluation.threshold,
      accepted: finalDistributionEvaluation.accepted,
      subscores: finalDistributionEvaluation.subscores,
      issueCount: finalDistributionEvaluation.issues.length,
      mode: effectiveMode,
      physioFallbackReason,
    });
    if (
      !finalDistributionEvaluation.accepted &&
      !distributionRepairApplied &&
      hasRuntimeBudget() &&
      roundCount < multiAgentConfig.maxRounds
    ) {
      sendProgress('merge', 'Applying targeted coach distribution repair pass.');
      const distributionRepairPrompt = `${finalCoachPrompt}\n\n## Deterministic Weekly Distribution Repair Feedback\n${summarizeDistributionForPrompt(
        finalDistributionEvaluation,
      )}\n\nRepair instructions:\n- Keep all dates fixed.\n- Reduce hard clustering and excessive weekend load.\n- Keep easy-minute dominance.\n- Preserve key workout intent from block context and athlete goals.\n- Keep changes minimal and safety-first.`;
      coachObject = await generateObjectWithRetry<CoachWeekOutput>({
        model,
        schema: coachWeekOutputSchema,
        prompt: distributionRepairPrompt,
        semanticCheck: validateCoachWeekOutput,
      });
      coachSessions = coachObject.sessions;
      specialistTurnsUsed += 1;
      roundCount += 1;
      distributionRepairApplied = true;
      distributionRepairAttempts += 1;
      generatedSessions = buildGeneratedSessions(weekDates, coachSessions);
      finalDistributionEvaluation = evaluateUnifiedWeeklyDistribution(generatedSessions);
      logAiTrace(trace, 'weekly_distribution_final_repaired', {
        athleteId,
        score: finalDistributionEvaluation.score,
        threshold: finalDistributionEvaluation.threshold,
        accepted: finalDistributionEvaluation.accepted,
        issueCount: finalDistributionEvaluation.issues.length,
        repairAttempts: distributionRepairAttempts,
      });
      sendProgress('merge', 'Coach distribution repair pass completed.');
    }

    const activitiesByDate = new Map<string, ActivitySummary[]>();
    for (const activity of allActivities) {
      if (activity.date < weekStart || activity.date > weekEnd) continue;
      const list = activitiesByDate.get(activity.date) ?? [];
      list.push(activity);
      activitiesByDate.set(activity.date, list);
    }

    const blockIntent =
      activeBlockId && blockWeekNumber && currentBlockWeek && currentBlockGoalEvent && currentBlockGoalDate
        ? {
            blockId: activeBlockId,
            weekNumber: blockWeekNumber,
            goalEvent: currentBlockGoalEvent,
            goalDate: currentBlockGoalDate,
            weekType: currentBlockWeek.weekType,
            volumeTargetKm: currentBlockWeek.volumeTargetKm,
            intensityLevel: currentBlockWeek.intensityLevel,
            keyWorkouts: currentBlockWeek.keyWorkouts,
          }
        : null;

    const unifiedSessions: UnifiedSession[] = generatedSessions.map((session) => {
      if (effectiveMode === 'remaining_days' && session.date < todayIso) {
        const locked = lockedPastByDate.get(session.date);
        if (locked) {
          const activity = (activitiesByDate.get(session.date) ?? [])[0];
          const lockedWithMeta: UnifiedSession = {
            ...locked,
            actualActivity: activity
              ? {
                  id: activity.id,
                  name: activity.name,
                  type: activity.type,
                  distanceKm: activity.distance,
                  durationSec: activity.duration,
                  date: activity.date,
                }
              : undefined,
            blockIntent: blockIntent ?? undefined,
          };
          return lockedWithMeta;
        }
      }

      const activity = (activitiesByDate.get(session.date) ?? [])[0];
      return {
        ...session,
        actualActivity:
          effectiveMode === 'remaining_days' && activity && session.date < todayIso
            ? {
                id: activity.id,
                name: activity.name,
                type: activity.type,
                distanceKm: activity.distance,
                durationSec: activity.duration,
                date: activity.date,
              }
            : undefined,
        blockIntent: blockIntent ?? undefined,
      };
    });

    // Step 5: Generate title + summary
    console.log(`[WeeklyPlan] Step 4: Generate title/summary...`);
    sendProgress('merge', 'Generating plan metadata and summary.');
    const sessionOverview = unifiedSessions
      .map((s) => {
        const parts = [s.day];
        if (s.run) parts.push(`run: ${s.run.type}`);
        if (s.strengthSlot) parts.push(`strength slot: ${s.strengthSlot.load ?? 'moderate'}`);
        if (!s.run && !s.strengthSlot) parts.push('rest');
        return parts.join(' — ');
      })
      .join('\n');

    const metaObject = await generateObjectWithRetry<PlanMeta>({
      model,
      schema: planMetaSchema,
      prompt: `Generate a short title and 1-2 sentence summary for this unified weekly training plan (${weekStart} to ${weekEnd}):\n\n${sessionOverview}${settings?.goal ? `\n\nAthlete goal: ${settings.goal}` : ''}`,
    });

    // Build markdown content
    const markdownLines = [`# ${metaObject.title}`, '', metaObject.summary, ''];
    for (const s of unifiedSessions) {
      markdownLines.push(`## ${s.day} — ${s.date}`);
      if (s.run) {
        markdownLines.push(`### Running: ${s.run.type}`);
        markdownLines.push(s.run.description);
        const details: string[] = [];
        if (s.run.duration) details.push(`Duration: ${s.run.duration}`);
        if (s.run.targetPace) details.push(`Pace: ${s.run.targetPace}`);
        if (s.run.targetZone) details.push(`Zone: ${s.run.targetZone}`);
        if (details.length) markdownLines.push(details.join(' | '));
        if (s.run.notes) markdownLines.push(`> ${s.run.notes}`);
      }
      if (s.strengthSlot) {
        markdownLines.push('### Strength slot');
        markdownLines.push(
          `Load target: ${s.strengthSlot.load ?? 'moderate'}${s.strengthSlot.focus ? ` | Focus: ${s.strengthSlot.focus}` : ''}`,
        );
        if (s.strengthSlot.notes) markdownLines.push(`> ${s.strengthSlot.notes}`);
      }
      if (!s.run && !s.strengthSlot) {
        markdownLines.push('Rest day');
        if (s.notes) markdownLines.push(s.notes);
      }
      markdownLines.push('');
    }

    markdownLines.push('## Evidence and Risk');
    markdownLines.push(
      'Recommendations were grounded in your recent load metrics and profile data.',
    );
    markdownLines.push(
      `- Risk level: ${riskIntelligence.riskLevel} (${riskIntelligence.riskScore}/100)`,
    );
    markdownLines.push('- Pipeline mode: coach-only with strength-slot planning.');
    markdownLines.push(
      `- Runtime counters: rounds ${roundCount}, specialist turns ${specialistTurnsUsed}, repairs ${repairTurnsUsed}.`,
    );
    if (physioFallbackReason) {
      markdownLines.push('- Fallback applied: coach-only fallback was activated.');
    }
    if (finalDistributionEvaluation) {
      markdownLines.push(
        `- Weekly distribution score: ${finalDistributionEvaluation.score}/100 (target >= ${finalDistributionEvaluation.threshold})`,
      );
      markdownLines.push(
        `- Distribution subscores: type ${finalDistributionEvaluation.subscores.sessionType}, intensity ${finalDistributionEvaluation.subscores.intensity}, spread ${finalDistributionEvaluation.subscores.loadSpread}`,
      );
      if (!finalDistributionEvaluation.accepted) {
        markdownLines.push(
          '- Distribution tradeoff: below target but accepted because safety constraints were satisfied.',
        );
      }
      for (const issue of finalDistributionEvaluation.issues.slice(0, 3)) {
        markdownLines.push(`- Distribution note: ${issue.message}`);
      }
    }
    markdownLines.push(`- Coordination summary: ${conflictSummary}`);
    for (const contributor of riskIntelligence.topContributors) {
      markdownLines.push(`- Contributor: ${contributor}`);
    }
    for (const conflict of multiAgentConflicts.slice(0, 3)) {
      markdownLines.push(
        `- Conflict resolved: ${conflict.date} ${conflict.rule} (${conflict.severity}) -> ${conflict.action}`,
      );
    }
    for (const action of riskIntelligence.recommendedActions) {
      markdownLines.push(`- Mitigation: ${action}`);
    }
    markdownLines.push(
      '- Evidence references: NIST GenAI risk framing (2024), intensity-distribution and HRV-guided adaptation literature noted in the roadmap bibliography.',
    );
    markdownLines.push('');

    const markdownContent = markdownLines.join('\n');
    const encodedPreferences = encodeURIComponent(generationPreferences || '');
    const strategyMetaPayload = encodeURIComponent(
      JSON.stringify({
        mode: resolvedStrategyMode,
        preset: resolvedPreset,
        strategyLabel,
        optimizationPriority: resolvedPriority,
        optimizationPriorityLabel,
        calibratedPriority,
        calibrationReason: calibration.reason,
        autoRationale:
          resolvedStrategyMode === 'auto'
            ? strategyRecommendation.rationale
            : null,
        digitalTwin: twinProfile,
        counterfactualRanking,
        risk: riskIntelligence,
        distribution: finalDistributionEvaluation,
      }),
    );
    const content = `${PLAN_PREFERENCES_PREFIX}${encodedPreferences}${PLAN_PREFERENCES_SUFFIX}\n${PLAN_STRATEGY_PREFIX}${strategyMetaPayload}${PLAN_STRATEGY_SUFFIX}\n${markdownContent}`;

    // Step 6: Save
    sendProgress('save', 'Saving weekly plan.');
    const planId = crypto.randomUUID();
    const now2 = Date.now();

    await db.insert(weeklyPlans).values({
      id: planId,
      athleteId,
      weekStart,
      title: metaObject.title,
      summary: metaObject.summary,
      goal: settings?.goal ?? null,
      sessions: unifiedSessions,
      content,
      isActive: true,
      blockId: activeBlockId,
      weekNumber: blockWeekNumber,
      createdAt: now2,
    });

    // Deactivate other plans for this athlete
    await db
      .update(weeklyPlans)
      .set({isActive: false})
      .where(
        and(
          eq(weeklyPlans.athleteId, athleteId),
          ne(weeklyPlans.id, planId),
        ),
      );

    console.log(`[WeeklyPlan] Plan saved: ${planId}`);
    console.log(`[WeeklyPlan] ========================================\n`);
    logAiTrace(trace, 'request_finished', {
      athleteId,
      model: resolvedModel,
      persona: 'pipeline',
      sessionId: null,
      planId,
      weekStart,
      sessionCount: unifiedSessions.length,
      mode: effectiveMode,
      multiAgentEnabled,
      roundCount,
      specialistTurnsUsed,
      repairTurnsUsed,
      repairApplied,
      conflictCount: multiAgentConflicts.length,
      highSeverityConflictCount: multiAgentConflicts.filter(
        (conflict) => conflict.severity === 'high',
      ).length,
      distributionScore: finalDistributionEvaluation?.score ?? null,
      distributionAccepted: finalDistributionEvaluation?.accepted ?? null,
      distributionRepairApplied,
      distributionRepairAttempts,
      elapsedMs: elapsedMs(),
      inputTokens: null,
      outputTokens: null,
    });

    const responsePayload = {
      id: planId,
      weekStart,
      title: metaObject.title,
      summary: metaObject.summary,
      goal: settings?.goal ?? null,
      sessions: unifiedSessions,
      content,
      blockId: activeBlockId,
      weekNumber: blockWeekNumber,
      mode: effectiveMode,
      sourcePlanId: sourcePlanForReplan?.id ?? null,
      risk: riskIntelligence,
      digitalTwin: twinProfile,
      counterfactualRanking,
      multiAgent: {
        enabled: multiAgentEnabled,
        roundCount,
        specialistTurnsUsed,
        repairTurnsUsed,
        repairApplied,
        conflictCount: multiAgentConflicts.length,
        conflicts: multiAgentConflicts,
        summary: conflictSummary,
        physioFallbackReason,
      },
      distribution: finalDistributionEvaluation,
      createdAt: now2,
    };
    sendProgress('save', 'Plan saved successfully.');
    sendDone(responsePayload);
    controller.close();
  } catch (error) {
    logAiTrace(trace, 'request_failed', {
      athleteId,
      model: resolvedModel,
      persona: 'pipeline',
      sessionId: null,
      message: error instanceof Error ? error.message : 'unknown error',
      inputTokens: null,
      outputTokens: null,
    });
    console.error('[WeeklyPlan] Error:', error);
    if (
      error instanceof Error &&
      error.message.startsWith('MULTI_AGENT_RUNTIME_BUDGET_EXCEEDED')
    ) {
      sendError(
        'Weekly planning exceeded the bounded runtime budget. Please retry with fewer constraints.',
        {
          code: 'multi_agent_runtime_budget_exceeded',
          status: 503,
        },
      );
      controller.close();
      return;
    }
    if (
      error instanceof Error &&
      error.message.startsWith('SOURCE_PLAN_NOT_FOUND')
    ) {
      const isEditSourceMissing =
        error.message === 'SOURCE_PLAN_NOT_FOUND_FOR_EDIT';
      sendError(
        isEditSourceMissing
          ? 'No source weekly plan found for edit request.'
          : 'No source weekly plan found for remaining-days replan.',
        {
        code: isEditSourceMissing
          ? 'source_plan_not_found_for_edit'
          : 'source_plan_not_found',
        status: isEditSourceMissing ? 404 : 400,
      });
      controller.close();
      return;
    }
    sendError('Failed to generate weekly plan.', {
      code: 'generation_failed',
      status: 500,
    });
    controller.close();
  }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'x-trace-id': trace.traceId,
    },
  });
}
