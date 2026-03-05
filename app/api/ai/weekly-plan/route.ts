import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {db} from '@/db';
import {
  activities as activitiesTable,
  userSettings,
  trainingBlocks,
  weeklyPlans,
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
import {formatPace, formatDuration, type UserSettings, type ActivitySummary} from '@/lib/activityModel';
import {buildCoachPipelinePrompt, buildPhysioPipelinePrompt} from '@/lib/weeklyPlanPrompts';
import {
  coachWeekOutputSchema, physioWeekOutputSchema, planMetaSchema, type CoachWeekOutput, type PhysioWeekOutput, type PlanMeta,
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
import {weeklyPlanRequestSchema} from '@/lib/aiRequestSchemas';
import {generateObjectWithRetry} from '@/lib/aiGeneration';
import {
  validateCoachWeekOutput,
  validateCombinedWeekSemantics,
} from '@/lib/planSemanticValidators';
import {createTraceContext, logAiTrace, promptHash} from '@/lib/aiTrace';
import {createAiErrorPayload} from '@/lib/aiErrors';

export const maxDuration = 120;
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
  } = parsedData;

  if (!athleteId) {
    return NextResponse.json(
      createAiErrorPayload('athlete_id_required', 'athleteId required'),
      {status: 400, headers: {'x-trace-id': trace.traceId}},
    );
  }

  const mode = generationMode ?? 'full';
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  const model = getModel(clientModel);
  const resolvedModel =
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
  });

  try {
    // Step 1: Load context
    const [settingsRows, activityRows, planRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.athleteId, athleteId)),
      db
        .select()
        .from(activitiesTable)
        .where(eq(activitiesTable.athleteId, athleteId))
        .orderBy(desc(activitiesTable.date)),
      db
        .select()
        .from(weeklyPlans)
        .where(eq(weeklyPlans.athleteId, athleteId))
        .orderBy(desc(weeklyPlans.createdAt)),
    ]);

    const currentMonday = getCurrentMonday();
    const hasActiveCurrentWeekPlan = planRows.some(
      (plan) => plan.isActive && plan.weekStart === currentMonday,
    );
    const weekStart = weekStartDate
      ?? (hasActiveCurrentWeekPlan ? getNextMonday() : currentMonday);
    const weekEnd = getSunday(weekStart);
    const weekDates = getDatesForWeek(weekStart);

    console.log(`\n[WeeklyPlan] ========== Generating Plan ==========`);
    console.log(`[WeeklyPlan] Athlete: ${athleteId}`);
    console.log(`[WeeklyPlan] Mode: ${mode}`);
    console.log(`[WeeklyPlan] Week: ${weekStart} to ${weekEnd}`);

    const settings = settingsRows[0];
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

    // Recent 4 weeks summary
    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 86400000);
    const recentActivities = allActivities.filter(
      (a) => new Date(a.date) >= fourWeeksAgo,
    );

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
    const resolvedPreset: TrainingStrategyPreset =
      resolvedStrategyMode === 'preset'
        ? strategyPreset ?? defaultPreset
        : strategyRecommendation.strategy;
    const strategyLabel = STRATEGY_PRESET_LABELS[resolvedPreset];
    const strategyDescription = `${describeStrategyPreset(
      resolvedPreset,
    )} ${resolvedStrategyMode === 'auto' ? `Auto-selected rationale: ${strategyRecommendation.rationale}` : ''}`.trim();
    const optimizationPriorityLabel = OPTIMIZATION_PRIORITY_LABELS[resolvedPriority];

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

    // Step 1d: In remaining-days mode, lock past days using completed activities
    let lockedPastByDate = new Map<string, UnifiedSession>();
    let sourcePlanForReplan: typeof weeklyPlans.$inferSelect | null = null;
    let remainingDaysNote: string | null = null;

    if (mode === 'remaining_days') {
      sourcePlanForReplan = sourcePlanId
        ? planRows.find((plan) => plan.id === sourcePlanId) ?? null
        : planRows.find((plan) => plan.weekStart === weekStart && plan.isActive) ?? planRows[0] ?? null;

      if (!sourcePlanForReplan) {
        return NextResponse.json(
          createAiErrorPayload(
            'source_plan_not_found',
            'No source weekly plan found for remaining-days replan',
          ),
          {status: 400, headers: {'x-trace-id': trace.traceId}},
        );
      }

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

    // Step 2: Coach generates running sessions
    console.log(`[WeeklyPlan] Step 2: Coach generateObject...`);
    const generationPreferences = [
      preferences,
      mode === 'remaining_days'
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

    logAiTrace(trace, 'coach_prompt_built', {
      promptHash: promptHash(coachPrompt),
      mode,
    });
    const coachObject = await generateObjectWithRetry<CoachWeekOutput>({
      model,
      schema: coachWeekOutputSchema,
      prompt: coachPrompt,
      semanticCheck: validateCoachWeekOutput,
    });

    const coachSessions = coachObject.sessions;
    console.log(`[WeeklyPlan] Coach produced ${coachSessions.length} sessions`);

    // Step 3: Physio generates complementary sessions
    console.log(`[WeeklyPlan] Step 3: Physio generateObject...`);
    const coachSessionsSummary = coachSessions
      .map((s) => `- ${s.day} (${s.date}): ${s.type} — ${s.description}`)
      .join('\n');

    const physioPrompt = buildPhysioPipelinePrompt({
      athleteName: null,
      weight: settings?.weight ?? null,
      trainingBalance: settings?.trainingBalance ?? null,
      weekStart,
      weekEnd,
      injuries: injuriesText,
      coachSessions: coachSessionsSummary,
      preferences: generationPreferences || null,
      optimizationPriorityLabel,
    });

    logAiTrace(trace, 'physio_prompt_built', {
      promptHash: promptHash(physioPrompt),
      coachSessions: coachSessions.length,
    });
    const physioObject = await generateObjectWithRetry<PhysioWeekOutput>({
      model,
      schema: physioWeekOutputSchema,
      prompt: physioPrompt,
      semanticCheck: (candidate) =>
        validateCombinedWeekSemantics(coachObject, candidate),
    });

    const physioSessions = physioObject.sessions;
    console.log(`[WeeklyPlan] Physio produced ${physioSessions.length} sessions`);

    // Step 4: Merge by date
    const physioByDate = new Map(physioSessions.map((s) => [s.date, s]));

    // Convert nullable fields (null → undefined) for the UnifiedSession interface
    const n2u = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;

    const generatedSessions: UnifiedSession[] = weekDates.map(({day, date}) => {
      const coach = coachSessions.find((s) => s.date === date);
      const physio = physioByDate.get(date);

      const session: UnifiedSession = {day, date};

      if (coach && coach.type !== 'rest') {
        session.run = {
          type: coach.type,
          description: coach.description,
          duration: n2u(coach.duration),
          targetPace: n2u(coach.targetPace),
          targetZone: n2u(coach.targetZone),
          notes: n2u(coach.notes),
        };
      }

      if (physio) {
        session.physio = {
          type: physio.type,
          exercises: physio.exercises.map((e) => ({
            name: e.name,
            sets: n2u(e.sets),
            reps: n2u(e.reps),
            tempo: n2u(e.tempo),
            notes: n2u(e.notes),
          })),
          duration: n2u(physio.duration),
          notes: n2u(physio.notes),
        };
      }

      if (coach?.type === 'rest' && !physio) {
        session.notes = coach.description;
      }

      return session;
    });

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
      if (mode === 'remaining_days' && session.date < todayIso) {
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
          mode === 'remaining_days' && activity && session.date < todayIso
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
    const sessionOverview = unifiedSessions
      .map((s) => {
        const parts = [s.day];
        if (s.run) parts.push(`run: ${s.run.type}`);
        if (s.physio) parts.push(`physio: ${s.physio.type}`);
        if (!s.run && !s.physio) parts.push('rest');
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
      if (s.physio) {
        markdownLines.push(`### Physio: ${s.physio.type}`);
        if (s.physio.duration) markdownLines.push(`Duration: ${s.physio.duration}`);
        markdownLines.push('');
        markdownLines.push('| Exercise | Sets x Reps | Tempo | Notes |');
        markdownLines.push('|----------|-------------|-------|-------|');
        for (const ex of s.physio.exercises) {
          markdownLines.push(
            `| ${ex.name} | ${ex.sets ?? '-'}x${ex.reps ?? '-'} | ${ex.tempo ?? '-'} | ${ex.notes ?? '-'} |`,
          );
        }
        if (s.physio.notes) markdownLines.push(`> ${s.physio.notes}`);
      }
      if (!s.run && !s.physio) {
        markdownLines.push('Rest day');
        if (s.notes) markdownLines.push(s.notes);
      }
      markdownLines.push('');
    }

    const markdownContent = markdownLines.join('\n');
    const encodedPreferences = encodeURIComponent(generationPreferences || '');
    const strategyMetaPayload = encodeURIComponent(
      JSON.stringify({
        mode: resolvedStrategyMode,
        preset: resolvedPreset,
        strategyLabel,
        optimizationPriority: resolvedPriority,
        optimizationPriorityLabel,
        autoRationale:
          resolvedStrategyMode === 'auto'
            ? strategyRecommendation.rationale
            : null,
      }),
    );
    const content = `${PLAN_PREFERENCES_PREFIX}${encodedPreferences}${PLAN_PREFERENCES_SUFFIX}\n${PLAN_STRATEGY_PREFIX}${strategyMetaPayload}${PLAN_STRATEGY_SUFFIX}\n${markdownContent}`;

    // Step 6: Save
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
      mode,
      inputTokens: null,
      outputTokens: null,
    });

    return NextResponse.json({
      id: planId,
      weekStart,
      title: metaObject.title,
      summary: metaObject.summary,
      goal: settings?.goal ?? null,
      sessions: unifiedSessions,
      content,
      blockId: activeBlockId,
      weekNumber: blockWeekNumber,
      mode,
      sourcePlanId: sourcePlanForReplan?.id ?? null,
      createdAt: now2,
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
    console.error('[WeeklyPlan] Error:', error);
    return NextResponse.json(
      createAiErrorPayload('generation_failed', 'Failed to generate weekly plan'),
      {status: 500, headers: {'x-trace-id': trace.traceId}},
    );
  }
}
