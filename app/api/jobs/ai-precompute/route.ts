import {NextRequest, NextResponse} from 'next/server';
import {and, desc, eq, inArray, sql} from 'drizzle-orm';
import {db} from '@/db';
import {
  activities,
  activityDetails,
  activityLabels,
  userSettings,
  weeklyZoneRollups,
  zoneBreakdowns,
} from '@/db/schema';
import {classifyWorkout, type WorkoutLabel} from '@/lib/workoutLabel';
import type {StravaDetailedActivity} from '@/lib/strava';
import type {UserSettings} from '@/lib/activityModel';
import {getMondayIsoForDate} from '@/lib/weekTime';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-jobs-api-key');
  if (!process.env.JOBS_API_KEY || apiKey !== process.env.JOBS_API_KEY) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const body = (await req.json().catch(() => ({}))) as {
    athleteId?: number;
    latestActivities?: number;
    weeksBack?: number;
  };
  const athleteId = body.athleteId;
  if (!athleteId) {
    return NextResponse.json({error: 'athleteId required'}, {status: 400});
  }

  const latestActivities = Math.max(10, Math.min(body.latestActivities ?? 80, 300));
  const weeksBack = Math.max(2, Math.min(body.weeksBack ?? 10, 24));

  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.athleteId, athleteId))
    .limit(1);
  const settings = settingsRows[0];
  const zones = settings?.zones as UserSettings['zones'] | undefined;

  const recentRows = await db
    .select({id: activities.id, date: activities.date})
    .from(activities)
    .where(eq(activities.athleteId, athleteId))
    .orderBy(desc(activities.date))
    .limit(latestActivities);

  const activityIds = recentRows.map((row) => row.id);
  let labelsComputed = 0;
  if (zones && activityIds.length > 0) {
    const existing = await db
      .select({id: activityLabels.id})
      .from(activityLabels)
      .where(
        and(
          eq(activityLabels.athleteId, athleteId),
          inArray(activityLabels.id, activityIds),
        ),
      );
    const existingIds = new Set(existing.map((row) => row.id));
    const missingIds = activityIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      const details = await db
        .select()
        .from(activityDetails)
        .where(
          and(
            eq(activityDetails.athleteId, athleteId),
            inArray(activityDetails.id, missingIds),
          ),
        );
      const toInsert: Array<{
        id: number;
        athleteId: number;
        data: WorkoutLabel;
        computedAt: number;
      }> = [];
      const now = Date.now();
      for (const row of details) {
        const label = classifyWorkout(row.data as StravaDetailedActivity, zones);
        if (!label) continue;
        toInsert.push({
          id: row.id,
          athleteId,
          data: label,
          computedAt: now,
        });
      }
      if (toInsert.length > 0) {
        await db.insert(activityLabels).values(toInsert).onConflictDoNothing();
        labelsComputed = toInsert.length;
      }
    }
  }

  const weekStarts = new Set<string>();
  for (const row of recentRows) {
    weekStarts.add(getMondayIsoForDate(row.date));
    if (weekStarts.size >= weeksBack) break;
  }
  const targetWeeks = Array.from(weekStarts);

  let rollupsComputed = 0;
  if (targetWeeks.length > 0) {
    const breakdowns = await db
      .select({
        activityId: zoneBreakdowns.activityId,
        zones: zoneBreakdowns.zones,
      })
      .from(zoneBreakdowns)
      .where(eq(zoneBreakdowns.athleteId, athleteId));
    const dateById = new Map<number, string>(recentRows.map((row) => [row.id, row.date]));
    const weekTotals = new Map<string, Record<string, {time: number; distance: number}>>();
    for (const item of breakdowns) {
      const activityDate = dateById.get(item.activityId);
      if (!activityDate) continue;
      const weekStart = getMondayIsoForDate(activityDate);
      if (!targetWeeks.includes(weekStart)) continue;
      const existing = weekTotals.get(weekStart) ?? {};
      const zonesData = item.zones as Record<string, {time: number; distance: number}>;
      for (const [zone, value] of Object.entries(zonesData)) {
        const next = existing[zone] ?? {time: 0, distance: 0};
        next.time += value?.time ?? 0;
        next.distance += value?.distance ?? 0;
        existing[zone] = next;
      }
      weekTotals.set(weekStart, existing);
    }

    const now = Date.now();
    for (const weekStart of targetWeeks) {
      const key = `weekly-zone-rollup:${athleteId}:${weekStart}`;
      const data = weekTotals.get(weekStart) ?? {};
      await db
        .insert(weeklyZoneRollups)
        .values({
          key,
          athleteId,
          weekStart,
          data,
          computedAt: now,
          expiresAt: now + ONE_DAY_MS,
        })
        .onConflictDoUpdate({
          target: weeklyZoneRollups.key,
          set: {
            data: sql`excluded.data`,
            computedAt: sql`excluded.computed_at`,
            expiresAt: sql`excluded.expires_at`,
          },
        });
      rollupsComputed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    athleteId,
    labelsComputed,
    rollupsComputed,
    weeks: targetWeeks,
  });
}
