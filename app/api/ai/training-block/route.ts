import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {getDb} from '@/db';
import {
  activities as activitiesTable,
  userSettings,
  trainingBlocks,
  athleteReadinessSignals,
  aiPlanningState,
} from '@/db/schema';
import {eq, desc, and, ne, isNull, sql, gte, lt} from 'drizzle-orm';
import {transformActivity} from '@/lib/strava';
import type {StravaSummaryActivity} from '@/lib/strava';
import {
  calcFitnessData,
  calcACWRData,
  calcAdvancedMetricsData,
  getLatestMetricsSnapshot,
  calcRiskIntelligence,
} from '@/utils/trainingLoad';
import {formatPace, formatDuration, type UserSettings} from '@/lib/activityModel';
import type {WeekOutline} from '@/lib/cacheTypes';
import {
  buildTrainingBlockOutputSchema,
  type TrainingBlockOutputPartial,
} from '@/lib/trainingBlockSchema';
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
} from '@/lib/digitalTwin';
import {calibratePriorityFromOutcomes} from '@/lib/calibration';
import {trainingBlockRequestSchema} from '@/lib/aiRequestSchemas';
import {generateObjectWithRetry} from '@/lib/aiGeneration';
import {validateTrainingBlockWeekOutlines} from '@/lib/planSemanticValidators';
import {createTraceContext, logAiTrace, promptHash} from '@/lib/aiTrace';
import {createAiErrorPayload} from '@/lib/aiErrors';
import {getNextMondayInTimeZone} from '@/lib/weekTime';
import {resolvePlanEnv} from '@/lib/planEnv';
import {
  DEFAULT_TRAINING_BLOCK_MIN_FORWARD_WEEKS,
  blockCurrentCanonicalWeek,
  readFirstActiveWeekNumber,
  resolveTrainingBlockWeekParams,
} from '@/lib/trainingBlockWeekMath';

export const maxDuration = 120;
const ACTIVITY_CONTEXT_WINDOW_DAYS = 120;
const GENERATION_LOCK_TTL_MS = 2 * 60 * 1000;

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

const getActivityContextStartDate = (): string => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ACTIVITY_CONTEXT_WINDOW_DAYS);
  return cutoff.toISOString().slice(0, 10);
};

const weeksUntil = (startIso: string, endIso: string): number => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return Math.max(4, Math.ceil((end.getTime() - start.getTime()) / (7 * 86400000)));
};

const STRATEGY_NOTE_PREFIX = '[Strategy] ';

const stripStrategyStamp = (notes: string): string =>
  notes.replace(/^\[Strategy\].*?(?:\s+—\s+)?/i, '').trim();

const buildStrategyStamp = (
  mode: StrategySelectionMode,
  strategyLabel: string,
  optimizationPriorityLabel: string,
): string =>
  `${mode === 'auto' ? `Auto -> ${strategyLabel}` : `Preset -> ${strategyLabel}`} | Priority: ${optimizationPriorityLabel}`;

const withStrategyStamp = <T extends {notes?: string}>(
  weekOutlines: T[],
  mode: StrategySelectionMode,
  strategyLabel: string,
  optimizationPriorityLabel: string,
  rationale: string | null,
): T[] => {
  if (weekOutlines.length === 0) return weekOutlines;
  const summary = buildStrategyStamp(mode, strategyLabel, optimizationPriorityLabel);
  const decorated = `${STRATEGY_NOTE_PREFIX}${summary}${rationale ? ` | ${rationale}` : ''}`;
  return weekOutlines.map((outline, index) => {
    if (index !== 0) return outline;
    const cleaned = stripStrategyStamp(outline.notes ?? '');
    return {
      ...outline,
      notes: cleaned ? `${decorated} — ${cleaned}` : decorated,
    };
  });
};

const buildTrainingBlockGenerationLockKey = (input: {
  athleteId: number;
  idempotencyKey?: string;
  goalEvent: string;
  goalDate: string;
  mode?: 'create' | 'adapt';
  sourceBlockId?: string;
  planEnv?: 'dev' | 'prod';
}): string => {
  const explicit = input.idempotencyKey?.trim();
  if (explicit) {
    return `generation-lock:training-block:${input.athleteId}:${explicit}`;
  }
  return [
    'generation-lock:training-block',
    input.athleteId,
    input.mode ?? 'create',
    input.planEnv ?? 'prod',
    input.goalEvent.trim().toLowerCase(),
    input.goalDate,
    input.sourceBlockId ?? 'none',
  ].join(':');
};

const acquireGenerationLock = async (
  athleteId: number,
  key: string,
): Promise<boolean> => {
  const db = getDb();
  const now = Date.now();
  await db
    .delete(aiPlanningState)
    .where(and(eq(aiPlanningState.key, key), lt(aiPlanningState.expiresAt, now)))
    .catch(() => {});

  const inserted = await db
    .insert(aiPlanningState)
    .values({
      key,
      athleteId,
      sessionId: 'generation-lock',
      state: {kind: 'generation-lock', scope: 'training-block'},
      expiresAt: now + GENERATION_LOCK_TTL_MS,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({target: aiPlanningState.key})
    .returning({key: aiPlanningState.key});

  return inserted.length > 0;
};

const releaseGenerationLock = async (key: string): Promise<void> => {
  const db = getDb();
  await db
    .delete(aiPlanningState)
    .where(eq(aiPlanningState.key, key))
    .catch(() => {});
};

export async function POST(req: Request) {
  const trace = createTraceContext('ai.training-block', req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      createAiErrorPayload('invalid_json_body', 'Invalid JSON body'),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }
  const parsedBody = trainingBlockRequestSchema.safeParse(body);
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
    idempotencyKey?: string;
    mode?: 'create' | 'adapt';
    goalEvent: string;
    goalDate: string;
    requirements?: string;
    totalWeeks?: number;
    model?: string;
    adaptationType?:
      | 'recalibrate_remaining_weeks'
      | 'insert_event'
      | 'shift_target_date';
    sourceBlockId?: string;
    effectiveFromWeek?: number;
    event?: {
      name: string;
      date: string;
      distanceKm?: number;
      priority?: 'A' | 'B' | 'C';
    };
    strategySelectionMode?: StrategySelectionMode;
    strategyPreset?: TrainingStrategyPreset;
    optimizationPriority?: OptimizationPriority;
    riskOverride?: boolean;
    timeZone?: string;
    planEnv?: 'dev' | 'prod';
  };
  const {
    athleteId,
    idempotencyKey,
    mode,
    goalEvent,
    goalDate,
    requirements,
    totalWeeks: clientWeeks,
    model: clientModel,
    adaptationType,
    sourceBlockId,
    effectiveFromWeek,
    event,
    strategySelectionMode,
    strategyPreset,
    optimizationPriority,
    riskOverride = false,
    timeZone,
    planEnv: inputPlanEnv,
  } = parsedData;
  const planEnv = resolvePlanEnv(inputPlanEnv);
  const resolvedTimeZone = timeZone?.trim() || 'UTC';

  if (!athleteId) {
    return NextResponse.json(
      createAiErrorPayload('athlete_id_required', 'athleteId required'),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }

  const lockKey = buildTrainingBlockGenerationLockKey({
    athleteId,
    idempotencyKey: idempotencyKey ?? req.headers.get('x-idempotency-key') ?? undefined,
    goalEvent,
    goalDate,
    mode,
    sourceBlockId,
    planEnv,
  });
  const lockAcquired = await acquireGenerationLock(athleteId, lockKey);
  if (!lockAcquired) {
    return NextResponse.json(
      createAiErrorPayload(
        'generation_inflight_duplicate',
        'A training block generation request is already in progress for this payload. Please wait.',
      ),
      {status: 409, headers: {'x-trace-id': trace.traceId}},
    );
  }

  const resolvedMode = mode ?? 'create';
  const model = getModel(clientModel);
  const resolvedModel =
    clientModel && ALLOWED_MODELS[clientModel]
      ? clientModel
      : (process.env.AI_MODEL ??
        (process.env.AI_PROVIDER === 'anthropic'
          ? 'claude-sonnet-4-5'
          : 'gpt-4o-mini'));

  if (resolvedMode === 'create' && (!goalEvent || !goalDate)) {
    return NextResponse.json(
      createAiErrorPayload(
        'goal_fields_required',
        'athleteId, goalEvent, and goalDate required',
      ),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }

  if (resolvedMode === 'adapt' && !adaptationType) {
    return NextResponse.json(
      createAiErrorPayload(
        'adaptation_type_required',
        'adaptationType required in adapt mode',
      ),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }

  logAiTrace(trace, 'request_received', {
    athleteId,
    mode: resolvedMode,
    model: resolvedModel,
    persona: 'pipeline',
    sessionId: null,
  });
  const requestStartedAt = Date.now();

  console.log(`\n[TrainingBlock] ========== Generating Block ==========`);
  console.log(`[TrainingBlock] Athlete: ${athleteId}`);
  console.log(`[TrainingBlock] Mode: ${resolvedMode}`);

  try {
    const db = getDb();
    const elapsedMs = () => Date.now() - requestStartedAt;
    let roundCount = 0;
    let specialistTurnsUsed = 0;
    let repairTurnsUsed = 0;
    let repairApplied = false;
    const collaborationSummary = 'Single-pass coach-led macro periodization.';

    if (resolvedMode === 'adapt') {
      const sourceRows = sourceBlockId
        ? await db
            .select()
            .from(trainingBlocks)
            .where(
              and(
                eq(trainingBlocks.id, sourceBlockId),
                eq(trainingBlocks.athleteId, athleteId),
                eq(trainingBlocks.planEnv, planEnv),
                isNull(trainingBlocks.deletedAt),
              ),
            )
            .limit(1)
        : await db
            .select()
            .from(trainingBlocks)
            .where(
              and(
                eq(trainingBlocks.athleteId, athleteId),
                eq(trainingBlocks.planEnv, planEnv),
                eq(trainingBlocks.isActive, true),
                isNull(trainingBlocks.deletedAt),
              ),
            )
            .orderBy(desc(trainingBlocks.createdAt))
            .limit(1);

      const sourceBlock = sourceRows[0];
      if (!sourceBlock) {
        return NextResponse.json(
          createAiErrorPayload(
            'source_block_not_found',
            'No source training block found for adaptation',
          ),
          {status: 400, headers: {'x-trace-id': trace.traceId}},
        );
      }

      const activityContextStartDate = getActivityContextStartDate();
      const [settingsRows, activityRows, readinessRows] = await Promise.all([
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
          .from(athleteReadinessSignals)
          .where(eq(athleteReadinessSignals.athleteId, athleteId))
          .orderBy(desc(athleteReadinessSignals.date))
          .limit(1),
      ]);

      const settings = settingsRows[0];
      const allActivities = activityRows.map((row) =>
        transformActivity(row.data as StravaSummaryActivity),
      );
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

      const startDate = sourceBlock.startDate;
      const srcFirstActive = readFirstActiveWeekNumber(
        sourceBlock.firstActiveWeekNumber,
      );
      if (sourceBlock.totalWeeks < srcFirstActive) {
        return NextResponse.json(
          createAiErrorPayload(
            'invalid_source_block',
            'Source training block has inconsistent week range (totalWeeks < firstActiveWeekNumber).',
          ),
          {status: 400, headers: {'x-trace-id': trace.traceId}},
        );
      }
      const adaptForwardWeeks =
        sourceBlock.totalWeeks - srcFirstActive + 1;
      const currentWeek = blockCurrentCanonicalWeek({
        blockStartMondayIso: startDate,
        firstActiveWeekNumber: srcFirstActive,
        canonicalTotalWeeks: sourceBlock.totalWeeks,
      });
      const effectiveWeek = Math.max(1, effectiveFromWeek ?? currentWeek);
      const eventPriority = event?.priority ?? 'B';

      const recentActivities = allActivities;
      const recentVolume = recentActivities.reduce((sum, a) => sum + a.distance, 0);
      const avgWeeklyVolume = recentVolume > 0 ? recentVolume / (ACTIVITY_CONTEXT_WINDOW_DAYS / 7) : 0;
      let latestSnapshot = getLatestMetricsSnapshot([]);
      if (settings) {
        try {
          const zonesRaw = settings?.zones as Record<string, [number, number]> | undefined;
          const typedZones = zonesRaw as UserSettings['zones'] | undefined;
          const fitnessResult = calcFitnessData(
            allActivities,
            settings.restingHr,
            settings.maxHr,
            180,
            typedZones,
          );
          latestSnapshot = getLatestMetricsSnapshot(
            calcAdvancedMetricsData(fitnessResult.data, allActivities),
          );
        } catch {
          // Non-blocking
        }
      }
      const strategyRecommendation = recommendStrategy({
        acwr: latestSnapshot.acwr,
        tsb: latestSnapshot.tsb,
        monotony: latestSnapshot.monotony,
        goal: (settings?.goal as string | null | undefined) ?? null,
        priority:
          (latestSnapshot.acwr ?? 0) >= 1.5 && !riskOverride
            ? 'injury_risk'
            : resolvedPriority,
      });
      if (
        (latestSnapshot.acwr ?? 0) >= 1.5 &&
        resolvedPriority === 'race_performance' &&
        !riskOverride
      ) {
        throw new Error('ACWR_RISK_OVERRIDE_REQUIRED');
      }
      const resolvedPreset: TrainingStrategyPreset =
        resolvedStrategyMode === 'preset'
          ? strategyPreset ?? defaultPreset
          : strategyRecommendation.strategy;
      const riskIntelligence = calcRiskIntelligence(latestSnapshot, {
        sleepHours: readinessRows[0]?.sleepHours ?? null,
        readinessScore: readinessRows[0]?.readinessScore ?? null,
        sessionRpe: readinessRows[0]?.sessionRpe ?? null,
      });
      const twinProfile = buildAthleteDigitalTwin({
        activities: allActivities,
        risk: riskIntelligence,
      });
      const counterfactualRanking = rankCounterfactualStrategies({
        twin: twinProfile,
        risk: riskIntelligence,
        optimizationPriority: calibratePriorityFromOutcomes({
          risk: riskIntelligence,
        }).recommendedPriority,
      });
      const effectivePriority = calibratePriorityFromOutcomes({
        risk: riskIntelligence,
      }).recommendedPriority;
      const selectedPreset =
        resolvedStrategyMode === 'auto' && counterfactualRanking.length > 0
          ? counterfactualRanking[0].strategy
          : resolvedPreset;
      const strategyLabel = STRATEGY_PRESET_LABELS[selectedPreset];
      const strategyDescription = `${describeStrategyPreset(
        selectedPreset,
      )} ${resolvedStrategyMode === 'auto' ? `Auto-selected rationale: ${counterfactualRanking[0]?.rationale ?? strategyRecommendation.rationale}` : ''}`.trim();
      const priorityLabel = OPTIMIZATION_PRIORITY_LABELS[effectivePriority];
      const strategyRationale =
        resolvedStrategyMode === 'auto'
          ? counterfactualRanking[0]?.rationale ?? strategyRecommendation.rationale
          : null;

      const adaptationPrompt = `You are adapting an existing running training block while preserving history.

## Adaptation Request
- Type: ${adaptationType}
- Effective from week: ${effectiveWeek}
${event ? `- Inserted event: ${event.name} on ${event.date} (${event.distanceKm ?? 'unknown'} km), priority ${eventPriority}` : ''}
${adaptationType === 'insert_event' ? '- For B-race, apply a mini taper and short post-race recovery while keeping the main goal unchanged.' : ''}
${adaptationType === 'shift_target_date' ? `- New goal date requested: ${goalDate ?? sourceBlock.goalDate}` : ''}
- Strategy to follow: ${strategyLabel}
- Strategy intent: ${strategyDescription}
- Optimization priority: ${priorityLabel}
- Digital twin archetype: ${twinProfile.archetype}
- Risk level: ${riskIntelligence.riskLevel} (${riskIntelligence.riskScore}/100)

## Existing Block (source of truth for past weeks)
- Goal Event: ${sourceBlock.goalEvent}
- Goal Date: ${sourceBlock.goalDate}
- Total Weeks (canonical): ${sourceBlock.totalWeeks}
- First active canonical week: ${srcFirstActive}
- Start Date (Monday of week ${srcFirstActive}): ${sourceBlock.startDate}
- Current Week: ${currentWeek}
- Avg weekly volume (last 4 months): ${avgWeeklyVolume.toFixed(1)} km
- Current CTL/ATL/TSB: ${latestSnapshot.ctl ?? 'n/a'} / ${latestSnapshot.atl ?? 'n/a'} / ${latestSnapshot.tsb ?? 'n/a'}
- Current ACWR: ${latestSnapshot.acwr ?? 'n/a'}

## Athlete Context
${settings?.goal ? `- Athlete goal: ${settings.goal}` : ''}
${settings?.injuries ? `- Injuries: ${JSON.stringify(settings.injuries)}` : ''}

## Existing Phases JSON
${JSON.stringify(sourceBlock.phases)}

## Existing Week Outlines JSON
${JSON.stringify(sourceBlock.weekOutlines)}

## Instructions
- Preserve all weeks before effective week as historical (do not rewrite intent drastically).
- Recalculate weeks from effective week onward according to adaptation request.
- Maintain progressive overload with periodic deload/recovery and safe taper logic.
- Return week outlines ONLY for canonical weeks ${srcFirstActive}..${sourceBlock.totalWeeks} (${adaptForwardWeeks} weeks), with weekNumber matching those indices.
- Keep exactly ${adaptForwardWeeks} week outlines. Phases must only reference week numbers in that range.`;

      logAiTrace(trace, 'adapt_prompt_built', {
        promptHash: promptHash(adaptationPrompt),
        totalWeeks: sourceBlock.totalWeeks,
      });
      const adaptSchema = buildTrainingBlockOutputSchema(adaptForwardWeeks);
      const adaptedObject = await generateObjectWithRetry<TrainingBlockOutputPartial>({
        model,
        schema: adaptSchema,
        prompt: adaptationPrompt,
        semanticCheck: (candidate) =>
          validateTrainingBlockWeekOutlines(
            candidate.weekOutlines as WeekOutline[],
            sourceBlock.totalWeeks,
            srcFirstActive,
          ),
      });
      specialistTurnsUsed += 1;
      roundCount += 1;
      const stampedWeekOutlines = withStrategyStamp(
        adaptedObject.weekOutlines,
        resolvedStrategyMode,
        strategyLabel,
        priorityLabel,
        strategyRationale,
      );

      const blockId = crypto.randomUUID();
      const nowMs = Date.now();
      const resolvedGoalDate = goalDate || sourceBlock.goalDate;
      const resolvedGoalEvent = goalEvent || sourceBlock.goalEvent;

      await db.insert(trainingBlocks).values({
        id: blockId,
        athleteId,
        planEnv,
        goalEvent: resolvedGoalEvent,
        goalDate: resolvedGoalDate,
        totalWeeks: sourceBlock.totalWeeks,
        firstActiveWeekNumber: srcFirstActive,
        startDate,
        phases: adaptedObject.phases,
        weekOutlines: stampedWeekOutlines,
        isActive: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });

      await db
        .update(trainingBlocks)
        .set({isActive: false})
        .where(
          and(
            eq(trainingBlocks.athleteId, athleteId),
            eq(trainingBlocks.planEnv, planEnv),
            ne(trainingBlocks.id, blockId),
            isNull(trainingBlocks.deletedAt),
          ),
        );
      logAiTrace(trace, 'request_finished', {
        athleteId,
        model: resolvedModel,
        persona: 'pipeline',
        sessionId: null,
        blockId,
        mode: resolvedMode,
        totalWeeks: sourceBlock.totalWeeks,
        roundCount,
        specialistTurnsUsed,
        repairTurnsUsed,
        repairApplied,
        collaborationSummary,
        elapsedMs: elapsedMs(),
        inputTokens: null,
        outputTokens: null,
      });
      return NextResponse.json({
        id: blockId,
        athleteId,
        goalEvent: resolvedGoalEvent,
        goalDate: resolvedGoalDate,
        totalWeeks: sourceBlock.totalWeeks,
        firstActiveWeekNumber: srcFirstActive,
        startDate,
        phases: adaptedObject.phases,
        weekOutlines: stampedWeekOutlines,
        isActive: true,
        createdAt: nowMs,
        updatedAt: nowMs,
        risk: riskIntelligence,
        digitalTwin: twinProfile,
        counterfactualRanking,
      }, {headers: {'x-trace-id': trace.traceId}});
    }

    const startDate = getNextMondayInTimeZone(resolvedTimeZone);
    const resolvedWeekParams = resolveTrainingBlockWeekParams({
      clientTemplateWeeks: clientWeeks,
      startMondayIso: startDate,
      goalDateIso: goalDate,
      autoTemplateWeeks: weeksUntil,
    });
    const {
      templateWeeks: totalWeeks,
      firstActiveWeekNumber,
      forwardWeekCount,
    } = resolvedWeekParams;

    if (forwardWeekCount < DEFAULT_TRAINING_BLOCK_MIN_FORWARD_WEEKS) {
      return NextResponse.json(
        createAiErrorPayload(
          'training_block_timeline_too_short',
          `Only ${forwardWeekCount} week(s) remain until the goal from this start date. Pick a later start, adjust the goal date, or use a shorter template (minimum ${DEFAULT_TRAINING_BLOCK_MIN_FORWARD_WEEKS} forward weeks).`,
        ),
        {status: 400, headers: {'x-trace-id': trace.traceId}},
      );
    }

    console.log(`[TrainingBlock] Goal: ${goalEvent} on ${goalDate}`);
    console.log(
      `[TrainingBlock] Canonical weeks: ${totalWeeks}, first active: ${firstActiveWeekNumber}, forward: ${forwardWeekCount}, starts ${startDate}`,
    );

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
    const readinessTableExists = Boolean(dbContextRows.rows[0]?.readinessRegclass);

    let settingsRows: Array<typeof userSettings.$inferSelect> = [];
    let activityRows: Array<typeof activitiesTable.$inferSelect> = [];
    let readinessRows: Array<typeof athleteReadinessSignals.$inferSelect> = [];
    const activityContextStartDate = getActivityContextStartDate();
    [settingsRows, activityRows, readinessRows] = await Promise.all([
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
      readinessTableExists
        ? db
            .select()
            .from(athleteReadinessSignals)
            .where(eq(athleteReadinessSignals.athleteId, athleteId))
            .orderBy(desc(athleteReadinessSignals.date))
            .limit(1)
        : Promise.resolve([] as Array<typeof athleteReadinessSignals.$inferSelect>),
    ]);

    const settings = settingsRows[0];
    const zonesRaw = settings?.zones as Record<string, [number, number]> | undefined;
    const typedZones = zonesRaw as UserSettings['zones'] | undefined;
    const injuries = settings?.injuries as Array<{name?: string; notes?: string}> | undefined;
    const injuriesText = injuries?.length
      ? injuries.map((item) => item?.name || '').filter(Boolean).join(', ')
      : 'None reported';

    const allActivities = activityRows.map((r) =>
      transformActivity(r.data as StravaSummaryActivity),
    );
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

    const recentActivities = allActivities;

    const weeklyVolumes: Record<string, {distance: number; count: number}> = {};
    for (const act of recentActivities) {
      const d = new Date(act.date);
      const dayOfWeek = (d.getDay() + 6) % 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek);
      const weekKey = monday.toISOString().slice(0, 10);
      if (!weeklyVolumes[weekKey]) weeklyVolumes[weekKey] = {distance: 0, count: 0};
      weeklyVolumes[weekKey].distance += act.distance;
      weeklyVolumes[weekKey].count += 1;
    }

    const avgWeeklyKm =
      Object.values(weeklyVolumes).length > 0
        ? Object.values(weeklyVolumes).reduce((s, w) => s + w.distance, 0) /
          Object.values(weeklyVolumes).length
        : 0;

    const recentTrainingLines = Object.entries(weeklyVolumes)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([week, data]) => `- Week of ${week}: ${data.distance.toFixed(1)} km, ${data.count} activities`)
      .join('\n');

    let acwrText = '';
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
        latestSnapshot = getLatestMetricsSnapshot(
          calcAdvancedMetricsData(fitnessResult.data, allActivities),
        );
        const latestAcwr = acwrData[acwrData.length - 1];
        if (latestAcwr) {
          acwrText = `\n- ACWR: ${latestAcwr.acwr.toFixed(2)}`;
        }
      } catch { /* non-blocking */ }
    }
    const acwrRiskHigh = (latestSnapshot.acwr ?? 0) >= 1.5;
    if (acwrRiskHigh && resolvedPriority === 'race_performance' && !riskOverride) {
      throw new Error('ACWR_RISK_OVERRIDE_REQUIRED');
    }
    const effectivePriorityForRisk: OptimizationPriority =
      acwrRiskHigh && !riskOverride ? 'injury_risk' : resolvedPriority;
    const strategyRecommendation = recommendStrategy({
      acwr: latestSnapshot.acwr,
      tsb: latestSnapshot.tsb,
      monotony: latestSnapshot.monotony,
      goal: (settings?.goal as string | null | undefined) ?? null,
      priority: effectivePriorityForRisk,
    });
    const resolvedPreset: TrainingStrategyPreset =
      resolvedStrategyMode === 'preset'
        ? strategyPreset ?? defaultPreset
        : strategyRecommendation.strategy;
    const riskIntelligence = calcRiskIntelligence(latestSnapshot, {
      sleepHours: readinessRows[0]?.sleepHours ?? null,
      readinessScore: readinessRows[0]?.readinessScore ?? null,
      sessionRpe: readinessRows[0]?.sessionRpe ?? null,
    });
    const twinProfile = buildAthleteDigitalTwin({
      activities: allActivities,
      risk: riskIntelligence,
    });
    const counterfactualRanking = rankCounterfactualStrategies({
      twin: twinProfile,
      risk: riskIntelligence,
      optimizationPriority: calibratePriorityFromOutcomes({
        risk: riskIntelligence,
      }).recommendedPriority,
    });
    const effectivePriority = calibratePriorityFromOutcomes({
      risk: riskIntelligence,
    }).recommendedPriority;
    const selectedPreset =
      resolvedStrategyMode === 'auto' && counterfactualRanking.length > 0
        ? counterfactualRanking[0].strategy
        : resolvedPreset;
    const strategyLabel = STRATEGY_PRESET_LABELS[selectedPreset];
    const strategyDescription = `${describeStrategyPreset(
      selectedPreset,
    )} ${resolvedStrategyMode === 'auto' ? `Auto-selected rationale: ${counterfactualRanking[0]?.rationale ?? strategyRecommendation.rationale}` : ''}`.trim();
    const priorityLabel = OPTIMIZATION_PRIORITY_LABELS[
      acwrRiskHigh && !riskOverride ? 'injury_risk' : effectivePriority
    ];
    const strategyRationale =
      resolvedStrategyMode === 'auto'
        ? counterfactualRanking[0]?.rationale ?? strategyRecommendation.rationale
        : null;

    let prText = 'No personal records available';
    const runActivities = recentActivities
      .filter((a) => a.type === 'Run' && a.distance > 0 && a.duration > 0)
      .slice(0, 5);
    if (runActivities.length > 0) {
      prText = runActivities
        .map((a) => `- ${a.distance.toFixed(1)} km at ${formatPace(a.avgPace)} (${formatDuration(a.duration)})`)
        .join('\n');
    }

    const partialTimelineSection =
      firstActiveWeekNumber > 1
        ? `## Partial timeline (late start)
- The athlete requested a **${totalWeeks}-week canonical marathon (or similar) template**, but only **${forwardWeekCount}** calendar week(s) remain from this block start until the goal.
- Treat canonical weeks **1..${firstActiveWeekNumber - 1}** as **already completed**: assume reasonable easy aerobic base, consistency, and strides; **do not** output outlines for those weeks.
- Output week outlines **only** for canonical weeks **${firstActiveWeekNumber}** through **${totalWeeks}** (inclusive). Each outline's \`weekNumber\` must be that canonical index.
- \`phases\` must only list \`weekNumbers\` in **${firstActiveWeekNumber}..${totalWeeks}**.

`
        : '';

    const prompt = `You are an expert running coach specializing in periodized training. Generate a periodized training block for the following athlete and goal.

## Goal
- Event: ${goalEvent}
- Event Date: ${goalDate}
- Block Start: ${startDate} (Monday beginning canonical week ${firstActiveWeekNumber})
- Canonical template length: ${totalWeeks} weeks
- Week outlines to output: ${forwardWeekCount} (weeks ${firstActiveWeekNumber}–${totalWeeks})

${partialTimelineSection}## Athlete
${settings?.weight ? `- Weight: ${settings.weight} kg` : ''}
${settings?.trainingBalance != null ? `- Training Balance: ${settings.trainingBalance}/80 (20=run-focused, 80=gym-focused)` : ''}
- Strategy to follow: ${strategyLabel}
- Strategy intent: ${strategyDescription}
- Optimization priority: ${priorityLabel}
- Digital twin archetype: ${twinProfile.archetype}
- Risk level: ${riskIntelligence.riskLevel} (${riskIntelligence.riskScore}/100)
- Current avg weekly volume: ${avgWeeklyKm.toFixed(1)} km

## Recent Training (last 4 months)
${recentTrainingLines || 'No recent training data'}${acwrText}
- Current CTL/ATL/TSB: ${latestSnapshot.ctl ?? 'n/a'} / ${latestSnapshot.atl ?? 'n/a'} / ${latestSnapshot.tsb ?? 'n/a'}

## Recent Paces
${prText}

## Injuries
${injuriesText}

## Athlete Requirements
${requirements?.trim() ? requirements.trim() : 'No extra requirements provided.'}

## Instructions
- Divide the **active** weeks (${firstActiveWeekNumber}–${totalWeeks}) into logical training phases (e.g. Base, Build 1, Build 2, Taper, Race Week).
- Each phase must have a name, the week numbers it covers, a focus description, and a volume direction (build/hold/reduce).
- For each active week, provide:
  - weekNumber (canonical 1..${totalWeeks}, must be in ${firstActiveWeekNumber}–${totalWeeks})
  - phase name it belongs to
  - weekType: one of "base", "build", "recovery", "peak", "taper", "race", "off-load"
  - volumeTargetKm: realistic weekly running volume target in km
  - intensityLevel: "low", "moderate", or "high"
  - keyWorkouts: 1-3 key workouts for the week (e.g. "Tempo 6km", "Long run 18km", "6x1000m intervals")
  - notes: brief coaching note
- Follow the 3:1 or 2:1 build-to-recovery pattern (every 3-4 build weeks should be followed by a recovery/off-load week).
- Volume should start at or near the athlete's current level (${avgWeeklyKm.toFixed(1)} km) for week ${firstActiveWeekNumber} and progress gradually (cap increases to roughly 8-10% per week).
- Taper should reduce volume by 40-60% over 2-3 weeks leading to race day.
- The last week (week ${totalWeeks}) should be type "race" with reduced volume and a shakeout run.
- If injuries are reported, keep initial volume conservative and note injury precautions.
- Perform a realism check against current baseline and available timeline. If the stated target appears unrealistic, explain why in notes and propose a realistic alternative target with adjusted progression.`;

    console.log(
      `[TrainingBlock] Generating ${forwardWeekCount} forward week outline(s) (canonical ${totalWeeks}-week template)...`,
    );

    logAiTrace(trace, 'create_prompt_built', {
      promptHash: promptHash(prompt),
      totalWeeks,
    });
    const createSchema = buildTrainingBlockOutputSchema(forwardWeekCount);
    const resultObject = await generateObjectWithRetry<TrainingBlockOutputPartial>({
      model,
      schema: createSchema,
      prompt,
      semanticCheck: (candidate) =>
        validateTrainingBlockWeekOutlines(
          candidate.weekOutlines as WeekOutline[],
          totalWeeks,
          firstActiveWeekNumber,
        ),
    });
    specialistTurnsUsed += 1;
    roundCount += 1;
    const stampedWeekOutlines = withStrategyStamp(
      resultObject.weekOutlines,
      resolvedStrategyMode,
      strategyLabel,
      priorityLabel,
      strategyRationale,
    );

    const blockId = crypto.randomUUID();
    const nowMs = Date.now();

    await db.insert(trainingBlocks).values({
      id: blockId,
      athleteId,
      planEnv,
      goalEvent,
      goalDate,
      totalWeeks,
      firstActiveWeekNumber,
      startDate,
      phases: resultObject.phases,
      weekOutlines: stampedWeekOutlines,
      isActive: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    await db
      .update(trainingBlocks)
      .set({isActive: false})
      .where(
        and(
          eq(trainingBlocks.athleteId, athleteId),
          eq(trainingBlocks.planEnv, planEnv),
          ne(trainingBlocks.id, blockId),
          isNull(trainingBlocks.deletedAt),
        ),
      );
    console.log(`[TrainingBlock] Block saved: ${blockId}`);
    console.log(`[TrainingBlock] ========================================\n`);
    logAiTrace(trace, 'request_finished', {
      athleteId,
      model: resolvedModel,
      persona: 'pipeline',
      sessionId: null,
      blockId,
      mode: resolvedMode,
      totalWeeks,
      roundCount,
      specialistTurnsUsed,
      repairTurnsUsed,
      repairApplied,
      collaborationSummary,
      elapsedMs: elapsedMs(),
      inputTokens: null,
      outputTokens: null,
    });

    return NextResponse.json({
      id: blockId,
      athleteId,
      goalEvent,
      goalDate,
      totalWeeks,
      firstActiveWeekNumber,
      startDate,
      phases: resultObject.phases,
      weekOutlines: stampedWeekOutlines,
      isActive: true,
      createdAt: nowMs,
      updatedAt: nowMs,
      risk: riskIntelligence,
      digitalTwin: twinProfile,
      counterfactualRanking,
    }, {headers: {'x-trace-id': trace.traceId}});
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
    console.error('[TrainingBlock] Error:', error);
    if (
      error instanceof Error &&
      error.message === 'ACWR_RISK_OVERRIDE_REQUIRED'
    ) {
      return NextResponse.json(
        createAiErrorPayload(
          'acwr_risk_override_required',
          'High ACWR risk detected (>=1.5). Reduce aggressiveness or retry with riskOverride=true.',
        ),
        {status: 409, headers: {'x-trace-id': trace.traceId}},
      );
    }
    return NextResponse.json(
      createAiErrorPayload(
        'generation_failed',
        'Failed to generate training block',
      ),
      {status: 500, headers: {'x-trace-id': trace.traceId}},
    );
  } finally {
    await releaseGenerationLock(lockKey);
  }
}
