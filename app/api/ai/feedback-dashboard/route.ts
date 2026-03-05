import {NextResponse} from 'next/server';
import {and, eq, gte} from 'drizzle-orm';
import {db} from '@/db';
import {chatMessageFeedback} from '@/db/schema';

type DashboardBucket = {
  key: string;
  total: number;
  negative: number;
  negativeRatio: number;
};

type FeedbackRow = {
  createdAt: number;
  rating: string;
  reason: string | null;
  persona: string;
  route: string | null;
  model: string | null;
};

const UNKNOWN_LABEL = '(unknown)';
const DAY_MS = 86_400_000;

const toRatio = (negative: number, total: number): number =>
  total > 0 ? Number((negative / total).toFixed(4)) : 0;

const isNegative = (rating: string): boolean => rating === 'not_helpful';

const bucketize = (
  rows: FeedbackRow[],
  keyOf: (row: FeedbackRow) => string | null | undefined,
): DashboardBucket[] => {
  const map = new Map<string, {total: number; negative: number}>();
  for (const row of rows) {
    const raw = keyOf(row);
    const key = raw && raw.trim().length > 0 ? raw : UNKNOWN_LABEL;
    const current = map.get(key) ?? {total: 0, negative: 0};
    current.total += 1;
    if (isNegative(row.rating)) current.negative += 1;
    map.set(key, current);
  }
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      total: value.total,
      negative: value.negative,
      negativeRatio: toRatio(value.negative, value.total),
    }))
    .sort((a, b) => b.total - a.total);
};

const dailySeries = (rows: FeedbackRow[]) => {
  const map = new Map<string, {total: number; negative: number}>();
  for (const row of rows) {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    const current = map.get(day) ?? {total: 0, negative: 0};
    current.total += 1;
    if (isNegative(row.rating)) current.negative += 1;
    map.set(day, current);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      total: value.total,
      negative: value.negative,
      negativeRatio: toRatio(value.negative, value.total),
    }));
};

const bucketToStats = (
  rows: FeedbackRow[],
  keyOf: (row: FeedbackRow) => string | null | undefined,
) => {
  const map = new Map<string, {total: number; negative: number}>();
  for (const row of rows) {
    const raw = keyOf(row);
    const key = raw && raw.trim().length > 0 ? raw : UNKNOWN_LABEL;
    const current = map.get(key) ?? {total: 0, negative: 0};
    current.total += 1;
    if (isNegative(row.rating)) current.negative += 1;
    map.set(key, current);
  }
  return map;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const athleteId = Number(url.searchParams.get('athleteId'));
  const days = Math.max(7, Number(url.searchParams.get('days') ?? 30));
  const personaFilter = url.searchParams.get('persona');
  const routeFilter = url.searchParams.get('route');
  const modelFilter = url.searchParams.get('model');

  if (!Number.isFinite(athleteId) || athleteId <= 0) {
    return NextResponse.json(
      {error: 'athleteId query param is required'},
      {status: 400},
    );
  }

  const now = Date.now();
  const currentSince = now - days * DAY_MS;
  const previousSince = currentSince - days * DAY_MS;

  const currentFilters = [
    eq(chatMessageFeedback.athleteId, athleteId),
    gte(chatMessageFeedback.createdAt, currentSince),
  ];
  if (personaFilter) currentFilters.push(eq(chatMessageFeedback.persona, personaFilter));
  if (routeFilter) currentFilters.push(eq(chatMessageFeedback.route, routeFilter));
  if (modelFilter) currentFilters.push(eq(chatMessageFeedback.model, modelFilter));

  const previousFilters = [
    eq(chatMessageFeedback.athleteId, athleteId),
    gte(chatMessageFeedback.createdAt, previousSince),
  ];
  if (personaFilter) previousFilters.push(eq(chatMessageFeedback.persona, personaFilter));
  if (routeFilter) previousFilters.push(eq(chatMessageFeedback.route, routeFilter));
  if (modelFilter) previousFilters.push(eq(chatMessageFeedback.model, modelFilter));

  const [currentRows, twoWindowRows] = await Promise.all([
    db
      .select({
        createdAt: chatMessageFeedback.createdAt,
        rating: chatMessageFeedback.rating,
        reason: chatMessageFeedback.reason,
        persona: chatMessageFeedback.persona,
        route: chatMessageFeedback.route,
        model: chatMessageFeedback.model,
      })
      .from(chatMessageFeedback)
      .where(and(...currentFilters)),
    db
      .select({
        createdAt: chatMessageFeedback.createdAt,
        rating: chatMessageFeedback.rating,
        reason: chatMessageFeedback.reason,
        persona: chatMessageFeedback.persona,
        route: chatMessageFeedback.route,
        model: chatMessageFeedback.model,
      })
      .from(chatMessageFeedback)
      .where(and(...previousFilters)),
  ]);

  const current = currentRows as FeedbackRow[];
  const twoWindows = twoWindowRows as FeedbackRow[];
  const previous = twoWindows.filter((row) => row.createdAt < currentSince);

  const totalFeedback = current.length;
  const negativeCount = current.filter((row) => isNegative(row.rating)).length;

  const byPersona = bucketize(current, (row) => row.persona);
  const byRoute = bucketize(current, (row) => row.route);
  const byReason = bucketize(
    current.filter((row) => row.reason !== null),
    (row) => row.reason,
  );
  const byModel = bucketize(current, (row) => row.model);

  const currentStats = {
    persona: bucketToStats(current, (row) => row.persona),
    route: bucketToStats(current, (row) => row.route),
    reason: bucketToStats(
      current.filter((row) => row.reason !== null),
      (row) => row.reason,
    ),
    model: bucketToStats(current, (row) => row.model),
  };
  const previousStats = {
    persona: bucketToStats(previous, (row) => row.persona),
    route: bucketToStats(previous, (row) => row.route),
    reason: bucketToStats(
      previous.filter((row) => row.reason !== null),
      (row) => row.reason,
    ),
    model: bucketToStats(previous, (row) => row.model),
  };

  const topRegressions: Array<{
    dimension: 'persona' | 'route' | 'reason' | 'model';
    key: string;
    currentNegativeRatio: number;
    previousNegativeRatio: number;
    delta: number;
    currentTotal: number;
    previousTotal: number;
  }> = [];

  (['persona', 'route', 'reason', 'model'] as const).forEach((dimension) => {
    const currentMap = currentStats[dimension];
    const previousMap = previousStats[dimension];
    const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
    for (const key of keys) {
      const currentEntry = currentMap.get(key) ?? {total: 0, negative: 0};
      const previousEntry = previousMap.get(key) ?? {total: 0, negative: 0};

      // Ignore near-empty slices to reduce noise.
      if (currentEntry.total < 3 && previousEntry.total < 3) continue;

      const currentRatio = toRatio(currentEntry.negative, currentEntry.total);
      const previousRatio = toRatio(previousEntry.negative, previousEntry.total);
      const delta = Number((currentRatio - previousRatio).toFixed(4));
      if (delta <= 0) continue;

      topRegressions.push({
        dimension,
        key,
        currentNegativeRatio: currentRatio,
        previousNegativeRatio: previousRatio,
        delta,
        currentTotal: currentEntry.total,
        previousTotal: previousEntry.total,
      });
    }
  });

  topRegressions.sort((a, b) => b.delta - a.delta);

  return NextResponse.json({
    filters: {
      athleteId,
      days,
      persona: personaFilter,
      route: routeFilter,
      model: modelFilter,
    },
    summary: {
      totalFeedback,
      negativeCount,
      negativeRatio: toRatio(negativeCount, totalFeedback),
    },
    series: dailySeries(current),
    byPersona,
    byRoute,
    byReason,
    byModel,
    topRegressions: topRegressions.slice(0, 8),
  });
}
