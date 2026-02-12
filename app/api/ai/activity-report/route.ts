// ============================================================
// AI Activity Report — Dev endpoint for structured coach reports
// ============================================================
//
// POST /api/ai/activity-report
// Body: { activityId: number, model: string, athleteId: number }
//
// Fetches detailed activity data from Neon, formats it into a
// text block, runs the rule-based classifyWorkout for comparison,
// then streams an LLM-generated structured coach report.

import {streamText} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {db} from '@/db';
import {
  activityDetails as activityDetailsTable,
  bestEffortsCache,
  userSettings,
} from '@/db/schema';
import {eq, sql} from 'drizzle-orm';
import type {
  StravaDetailedActivity,
  StravaSplit,
  StravaBestEffort,
  StravaLap,
} from '@/lib/strava';
import type {UserSettings} from '@/lib/mockData';
import {formatPace, formatDuration} from '@/lib/mockData';
import {classifyWorkout, formatLabelForAI} from '@/lib/workoutLabel';

export const maxDuration = 60;

// ----- Allowed models (same whitelist as chat route) -----

const ALLOWED_MODELS: Record<
  string,
  () => ReturnType<typeof openai | typeof anthropic>
> = {
  'gpt-4o-mini': () => openai('gpt-4o-mini'),
  'gpt-4o': () => openai('gpt-4o'),
  'gpt-4.1-mini': () => openai('gpt-4.1-mini'),
  'gpt-4.1': () => openai('gpt-4.1'),
  'gpt-4.1-nano': () => openai('gpt-4.1-nano'),
  'gpt-5-mini': () => openai('gpt-5-mini'),
  'claude-sonnet-4-5': () => anthropic('claude-sonnet-4-5'),
  'claude-haiku-3-5': () => anthropic('claude-3-5-haiku-latest'),
};

const getModel = (clientModel?: string) => {
  if (clientModel && ALLOWED_MODELS[clientModel]) {
    return ALLOWED_MODELS[clientModel]();
  }
  const provider = process.env.AI_PROVIDER ?? 'openai';
  const modelOverride = process.env.AI_MODEL;
  if (provider === 'anthropic') {
    return anthropic(modelOverride ?? 'claude-sonnet-4-5');
  }
  return openai(modelOverride ?? 'gpt-4o-mini');
};

// ----- 6-month best efforts cache -----

/** Standard distances to track (same set used when formatting best efforts) */
const TARGET_DISTANCES = new Set(
  [
    '400m',
    '1/2 mile',
    '1k',
    '1 mile',
    '2 mile',
    '5k',
    '10k',
    '15k',
    '20k',
    'half-marathon',
  ].map((d) => d.toLowerCase()),
);

/** Threshold: include effort if within 5% of the 6-month best */
const BEST_EFFORT_THRESHOLD = 0.05;

type SixMonthBests = Record<string, number>;

/**
 * Fetch or compute the athlete's 6-month personal bests per standard distance.
 * Results are cached in `best_efforts_cache` and invalidated when the total
 * activity_details row count changes (new sync or deletion).
 */
const getOrComputeSixMonthBests = async (
  athleteId: number,
): Promise<SixMonthBests> => {
  // Current total count of activity_details rows
  const [{count: currentCount}] = await db
    .select({count: sql<number>`count(*)::int`})
    .from(activityDetailsTable);

  // Check cache
  const cached = await db
    .select()
    .from(bestEffortsCache)
    .where(eq(bestEffortsCache.athleteId, athleteId))
    .limit(1);

  if (cached.length > 0 && cached[0].activityCount === currentCount) {
    return cached[0].bests as SixMonthBests;
  }

  // Compute: fetch all activity details and scan best_efforts
  const allDetails = await db.select().from(activityDetailsTable);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const bests: SixMonthBests = {};

  for (const row of allDetails) {
    const detail = row.data as StravaDetailedActivity;
    const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];

    for (const e of efforts) {
      const nameKey = e.name.toLowerCase();
      if (!TARGET_DISTANCES.has(nameKey)) continue;

      // Filter to last 6 months using the effort's start_date_local
      const effortDate = new Date(e.start_date_local ?? e.start_date);
      if (effortDate < sixMonthsAgo) continue;

      const existing = bests[nameKey];
      if (existing === undefined || e.elapsed_time < existing) {
        bests[nameKey] = e.elapsed_time;
      }
    }
  }

  // Upsert cache
  await db
    .insert(bestEffortsCache)
    .values({
      athleteId,
      bests,
      activityCount: currentCount,
      computedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: bestEffortsCache.athleteId,
      set: {
        bests,
        activityCount: currentCount,
        computedAt: Date.now(),
      },
    });

  return bests;
};

// ----- Format activity detail into text (mirrors getActivityDetail tool) -----

const formatActivityDetail = (
  detail: StravaDetailedActivity,
  zones?: UserSettings['zones'],
  sixMonthBests?: SixMonthBests | null,
): {text: string; ruleBasedLabel: string | null} => {
  const distKm = detail.distance / 1000;
  const avgPace =
    distKm > 0 && detail.moving_time > 0 ? detail.moving_time / 60 / distKm : 0;

  const lines: string[] = [];

  // Header
  lines.push(
    `Activity: ${detail.name} (${detail.start_date_local.split('T')[0]})`,
  );
  const hrStr = detail.average_heartrate
    ? detail.max_heartrate
      ? `HR ${Math.round(detail.average_heartrate)}/${detail.max_heartrate}`
      : `HR ${Math.round(detail.average_heartrate)}`
    : '';
  lines.push(
    `Distance: ${distKm.toFixed(2)} km | Time: ${formatDuration(detail.moving_time)} | Pace: ${formatPace(avgPace)}/km${hrStr ? ` | ${hrStr}` : ''} | Elev +${Math.round(detail.total_elevation_gain)}m`,
  );
  if (detail.calories) {
    lines.push(`Calories: ${detail.calories}`);
  }

  // Gear
  if (detail.gear?.name) {
    lines.push(`Gear: ${detail.gear.name}`);
  }

  // Strava workout_type flag
  if (detail.workout_type === 1) {
    lines.push('Strava Flag: Race');
  }

  // Per-km splits
  const splits = (detail.splits_metric ?? []) as StravaSplit[];
  if (splits.length > 0) {
    lines.push('');
    lines.push('Per-km Splits:');
    for (const s of splits) {
      const splitPace = s.average_speed > 0 ? 1000 / 60 / s.average_speed : 0;
      const splitHr = s.average_heartrate
        ? ` | HR ${Math.round(s.average_heartrate)}`
        : '';
      const splitElev =
        s.elevation_difference !== 0
          ? ` | ${s.elevation_difference > 0 ? '+' : ''}${Math.round(s.elevation_difference)}m`
          : '';
      lines.push(
        `- km ${s.split}: ${formatPace(splitPace)}/km${splitHr}${splitElev}`,
      );
    }
  }

  // Best efforts — only included when close to the athlete's 6-month bests
  const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];
  if (efforts.length > 0 && sixMonthBests) {
    const candidateEfforts = efforts.filter((e) =>
      TARGET_DISTANCES.has(e.name.toLowerCase()),
    );

    const notableLines: string[] = [];
    for (const e of candidateEfforts) {
      const nameKey = e.name.toLowerCase();
      const seasonBest = sixMonthBests[nameKey];

      // Always include all-time PRs
      if (e.pr_rank === 1) {
        notableLines.push(
          `- ${e.name}: ${formatDuration(e.elapsed_time)} (PR!)`,
        );
        continue;
      }

      // Skip if no 6-month reference for this distance
      if (seasonBest === undefined) continue;

      // Include if within the 5% threshold of the 6-month best
      const threshold = seasonBest * (1 + BEST_EFFORT_THRESHOLD);
      if (e.elapsed_time > threshold) continue;

      if (e.elapsed_time <= seasonBest) {
        notableLines.push(
          `- ${e.name}: ${formatDuration(e.elapsed_time)} (season best!)`,
        );
      } else {
        const pctOver =
          ((e.elapsed_time - seasonBest) / seasonBest) * 100;
        notableLines.push(
          `- ${e.name}: ${formatDuration(e.elapsed_time)} (near season best: +${pctOver.toFixed(1)}%)`,
        );
      }
    }

    if (notableLines.length > 0) {
      lines.push('');
      lines.push('Best Efforts (notable):');
      lines.push(...notableLines);
    }
  }

  // Laps
  const laps = (detail.laps ?? []) as StravaLap[];
  if (laps.length > 1) {
    lines.push('');
    lines.push('Laps:');
    for (const lap of laps) {
      const lapDistKm = (lap.distance / 1000).toFixed(1);
      const lapPace = lap.average_speed > 0 ? 1000 / 60 / lap.average_speed : 0;
      const lapHr = lap.average_heartrate
        ? ` HR ${Math.round(lap.average_heartrate)}`
        : '';
      const lapCad = lap.average_cadence
        ? ` cad ${Math.round(lap.average_cadence)}`
        : '';
      lines.push(
        `- ${lap.name}: ${lapDistKm}km ${formatPace(lapPace)}/km${lapHr}${lapCad}`,
      );
    }
  }

  // Rule-based label for comparison
  let ruleBasedLabel: string | null = null;
  if (zones) {
    const label = classifyWorkout(detail, zones);
    if (label) {
      ruleBasedLabel = formatLabelForAI(label);
    }
  }

  return {text: lines.join('\n'), ruleBasedLabel};
};

// ----- System prompt for structured activity reports -----

const REPORT_SYSTEM_PROMPT = `You are a running coach assistant. Your job is to analyze raw activity data and produce a structured report that a human coach can quickly scan.

Given the raw activity data (per-km splits, laps, best efforts), produce a structured analysis with the following sections:

## 1. Classification
Classify this workout into exactly ONE of these categories:
- easy, tempo, intervals, long, race, recovery, progression, fartlek

## 2. One-line Summary
A single compact line in this exact format:
"[Category]: [key detail] @ [pace]/km Z[zone]"
Examples:
- "Intervals: 5x1000m @ 4:10/km Z4"
- "Tempo: 25min @ 4:15/km Z4"
- "Easy: 8.2km @ 5:30/km Z2"
- "Long Run: 21.1km @ 5:05/km Z2"
- "Progression: 10.0km 5:20 -> 4:30/km"

## 3. Phases
Break the activity into phases. For each phase, state:
- Phase name (Warm-up / Main Work / Cool-down)
- Km range (e.g., km 1-3)
- Average pace
- Average HR
- Dominant HR zone

## 4. Intervals (only if applicable)
If the workout contains intervals, detect:
- Number of reps
- Distance per rep (round to nearest common value: 200, 400, 600, 800, 1000, 1200, 1500, 2000m)
- Average rep pace and HR zone
- Average recovery pace

## 5. Notable Observations
Any coaching-relevant observations:
- PRs set during this activity
- Cardiac drift (HR creeping up at same pace)
- Pacing issues (positive/negative splits)
- Unusually high/low HR for the pace

Be precise with numbers. Reference specific km splits when making observations. Keep the report concise — a coach should be able to read it in 30 seconds.`;

// ----- Route handler -----

export const POST = async (req: Request) => {
  const body = await req.json();
  const {
    activityId,
    model: clientModel,
    athleteId,
  }: {
    activityId: number;
    model?: string;
    athleteId?: number;
  } = body;

  if (!activityId) {
    return new Response(JSON.stringify({error: 'activityId is required'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  // Fetch activity detail from Neon
  const detailRows = await db
    .select()
    .from(activityDetailsTable)
    .where(eq(activityDetailsTable.id, activityId))
    .limit(1);

  if (detailRows.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'Activity detail not found. It may not have been synced yet.',
      }),
      {status: 404, headers: {'Content-Type': 'application/json'}},
    );
  }

  const detail = detailRows[0].data as StravaDetailedActivity;

  // Fetch user settings for HR zones (needed for rule-based comparison)
  let zones: UserSettings['zones'] | undefined;
  if (athleteId) {
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.athleteId, athleteId));
    const s = settingsRows[0];
    if (s) {
      zones = s.zones as UserSettings['zones'];
    }
  }

  // Fetch (or compute & cache) 6-month best efforts for the athlete
  let sixMonthBests: SixMonthBests | null = null;
  if (athleteId) {
    sixMonthBests = await getOrComputeSixMonthBests(athleteId);
  }

  // Format the activity data
  const {text: activityText, ruleBasedLabel} = formatActivityDetail(
    detail,
    zones,
    sixMonthBests,
  );

  // Build the user message with activity data
  const userMessage = `Analyze this activity and produce a structured coach report:\n\n${activityText}`;

  // Stream the response
  const result = streamText({
    model: getModel(clientModel),
    system: REPORT_SYSTEM_PROMPT,
    messages: [{role: 'user', content: userMessage}],
  });

  // Create a custom stream that appends token usage at the end
  const textStream = result.textStream;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send the activity detail (tool call data) as a sentinel prefix
      controller.enqueue(
        encoder.encode(`__DETAIL__${activityText}__END_DETAIL__`),
      );
      // Stream text chunks
      for await (const chunk of textStream) {
        controller.enqueue(encoder.encode(chunk));
      }
      // Await final usage and append as a sentinel line
      const usage = await result.usage;
      const usageLine = `\n\n__USAGE__${JSON.stringify({
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      })}`;
      controller.enqueue(encoder.encode(usageLine));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Rule-Based-Label': encodeURIComponent(
        ruleBasedLabel ?? 'N/A (no HR zones configured)',
      ),
    },
  });
};
