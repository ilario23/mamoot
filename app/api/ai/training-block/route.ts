import {generateObject} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {db} from '@/db';
import {
  activities as activitiesTable,
  userSettings,
  trainingBlocks,
} from '@/db/schema';
import {eq, desc, and, ne} from 'drizzle-orm';
import {transformActivity} from '@/lib/strava';
import type {StravaSummaryActivity} from '@/lib/strava';
import {calcFitnessData, calcACWRData} from '@/utils/trainingLoad';
import {formatPace, formatDuration, type UserSettings} from '@/lib/mockData';
import {trainingBlockOutputSchema} from '@/lib/trainingBlockSchema';
import {NextResponse} from 'next/server';

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

export async function POST(req: Request) {
  const body = await req.json();
  const {
    athleteId,
    goalEvent,
    goalDate,
    totalWeeks: clientWeeks,
    model: clientModel,
  }: {
    athleteId: number;
    goalEvent: string;
    goalDate: string;
    totalWeeks?: number;
    model?: string;
  } = body;

  if (!athleteId || !goalEvent || !goalDate) {
    return NextResponse.json(
      {error: 'athleteId, goalEvent, and goalDate required'},
      {status: 400},
    );
  }

  const startDate = getNextMonday();
  const totalWeeks = clientWeeks ?? weeksUntil(startDate, goalDate);
  const model = getModel(clientModel);

  console.log(`\n[TrainingBlock] ========== Generating Block ==========`);
  console.log(`[TrainingBlock] Athlete: ${athleteId}`);
  console.log(`[TrainingBlock] Goal: ${goalEvent} on ${goalDate}`);
  console.log(`[TrainingBlock] Weeks: ${totalWeeks}, starts ${startDate}`);

  try {
    const [settingsRows, activityRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.athleteId, athleteId)),
      db.select().from(activitiesTable).orderBy(desc(activitiesTable.date)),
    ]);

    const settings = settingsRows[0];
    const zonesRaw = settings?.zones as Record<string, [number, number]> | undefined;
    const typedZones = zonesRaw as UserSettings['zones'] | undefined;
    const injuries = settings?.injuries as string[] | undefined;
    const injuriesText = injuries?.length ? injuries.join(', ') : 'None reported';

    const allActivities = activityRows.map((r) =>
      transformActivity(r.data as StravaSummaryActivity),
    );

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
        const latestAcwr = acwrData[acwrData.length - 1];
        if (latestAcwr) {
          acwrText = `\n- ACWR: ${latestAcwr.acwr.toFixed(2)}`;
        }
      } catch { /* non-blocking */ }
    }

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
- Current avg weekly volume: ${avgWeeklyKm.toFixed(1)} km

## Recent Training (last 4 weeks)
${recentTrainingLines || 'No recent training data'}${acwrText}

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

    const result = await generateObject({
      model,
      schema: trainingBlockOutputSchema,
      prompt,
    });

    const blockId = crypto.randomUUID();
    const nowMs = Date.now();

    await db.insert(trainingBlocks).values({
      id: blockId,
      athleteId,
      goalEvent,
      goalDate,
      totalWeeks,
      startDate,
      phases: result.object.phases,
      weekOutlines: result.object.weekOutlines,
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
        ),
      );

    console.log(`[TrainingBlock] Block saved: ${blockId}`);
    console.log(`[TrainingBlock] ========================================\n`);

    return NextResponse.json({
      id: blockId,
      athleteId,
      goalEvent,
      goalDate,
      totalWeeks,
      startDate,
      phases: result.object.phases,
      weekOutlines: result.object.weekOutlines,
      isActive: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  } catch (error) {
    console.error('[TrainingBlock] Error:', error);
    return NextResponse.json(
      {error: 'Failed to generate training block'},
      {status: 500},
    );
  }
}
