import {streamText} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {and, eq, sql} from 'drizzle-orm';
import {db} from '@/db';
import {
  activityDetails as activityDetailsTable,
  activityAiReviews,
  bestEffortsCache,
  userSettings,
} from '@/db/schema';
import type {
  StravaDetailedActivity,
  StravaSplit,
  StravaBestEffort,
  StravaLap,
} from '@/lib/strava';
import type {UserSettings} from '@/lib/activityModel';
import {formatDuration, formatPace} from '@/lib/activityModel';
import {classifyWorkout, formatLabelForAI} from '@/lib/workoutLabel';

export const maxDuration = 60;

type UsagePayload = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type WeatherPayload = {
  source: 'open-meteo-archive';
  latitude: number;
  longitude: number;
  activityStartUtc: string;
  nearestHourUtc: string;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPct: number;
  windMps: number;
  precipitationMm: number;
  heatStress: 'low' | 'moderate' | 'high';
  summary: string;
};

type SixMonthBests = Record<string, number>;

const CHEAP_ACTIVITY_MODELS: Record<
  string,
  {
    provider: 'openai' | 'anthropic';
    create: () => ReturnType<typeof openai | typeof anthropic>;
  }
> = {
  'gpt-5-nano': {provider: 'openai', create: () => openai('gpt-5-nano')},
  'gpt-4.1-nano': {provider: 'openai', create: () => openai('gpt-4.1-nano')},
  'gpt-4o-mini': {provider: 'openai', create: () => openai('gpt-4o-mini')},
  'claude-haiku-3-5': {
    provider: 'anthropic',
    create: () => anthropic('claude-3-5-haiku-latest'),
  },
};

const CHEAP_MODEL_FALLBACK_ORDER = [
  'gpt-5-nano',
  'gpt-4.1-nano',
  'gpt-4o-mini',
] as const;

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
  ].map((distance) => distance.toLowerCase()),
);

const BEST_EFFORT_THRESHOLD = 0.05;

const REPORT_SYSTEM_PROMPT = `You are a running coach assistant producing concise, actionable reviews for runners.

Output markdown with exactly these sections:
## 1) Workout Classification
- Pick ONE: easy, tempo, intervals, long, race, recovery, progression, fartlek
- Add confidence (low/medium/high) and one short reason

## 2) Runner Snapshot
- One compact line with distance, pace, effort zone, and conditions impact

## 3) What Went Well
- 2-3 bullets only, each grounded in concrete split/lap metrics

## 4) What To Improve
- 2-3 bullets only, each with specific evidence (km ranges, HR drift, pace fade, etc.)

## 5) Conditions Context
- Explain how weather likely affected perceived effort, pacing, hydration
- Keep this section to max 2 bullets

## 6) Next Run Actions
- Give exactly 2 actionable items for the next run
- Make them specific and measurable

Rules:
- Keep total response under 220 words
- Use numbers whenever possible
- Do not invent data; if uncertain, say what is missing`;

const isProviderAvailable = (provider: 'openai' | 'anthropic'): boolean => {
  if (provider === 'anthropic') {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }
  return Boolean(process.env.OPENAI_API_KEY);
};

const resolveActivityModel = (requestedModel?: string) => {
  if (
    requestedModel &&
    CHEAP_ACTIVITY_MODELS[requestedModel] &&
    isProviderAvailable(CHEAP_ACTIVITY_MODELS[requestedModel].provider)
  ) {
    return {
      modelId: requestedModel,
      model: CHEAP_ACTIVITY_MODELS[requestedModel].create(),
    };
  }

  const envModel = process.env.AI_MODEL;
  if (
    envModel &&
    CHEAP_ACTIVITY_MODELS[envModel] &&
    isProviderAvailable(CHEAP_ACTIVITY_MODELS[envModel].provider)
  ) {
    return {
      modelId: envModel,
      model: CHEAP_ACTIVITY_MODELS[envModel].create(),
    };
  }

  for (const modelId of CHEAP_MODEL_FALLBACK_ORDER) {
    if (!isProviderAvailable(CHEAP_ACTIVITY_MODELS[modelId].provider)) continue;
    return {modelId, model: CHEAP_ACTIVITY_MODELS[modelId].create()};
  }

  return {modelId: 'gpt-4o-mini', model: openai('gpt-4o-mini')};
};

const parsePositiveInt = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getOrComputeSixMonthBests = async (
  athleteId: number,
): Promise<SixMonthBests> => {
  const [{count: currentCount}] = await db
    .select({count: sql<number>`count(*)::int`})
    .from(activityDetailsTable)
    .where(eq(activityDetailsTable.athleteId, athleteId));

  const cached = await db
    .select()
    .from(bestEffortsCache)
    .where(eq(bestEffortsCache.athleteId, athleteId))
    .limit(1);

  if (cached.length > 0 && cached[0].activityCount === currentCount) {
    return cached[0].bests as SixMonthBests;
  }

  const allDetails = await db
    .select()
    .from(activityDetailsTable)
    .where(eq(activityDetailsTable.athleteId, athleteId));

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const bests: SixMonthBests = {};

  for (const row of allDetails) {
    const detail = row.data as StravaDetailedActivity;
    const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];
    for (const effort of efforts) {
      const nameKey = effort.name.toLowerCase();
      if (!TARGET_DISTANCES.has(nameKey)) continue;
      const effortDate = new Date(effort.start_date_local ?? effort.start_date);
      if (effortDate < sixMonthsAgo) continue;
      const existing = bests[nameKey];
      if (existing === undefined || effort.elapsed_time < existing) {
        bests[nameKey] = effort.elapsed_time;
      }
    }
  }

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

const formatActivityDetail = (
  detail: StravaDetailedActivity,
  zones?: UserSettings['zones'],
  sixMonthBests?: SixMonthBests | null,
): {text: string; ruleBasedLabel: string | null} => {
  const distanceKm = detail.distance / 1000;
  const avgPace =
    distanceKm > 0 && detail.moving_time > 0
      ? detail.moving_time / 60 / distanceKm
      : 0;

  const lines: string[] = [];
  lines.push(
    `Activity: ${detail.name} (${detail.start_date_local.split('T')[0]})`,
  );
  const hrStr = detail.average_heartrate
    ? detail.max_heartrate
      ? `HR ${Math.round(detail.average_heartrate)}/${detail.max_heartrate}`
      : `HR ${Math.round(detail.average_heartrate)}`
    : '';
  lines.push(
    `Distance: ${distanceKm.toFixed(2)} km | Time: ${formatDuration(detail.moving_time)} | Pace: ${formatPace(avgPace)}/km${hrStr ? ` | ${hrStr}` : ''} | Elev +${Math.round(detail.total_elevation_gain)}m`,
  );
  if (detail.calories) lines.push(`Calories: ${detail.calories}`);
  if (detail.gear?.name) lines.push(`Gear: ${detail.gear.name}`);
  if (detail.workout_type === 1) lines.push('Strava Flag: Race');

  const splits = (detail.splits_metric ?? []) as StravaSplit[];
  if (splits.length > 0) {
    lines.push('', 'Per-km Splits:');
    for (const split of splits) {
      const splitPace =
        split.average_speed > 0 ? 1000 / 60 / split.average_speed : 0;
      const splitHr = split.average_heartrate
        ? ` | HR ${Math.round(split.average_heartrate)}`
        : '';
      const splitElev =
        split.elevation_difference !== 0
          ? ` | ${split.elevation_difference > 0 ? '+' : ''}${Math.round(split.elevation_difference)}m`
          : '';
      lines.push(
        `- km ${split.split}: ${formatPace(splitPace)}/km${splitHr}${splitElev}`,
      );
    }
  }

  const efforts = (detail.best_efforts ?? []) as StravaBestEffort[];
  if (efforts.length > 0 && sixMonthBests) {
    const notableLines: string[] = [];
    for (const effort of efforts) {
      const nameKey = effort.name.toLowerCase();
      if (!TARGET_DISTANCES.has(nameKey)) continue;

      if (effort.pr_rank === 1) {
        notableLines.push(
          `- ${effort.name}: ${formatDuration(effort.elapsed_time)} (PR!)`,
        );
        continue;
      }

      const seasonBest = sixMonthBests[nameKey];
      if (seasonBest === undefined) continue;
      const threshold = seasonBest * (1 + BEST_EFFORT_THRESHOLD);
      if (effort.elapsed_time > threshold) continue;
      if (effort.elapsed_time <= seasonBest) {
        notableLines.push(
          `- ${effort.name}: ${formatDuration(effort.elapsed_time)} (season best!)`,
        );
      } else {
        const pctOver = ((effort.elapsed_time - seasonBest) / seasonBest) * 100;
        notableLines.push(
          `- ${effort.name}: ${formatDuration(effort.elapsed_time)} (near season best: +${pctOver.toFixed(1)}%)`,
        );
      }
    }

    if (notableLines.length > 0) {
      lines.push('', 'Best Efforts (notable):', ...notableLines);
    }
  }

  const laps = (detail.laps ?? []) as StravaLap[];
  if (laps.length > 1) {
    lines.push('', 'Laps:');
    for (const lap of laps) {
      const lapDistKm = (lap.distance / 1000).toFixed(1);
      const lapPace = lap.average_speed > 0 ? 1000 / 60 / lap.average_speed : 0;
      const lapHr = lap.average_heartrate
        ? ` HR ${Math.round(lap.average_heartrate)}`
        : '';
      const lapCad = lap.average_cadence ? ` cad ${Math.round(lap.average_cadence)}` : '';
      lines.push(
        `- ${lap.name}: ${lapDistKm}km ${formatPace(lapPace)}/km${lapHr}${lapCad}`,
      );
    }
  }

  let ruleBasedLabel: string | null = null;
  if (zones) {
    const label = classifyWorkout(detail, zones);
    if (label) ruleBasedLabel = formatLabelForAI(label);
  }

  return {text: lines.join('\n'), ruleBasedLabel};
};

const getActivityCoordinates = (
  detail: StravaDetailedActivity,
): {latitude: number; longitude: number} | null => {
  const start = detail.start_latlng;
  if (
    Array.isArray(start) &&
    start.length === 2 &&
    typeof start[0] === 'number' &&
    typeof start[1] === 'number'
  ) {
    return {latitude: start[0], longitude: start[1]};
  }
  const end = detail.end_latlng;
  if (
    Array.isArray(end) &&
    end.length === 2 &&
    typeof end[0] === 'number' &&
    typeof end[1] === 'number'
  ) {
    return {latitude: end[0], longitude: end[1]};
  }
  return null;
};

const toHeatStress = (
  temperatureC: number,
  humidityPct: number,
): WeatherPayload['heatStress'] => {
  if (temperatureC >= 25 && humidityPct >= 70) return 'high';
  if (temperatureC >= 20 || humidityPct >= 70) return 'moderate';
  return 'low';
};

const fetchActivityWeather = async (
  detail: StravaDetailedActivity,
): Promise<WeatherPayload | null> => {
  const coords = getActivityCoordinates(detail);
  if (!coords) return null;

  const activityStart = new Date(detail.start_date ?? detail.start_date_local);
  if (Number.isNaN(activityStart.getTime())) return null;

  const activityDate = activityStart.toISOString().slice(0, 10);
  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}` +
    `&start_date=${activityDate}` +
    `&end_date=${activityDate}` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m` +
    `&timezone=UTC`;

  try {
    const response = await fetch(archiveUrl);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        apparent_temperature?: number[];
        relative_humidity_2m?: number[];
        precipitation?: number[];
        wind_speed_10m?: number[];
      };
    };
    const hourly = payload.hourly;
    if (!hourly?.time || hourly.time.length === 0) return null;

    let nearestIndex = 0;
    let nearestDiff = Number.POSITIVE_INFINITY;
    for (let index = 0; index < hourly.time.length; index++) {
      const sampleTs = Date.parse(`${hourly.time[index]}:00Z`);
      if (Number.isNaN(sampleTs)) continue;
      const diff = Math.abs(sampleTs - activityStart.getTime());
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestIndex = index;
      }
    }

    const temperatureC = hourly.temperature_2m?.[nearestIndex];
    const apparentTemperatureC = hourly.apparent_temperature?.[nearestIndex];
    const humidityPct = hourly.relative_humidity_2m?.[nearestIndex];
    const precipitationMm = hourly.precipitation?.[nearestIndex];
    const windMps = hourly.wind_speed_10m?.[nearestIndex];
    if (
      !Number.isFinite(temperatureC) ||
      !Number.isFinite(apparentTemperatureC) ||
      !Number.isFinite(humidityPct) ||
      !Number.isFinite(precipitationMm) ||
      !Number.isFinite(windMps)
    ) {
      return null;
    }

    const heatStress = toHeatStress(temperatureC, humidityPct);
    const summary = `Weather near start: ${Math.round(temperatureC)}C (feels ${Math.round(apparentTemperatureC)}C), humidity ${Math.round(humidityPct)}%, wind ${windMps.toFixed(1)} m/s, precip ${precipitationMm.toFixed(1)} mm, heat stress ${heatStress}.`;

    return {
      source: 'open-meteo-archive',
      latitude: coords.latitude,
      longitude: coords.longitude,
      activityStartUtc: activityStart.toISOString(),
      nearestHourUtc: `${hourly.time[nearestIndex]}:00Z`,
      temperatureC,
      apparentTemperatureC,
      humidityPct,
      windMps,
      precipitationMm,
      heatStress,
      summary,
    };
  } catch {
    return null;
  }
};

export const GET = async (req: Request) => {
  const {searchParams} = new URL(req.url);
  const athleteId = parsePositiveInt(searchParams.get('athleteId'));
  const activityId = parsePositiveInt(searchParams.get('activityId'));
  const model = searchParams.get('model')?.trim();

  if (!athleteId || !activityId || !model) {
    return new Response(
      JSON.stringify({error: 'athleteId, activityId and model are required'}),
      {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }

  const rows = await db
    .select()
    .from(activityAiReviews)
    .where(
      and(
        eq(activityAiReviews.athleteId, athleteId),
        eq(activityAiReviews.activityId, activityId),
        eq(activityAiReviews.model, model),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return new Response(JSON.stringify({review: null}), {
      headers: {'Content-Type': 'application/json'},
    });
  }

  return new Response(
    JSON.stringify({
      review: {
        athleteId: row.athleteId,
        activityId: row.activityId,
        model: row.model,
        reportText: row.reportText,
        rawDetailText: row.rawDetailText,
        usage: row.usageJson,
        weather: row.weatherJson,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    }),
    {headers: {'Content-Type': 'application/json'}},
  );
};

export const POST = async (req: Request) => {
  const body = (await req.json()) as {
    athleteId?: number;
    activityId?: number;
    model?: string;
  };

  const athleteId =
    typeof body.athleteId === 'number' && body.athleteId > 0
      ? body.athleteId
      : null;
  const activityId =
    typeof body.activityId === 'number' && body.activityId > 0
      ? body.activityId
      : null;
  const requestedModel = body.model?.trim();

  if (!activityId) {
    return new Response(JSON.stringify({error: 'activityId is required'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }
  if (!athleteId) {
    return new Response(JSON.stringify({error: 'athleteId is required'}), {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    });
  }

  const detailRows = await db
    .select()
    .from(activityDetailsTable)
    .where(
      and(
        eq(activityDetailsTable.id, activityId),
        eq(activityDetailsTable.athleteId, athleteId),
      ),
    )
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
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.athleteId, athleteId))
    .limit(1);
  const zones = settingsRows[0]?.zones as UserSettings['zones'] | undefined;
  const sixMonthBests = await getOrComputeSixMonthBests(athleteId);
  const {text: activityText, ruleBasedLabel} = formatActivityDetail(
    detail,
    zones,
    sixMonthBests,
  );

  const weather = await fetchActivityWeather(detail);
  const weatherContext = weather
    ? `\n\nWeather context (activity start):\n${weather.summary}`
    : '\n\nWeather context: unavailable (no reliable coordinates or historical sample).';
  const userMessage =
    `Analyze this run and produce a concise runner-first review.\n\n` +
    `${activityText}${weatherContext}`;

  const selected = resolveActivityModel(requestedModel);
  const result = streamText({
    model: selected.model,
    system: REPORT_SYSTEM_PROMPT,
    messages: [{role: 'user', content: userMessage}],
  });

  const encoder = new TextEncoder();
  const textStream = result.textStream;

  const responseStream = new ReadableStream({
    async start(controller) {
      let reportText = '';
      try {
        controller.enqueue(
          encoder.encode(`__DETAIL__${activityText}__END_DETAIL__`),
        );
        for await (const chunk of textStream) {
          reportText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        const usage = await result.usage;
        const usagePayload: UsagePayload = {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        };
        const now = Date.now();

        await db
          .insert(activityAiReviews)
          .values({
            athleteId,
            activityId,
            model: selected.modelId,
            reportText: reportText.trim(),
            rawDetailText: activityText,
            usageJson: usagePayload,
            weatherJson: weather,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              activityAiReviews.athleteId,
              activityAiReviews.activityId,
              activityAiReviews.model,
            ],
            set: {
              reportText: sql`excluded.report_text`,
              rawDetailText: sql`excluded.raw_detail_text`,
              usageJson: sql`excluded.usage_json`,
              weatherJson: sql`excluded.weather_json`,
              updatedAt: sql`excluded.updated_at`,
            },
          });

        const usageLine = `\n\n__USAGE__${JSON.stringify({
          ...usagePayload,
          model: selected.modelId,
          savedAt: now,
        })}`;
        controller.enqueue(encoder.encode(usageLine));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        controller.enqueue(
          encoder.encode(`\n\n__USAGE__${JSON.stringify({error: message})}`),
        );
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Rule-Based-Label': encodeURIComponent(
        ruleBasedLabel ?? 'N/A (no HR zones configured)',
      ),
      'X-Selected-Model': selected.modelId,
    },
  });
};
