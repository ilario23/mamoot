// ============================================================
// Dynamic Database API Route — /api/db/[table]
// ============================================================
//
// Handles read (GET) and upsert (POST) operations for all Neon
// tables via a single dynamic route. Keeps DB credentials
// server-side while the client uses fetch() to sync.

import {db} from '@/db';
import {
  activities,
  activityDetails,
  activityStreams,
  athleteStats,
  athleteZones,
  athleteGear,
  zoneBreakdowns,
} from '@/db/schema';
import {eq, sql} from 'drizzle-orm';
import {type NextRequest, NextResponse} from 'next/server';

type RouteContext = {params: Promise<{table: string}>};

// ---- GET — Read records from Neon ----
// Usage: GET /api/db/activities          → all activities
//        GET /api/db/activity-details?pk=123  → single record by PK

export const GET = async (req: NextRequest, {params}: RouteContext) => {
  const {table} = await params;
  const pk = req.nextUrl.searchParams.get('pk');

  try {
    switch (table) {
      case 'activities': {
        if (pk) {
          const rows = await db
            .select()
            .from(activities)
            .where(eq(activities.id, Number(pk)));
          return NextResponse.json(rows[0] ?? null);
        }
        const rows = await db.select().from(activities);
        return NextResponse.json(rows);
      }

      case 'activity-details': {
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db
          .select()
          .from(activityDetails)
          .where(eq(activityDetails.id, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'activity-streams': {
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db
          .select()
          .from(activityStreams)
          .where(eq(activityStreams.activityId, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'athlete-stats': {
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db
          .select()
          .from(athleteStats)
          .where(eq(athleteStats.athleteId, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'athlete-zones': {
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db
          .select()
          .from(athleteZones)
          .where(eq(athleteZones.key, pk));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'athlete-gear': {
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db
          .select()
          .from(athleteGear)
          .where(eq(athleteGear.key, pk));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'zone-breakdowns': {
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const rows = await db
          .select()
          .from(zoneBreakdowns)
          .where(eq(zoneBreakdowns.activityId, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 404});
    }
  } catch (error) {
    console.error(`[DB GET /${table}]`, error);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
};

// ---- POST — Upsert records into Neon ----
// Accepts a single record or an array. Uses ON CONFLICT DO UPDATE
// so existing records are overwritten with fresh data.

export const POST = async (req: NextRequest, {params}: RouteContext) => {
  const {table} = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
  }

  const records = Array.isArray(body) ? body : [body];
  if (records.length === 0) {
    return NextResponse.json({success: true, count: 0});
  }

  try {
    switch (table) {
      case 'activities':
        await db
          .insert(activities)
          .values(records)
          .onConflictDoUpdate({
            target: activities.id,
            set: {
              data: sql`excluded.data`,
              date: sql`excluded.date`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        break;

      case 'activity-details':
        await db
          .insert(activityDetails)
          .values(records)
          .onConflictDoUpdate({
            target: activityDetails.id,
            set: {
              data: sql`excluded.data`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        break;

      case 'activity-streams':
        await db
          .insert(activityStreams)
          .values(records)
          .onConflictDoUpdate({
            target: activityStreams.activityId,
            set: {
              data: sql`excluded.data`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        break;

      case 'athlete-stats':
        await db
          .insert(athleteStats)
          .values(records)
          .onConflictDoUpdate({
            target: athleteStats.athleteId,
            set: {
              data: sql`excluded.data`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        break;

      case 'athlete-zones':
        await db
          .insert(athleteZones)
          .values(records)
          .onConflictDoUpdate({
            target: athleteZones.key,
            set: {
              data: sql`excluded.data`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        break;

      case 'athlete-gear':
        await db
          .insert(athleteGear)
          .values(records)
          .onConflictDoUpdate({
            target: athleteGear.key,
            set: {
              bikes: sql`excluded.bikes`,
              shoes: sql`excluded.shoes`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
        break;

      case 'zone-breakdowns':
        await db
          .insert(zoneBreakdowns)
          .values(records)
          .onConflictDoUpdate({
            target: zoneBreakdowns.activityId,
            set: {
              settingsHash: sql`excluded.settings_hash`,
              zones: sql`excluded.zones`,
              computedAt: sql`excluded.computed_at`,
            },
          });
        break;

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 404});
    }

    return NextResponse.json({success: true, count: records.length});
  } catch (error) {
    console.error(`[DB POST /${table}]`, error);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
};
