import {NextResponse} from 'next/server';
import {and, desc, eq, inArray, sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {activities, activityDetails, userSettings} from '@/db/schema';
import type {StravaDetailedActivity, StravaSummaryActivity} from '@/lib/strava';
import {autoGeneratePaceZones} from '@/lib/paceZoneAutoGeneration';
import {mergeWithDefaultPaceZones, PACE_ZONE_KEYS} from '@/lib/paceZones';

const requestSchema = z.object({
  athleteId: z.number().int().positive(),
});

const isRunSportType = (sportType: unknown): boolean => {
  if (typeof sportType !== 'string') return false;
  return (
    sportType === 'Run' || sportType === 'TrailRun' || sportType === 'VirtualRun'
  );
};

const parseAthleteHeader = (req: Request): number | null => {
  const raw = req.headers.get('x-athlete-id');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON body'}, {status: 400});
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({error: 'Invalid request body'}, {status: 400});
  }

  const {athleteId} = parsed.data;
  const callerAthleteId = parseAthleteHeader(req);
  if (callerAthleteId && callerAthleteId !== athleteId) {
    return NextResponse.json({error: 'Forbidden athlete scope'}, {status: 403});
  }

  let settings:
    | {
        athleteId: number;
        zones: unknown;
        paceZones?: unknown;
      }
    | null
    = null;
  try {
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.athleteId, athleteId))
      .limit(1);
    const row = settingsRows[0];
    settings = row
      ? {
          athleteId: row.athleteId,
          zones: row.zones,
          paceZones: row.paceZones,
        }
      : null;
  } catch {
    // Backward compatibility: DBs without pace_zones must still generate.
    const legacy = await db.execute(sql`
      SELECT athlete_id, zones
      FROM user_settings
      WHERE athlete_id = ${athleteId}
      LIMIT 1
    `);
    const legacyRow =
      (legacy as unknown as {rows?: Array<{athlete_id?: number; zones?: unknown}>})
        .rows?.[0] ?? null;
    settings = legacyRow
      ? {
          athleteId: legacyRow.athlete_id ?? athleteId,
          zones: legacyRow.zones,
        }
      : null;
  }
  if (!settings) {
    return NextResponse.json({error: 'Settings not found'}, {status: 404});
  }

  const activityRows = await db
    .select()
    .from(activities)
    .where(eq(activities.athleteId, athleteId))
    .orderBy(desc(activities.date))
    .limit(500);
  const runSummaries = activityRows
    .map((row) => row.data as StravaSummaryActivity)
    .filter((activity) => isRunSportType(activity.sport_type))
    .slice(0, 220);

  const runIds = runSummaries.map((activity) => activity.id).filter(Boolean);
  const detailRows = runIds.length
    ? await db
        .select()
        .from(activityDetails)
        .where(
          and(
            eq(activityDetails.athleteId, athleteId),
            inArray(activityDetails.id, runIds),
          ),
        )
    : [];
  const detailsById = new Map<number, StravaDetailedActivity>(
    detailRows.map((row) => [row.id, row.data as StravaDetailedActivity]),
  );

  const generated = autoGeneratePaceZones({
    zones: settings.zones as {
      z1: [number, number];
      z2: [number, number];
      z3: [number, number];
      z4: [number, number];
      z5: [number, number];
      z6: [number, number];
    },
    runs: runSummaries,
    runDetailsById: detailsById,
  });

  const existingPaceZones = mergeWithDefaultPaceZones(
    settings.paceZones as
      | {
          z1: unknown;
          z2: unknown;
          z3: unknown;
          z4: unknown;
          z5: unknown;
          z6: unknown;
        }
      | undefined,
  );
  const nextPaceZones = mergeWithDefaultPaceZones(generated.paceZones);

  // Preserve manual zones during auto-generation; these are athlete-owned overrides.
  for (const zoneKey of PACE_ZONE_KEYS) {
    const existing = existingPaceZones[zoneKey];
    if (existing.source === 'manual') {
      nextPaceZones[zoneKey] = existing;
    }
  }

  const updatedAt = Date.now();
  let persistedPaceZones = true;
  try {
    await db
      .update(userSettings)
      .set({
        paceZones: nextPaceZones,
        updatedAt,
      })
      .where(eq(userSettings.athleteId, athleteId));
  } catch {
    // Backward compatibility: if pace_zones column is missing, keep endpoint functional.
    persistedPaceZones = false;
    await db
      .update(userSettings)
      .set({
        updatedAt,
      })
      .where(eq(userSettings.athleteId, athleteId));
  }

  return NextResponse.json({
    athleteId,
    paceZones: nextPaceZones,
    diagnostics: generated.diagnostics,
    updatedAt,
    persistedPaceZones,
    ...(persistedPaceZones
      ? {}
      : {
          warning:
            'pace_zones column missing in database schema; generated values returned but not persisted.',
        }),
  });
}
