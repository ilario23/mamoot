import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {db} from '@/db';
import {
  activities as activitiesTable,
  userSettings,
  trainingBlocks,
} from '@/db/schema';
import {eq, desc, and, ne, isNull} from 'drizzle-orm';
import {transformActivity} from '@/lib/strava';
import type {StravaSummaryActivity} from '@/lib/strava';
import {
  calcFitnessData,
  calcACWRData,
  calcAdvancedMetricsData,
  getLatestMetricsSnapshot,
} from '@/utils/trainingLoad';
import {formatPace, formatDuration, type UserSettings} from '@/lib/activityModel';
import type {WeekOutline} from '@/lib/cacheTypes';
import {
  trainingBlockOutputSchema,
  type TrainingBlockOutput,
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
import {trainingBlockRequestSchema} from '@/lib/aiRequestSchemas';
import {generateObjectWithRetry} from '@/lib/aiGeneration';
import {validateTrainingBlockWeekOutlines} from '@/lib/planSemanticValidators';
import {createTraceContext, logAiTrace, promptHash} from '@/lib/aiTrace';
import {createAiErrorPayload} from '@/lib/aiErrors';

export const maxDuration = 120;

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

const weeksUntil = (startIso: string, endIso: string): number => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return Math.max(4, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)));
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
    mode?: 'create' | 'adapt';
    goalEvent: string;
    goalDate: string;
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
  };
  const {
    athleteId,
    mode,
    goalEvent,
    goalDate,
    totalWeeks: clientWeeks,
    model: clientModel,
    adaptationType,
    sourceBlockId,
    effectiveFromWeek,
    event,
    strategySelectionMode,
    strategyPreset,
    optimizationPriority,
  } = parsedData;

  if (!athleteId) {
    return NextResponse.json(
      createAiErrorPayload('athlete_id_required', 'athleteId required'),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
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

  console.log(`\n[TrainingBlock] ========== Generating Block ==========`);
  console.log(`[TrainingBlock] Athlete: ${athleteId}`);
  console.log(`[TrainingBlock] Mode: ${resolvedMode}`);

  try {
    if (resolvedMode === 'adapt') {
      const sourceRows = sourceBlockId
        ? await db
            .select()
            .from(trainingBlocks)
            .where(
              and(
                eq(trainingBlocks.id, sourceBlockId),
                eq(trainingBlocks.athleteId, athleteId),
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

      const [settingsRows, activityRows] = await Promise.all([
        db.select().from(userSettings).where(eq(userSettings.athleteId, athleteId)),
        db
          .select()
          .from(activitiesTable)
          .where(eq(activitiesTable.athleteId, athleteId))
          .orderBy(desc(activitiesTable.date)),
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
      const now = new Date();
      const start = new Date(startDate);
      const currentWeek = Math.max(
        1,
        Math.min(
          sourceBlock.totalWeeks,
          Math.ceil((now.getTime() - start.getTime()) / (7 * 86400000)),
        ),
      );
      const effectiveWeek = Math.max(1, effectiveFromWeek ?? currentWeek);
      const eventPriority = event?.priority ?? 'B';

      const recentActivities = allActivities.filter((a) => {
        const d = new Date(a.date);
        return d >= new Date(now.getTime() - 28 * 86400000);
      });
      const recentVolume = recentActivities.reduce((sum, a) => sum + a.distance, 0);
      const avgWeeklyVolume = recentVolume > 0 ? recentVolume / 4 : 0;
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
        priority: resolvedPriority,
      });
      const resolvedPreset: TrainingStrategyPreset =
        resolvedStrategyMode === 'preset'
          ? strategyPreset ?? defaultPreset
          : strategyRecommendation.strategy;
      const strategyLabel = STRATEGY_PRESET_LABELS[resolvedPreset];
      const strategyDescription = `${describeStrategyPreset(
        resolvedPreset,
      )} ${resolvedStrategyMode === 'auto' ? `Auto-selected rationale: ${strategyRecommendation.rationale}` : ''}`.trim();
      const priorityLabel = OPTIMIZATION_PRIORITY_LABELS[resolvedPriority];
      const strategyRationale =
        resolvedStrategyMode === 'auto' ? strategyRecommendation.rationale : null;

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

## Existing Block (source of truth for past weeks)
- Goal Event: ${sourceBlock.goalEvent}
- Goal Date: ${sourceBlock.goalDate}
- Total Weeks: ${sourceBlock.totalWeeks}
- Start Date: ${sourceBlock.startDate}
- Current Week: ${currentWeek}
- Avg weekly volume (last 4 weeks): ${avgWeeklyVolume.toFixed(1)} km
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
- Return full block output for all weeks (week numbers remain 1..${sourceBlock.totalWeeks}).
- Keep exactly ${sourceBlock.totalWeeks} week outlines.`;

      logAiTrace(trace, 'adapt_prompt_built', {
        promptHash: promptHash(adaptationPrompt),
        totalWeeks: sourceBlock.totalWeeks,
      });
      const adaptedObject = await generateObjectWithRetry<TrainingBlockOutput>({
        model,
        schema: trainingBlockOutputSchema,
        prompt: adaptationPrompt,
        semanticCheck: (candidate) =>
          validateTrainingBlockWeekOutlines(
            candidate.weekOutlines as WeekOutline[],
            sourceBlock.totalWeeks,
          ),
      });
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
        goalEvent: resolvedGoalEvent,
        goalDate: resolvedGoalDate,
        totalWeeks: sourceBlock.totalWeeks,
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
        inputTokens: null,
        outputTokens: null,
      });
      return NextResponse.json({
        id: blockId,
        athleteId,
        goalEvent: resolvedGoalEvent,
        goalDate: resolvedGoalDate,
        totalWeeks: sourceBlock.totalWeeks,
        startDate,
        phases: adaptedObject.phases,
        weekOutlines: stampedWeekOutlines,
        isActive: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      }, {headers: {'x-trace-id': trace.traceId}});
    }

    const startDate = getNextMonday();
    const totalWeeks = clientWeeks ?? weeksUntil(startDate, goalDate);
    console.log(`[TrainingBlock] Goal: ${goalEvent} on ${goalDate}`);
    console.log(`[TrainingBlock] Weeks: ${totalWeeks}, starts ${startDate}`);

    const [settingsRows, activityRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.athleteId, athleteId)),
      db
        .select()
        .from(activitiesTable)
        .where(eq(activitiesTable.athleteId, athleteId))
        .orderBy(desc(activitiesTable.date)),
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

    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);
    const recentActivities = allActivities.filter(
      (a) => new Date(a.date) >= fourWeeksAgo,
    );

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
    const strategyRecommendation = recommendStrategy({
      acwr: latestSnapshot.acwr,
      tsb: latestSnapshot.tsb,
      monotony: latestSnapshot.monotony,
      goal: (settings?.goal as string | null | undefined) ?? null,
      priority: resolvedPriority,
    });
    const resolvedPreset: TrainingStrategyPreset =
      resolvedStrategyMode === 'preset'
        ? strategyPreset ?? defaultPreset
        : strategyRecommendation.strategy;
    const strategyLabel = STRATEGY_PRESET_LABELS[resolvedPreset];
    const strategyDescription = `${describeStrategyPreset(
      resolvedPreset,
    )} ${resolvedStrategyMode === 'auto' ? `Auto-selected rationale: ${strategyRecommendation.rationale}` : ''}`.trim();
    const priorityLabel = OPTIMIZATION_PRIORITY_LABELS[resolvedPriority];
    const strategyRationale =
      resolvedStrategyMode === 'auto' ? strategyRecommendation.rationale : null;

    let prText = 'No personal records available';
    const runActivities = recentActivities
      .filter((a) => a.type === 'Run' && a.distance > 0 && a.duration > 0)
      .slice(0, 5);
    if (runActivities.length > 0) {
      prText = runActivities
        .map((a) => `- ${a.distance.toFixed(1)} km at ${formatPace(a.avgPace)} (${formatDuration(a.duration)})`)
        .join('\n');
    }

    const prompt = `You are an expert running coach specializing in periodized training. Generate a ${totalWeeks}-week training block for the following athlete and goal.

## Goal
- Event: ${goalEvent}
- Event Date: ${goalDate}
- Block Start: ${startDate} (next Monday)
- Total Weeks: ${totalWeeks}

## Athlete
${settings?.weight ? `- Weight: ${settings.weight} kg` : ''}
${settings?.trainingBalance != null ? `- Training Balance: ${settings.trainingBalance}/80 (20=run-focused, 80=gym-focused)` : ''}
- Strategy to follow: ${strategyLabel}
- Strategy intent: ${strategyDescription}
- Optimization priority: ${priorityLabel}
- Current avg weekly volume: ${avgWeeklyKm.toFixed(1)} km

## Recent Training (last 4 weeks)
${recentTrainingLines || 'No recent training data'}${acwrText}
- Current CTL/ATL/TSB: ${latestSnapshot.ctl ?? 'n/a'} / ${latestSnapshot.atl ?? 'n/a'} / ${latestSnapshot.tsb ?? 'n/a'}

## Recent Paces
${prText}

## Injuries
${injuriesText}

## Instructions
- Divide the ${totalWeeks} weeks into logical training phases (e.g. Base, Build 1, Build 2, Taper, Race Week).
- Each phase must have a name, the week numbers it covers, a focus description, and a volume direction (build/hold/reduce).
- For each week, provide:
  - weekNumber (1-indexed)
  - phase name it belongs to
  - weekType: one of "base", "build", "recovery", "peak", "taper", "race", "off-load"
  - volumeTargetKm: realistic weekly running volume target in km
  - intensityLevel: "low", "moderate", or "high"
  - keyWorkouts: 1-3 key workouts for the week (e.g. "Tempo 6km", "Long run 18km", "6x1000m intervals")
  - notes: brief coaching note
- Follow the 3:1 or 2:1 build-to-recovery pattern (every 3-4 build weeks should be followed by a recovery/off-load week).
- Volume should start at or near the athlete's current level (${avgWeeklyKm.toFixed(1)} km) and progress gradually (max ~10% increase per build week).
- Taper should reduce volume by 40-60% over 2-3 weeks leading to race day.
- The last week should be type "race" with reduced volume and a shakeout run.
- If injuries are reported, keep initial volume conservative and note injury precautions.`;

    console.log(`[TrainingBlock] Generating with ${totalWeeks} weeks...`);

    logAiTrace(trace, 'create_prompt_built', {
      promptHash: promptHash(prompt),
      totalWeeks,
    });
    const resultObject = await generateObjectWithRetry<TrainingBlockOutput>({
      model,
      schema: trainingBlockOutputSchema,
      prompt,
      semanticCheck: (candidate) =>
        validateTrainingBlockWeekOutlines(
          candidate.weekOutlines as WeekOutline[],
          totalWeeks,
        ),
    });
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
      goalEvent,
      goalDate,
      totalWeeks,
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
      inputTokens: null,
      outputTokens: null,
    });

    return NextResponse.json({
      id: blockId,
      athleteId,
      goalEvent,
      goalDate,
      totalWeeks,
      startDate,
      phases: resultObject.phases,
      weekOutlines: stampedWeekOutlines,
      isActive: true,
      createdAt: nowMs,
      updatedAt: nowMs,
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
    return NextResponse.json(
      createAiErrorPayload(
        'generation_failed',
        'Failed to generate training block',
      ),
      {status: 500, headers: {'x-trace-id': trace.traceId}},
    );
  }
}
