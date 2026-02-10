// ============================================================
// Dynamic Database API Route — /api/db/[table]
// ============================================================
//
// Handles read (GET), upsert (POST), update (PATCH), and delete
// (DELETE) operations for all Neon tables via a single dynamic
// route. Keeps DB credentials server-side while the client uses
// fetch() to sync.

import {db} from '@/db';
import {
  activities,
  activityDetails,
  activityStreams,
  athleteStats,
  athleteZones,
  athleteGear,
  zoneBreakdowns,
  chatSessions,
  chatMessages,
  coachPlans,
} from '@/db/schema';
import {eq, and, sql, desc} from 'drizzle-orm';
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

      case 'chat-sessions': {
        // GET /api/db/chat-sessions?athleteId=123&persona=coach → sessions list
        // GET /api/db/chat-sessions?pk=uuid → single session
        if (pk) {
          const rows = await db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const athleteId = req.nextUrl.searchParams.get('athleteId');
        const persona = req.nextUrl.searchParams.get('persona');
        if (!athleteId || !persona)
          return NextResponse.json(
            {error: 'athleteId and persona required'},
            {status: 400},
          );
        const rows = await db
          .select()
          .from(chatSessions)
          .where(
            and(
              eq(chatSessions.athleteId, Number(athleteId)),
              eq(chatSessions.persona, persona),
            ),
          )
          .orderBy(desc(chatSessions.updatedAt));
        return NextResponse.json(rows);
      }

      case 'chat-messages': {
        // GET /api/db/chat-messages?sessionId=uuid → all messages for session
        // GET /api/db/chat-messages?pk=uuid → single message
        if (pk) {
          const rows = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!sessionId)
          return NextResponse.json(
            {error: 'sessionId required'},
            {status: 400},
          );
        const rows = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId))
          .orderBy(chatMessages.createdAt);
        return NextResponse.json(rows);
      }

      case 'coach-plans': {
        // GET /api/db/coach-plans?athleteId=123          → all plans for athlete
        // GET /api/db/coach-plans?athleteId=123&active=true → active plan only
        // GET /api/db/coach-plans?pk=uuid                → single plan by ID
        if (pk) {
          const rows = await db
            .select()
            .from(coachPlans)
            .where(eq(coachPlans.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const athleteIdParam = req.nextUrl.searchParams.get('athleteId');
        if (!athleteIdParam)
          return NextResponse.json(
            {error: 'athleteId required'},
            {status: 400},
          );
        const activeOnly = req.nextUrl.searchParams.get('active') === 'true';
        const conditions = [eq(coachPlans.athleteId, Number(athleteIdParam))];
        if (activeOnly) {
          conditions.push(eq(coachPlans.isActive, true));
        }
        const planRows = await db
          .select()
          .from(coachPlans)
          .where(and(...conditions))
          .orderBy(desc(coachPlans.sharedAt));
        // If requesting active only, return single object or null
        if (activeOnly) {
          return NextResponse.json(planRows[0] ?? null);
        }
        return NextResponse.json(planRows);
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
              retiredGearIds: sql`excluded.retired_gear_ids`,
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

      case 'chat-sessions':
        await db
          .insert(chatSessions)
          .values(records)
          .onConflictDoUpdate({
            target: chatSessions.id,
            set: {
              title: sql`excluded.title`,
              summary: sql`excluded.summary`,
              messageCount: sql`excluded.message_count`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'chat-messages':
        await db
          .insert(chatMessages)
          .values(records)
          .onConflictDoUpdate({
            target: chatMessages.id,
            set: {
              content: sql`excluded.content`,
            },
          });
        break;

      case 'coach-plans':
        await db
          .insert(coachPlans)
          .values(records)
          .onConflictDoUpdate({
            target: coachPlans.id,
            set: {
              title: sql`excluded.title`,
              summary: sql`excluded.summary`,
              goal: sql`excluded.goal`,
              durationWeeks: sql`excluded.duration_weeks`,
              sessions: sql`excluded.sessions`,
              content: sql`excluded.content`,
              isActive: sql`excluded.is_active`,
              sourceMessageId: sql`excluded.source_message_id`,
              sourceSessionId: sql`excluded.source_session_id`,
              sharedAt: sql`excluded.shared_at`,
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

// ---- PATCH — Partial updates ----

export const PATCH = async (req: NextRequest, {params}: RouteContext) => {
  const {table} = await params;

  try {
    switch (table) {
      case 'coach-plans': {
        // PATCH /api/db/coach-plans?id=uuid&athleteId=123 → activate this plan (deactivate others)
        const planId = req.nextUrl.searchParams.get('id');
        const athleteIdParam = req.nextUrl.searchParams.get('athleteId');
        if (!planId || !athleteIdParam)
          return NextResponse.json(
            {error: 'id and athleteId required'},
            {status: 400},
          );

        // Deactivate all plans for this athlete
        await db
          .update(coachPlans)
          .set({isActive: false})
          .where(eq(coachPlans.athleteId, Number(athleteIdParam)));

        // Activate the selected plan
        await db
          .update(coachPlans)
          .set({isActive: true})
          .where(eq(coachPlans.id, planId));

        return NextResponse.json({success: true});
      }

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 404});
    }
  } catch (error) {
    console.error(`[DB PATCH /${table}]`, error);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
};

// ---- DELETE — Remove records from Neon ----

export const DELETE = async (req: NextRequest, {params}: RouteContext) => {
  const {table} = await params;

  try {
    switch (table) {
      case 'coach-plans': {
        // DELETE /api/db/coach-plans?id=uuid → delete a specific plan
        const planId = req.nextUrl.searchParams.get('id');
        if (!planId)
          return NextResponse.json(
            {error: 'id required'},
            {status: 400},
          );
        await db.delete(coachPlans).where(eq(coachPlans.id, planId));
        return NextResponse.json({success: true});
      }

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 404});
    }
  } catch (error) {
    console.error(`[DB DELETE /${table}]`, error);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
};
