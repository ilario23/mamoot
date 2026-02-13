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
  activityLabels,
  activityStreams,
  athleteStats,
  athleteZones,
  athleteGear,
  zoneBreakdowns,
  dashboardCache,
  userSettings,
  chatSessions,
  chatMessages,
  coachPlans,
  physioPlans,
} from '@/db/schema';
import {eq, and, sql, desc, inArray, gte} from 'drizzle-orm';
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
        // Optional date filter: GET /api/db/activities?after=2025-01-01
        const after = req.nextUrl.searchParams.get('after');
        if (after) {
          const rows = await db
            .select()
            .from(activities)
            .where(gte(activities.date, after));
          return NextResponse.json(rows);
        }
        const rows = await db.select().from(activities);
        return NextResponse.json(rows);
      }

      case 'activity-details': {
        // Bulk fetch: GET /api/db/activity-details?pks=1,2,3
        const pks = req.nextUrl.searchParams.get('pks');
        if (pks) {
          const ids = pks.split(',').map(Number).filter(Boolean);
          if (ids.length === 0) return NextResponse.json([], {status: 200});
          const rows = await db
            .select()
            .from(activityDetails)
            .where(inArray(activityDetails.id, ids));
          return NextResponse.json(rows);
        }
        // Single fetch: GET /api/db/activity-details?pk=123
        if (!pk)
          return NextResponse.json(
            {error: 'pk or pks required'},
            {status: 400},
          );
        const rows = await db
          .select()
          .from(activityDetails)
          .where(eq(activityDetails.id, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'activity-labels': {
        // Bulk fetch: GET /api/db/activity-labels?pks=1,2,3
        const labelPks = req.nextUrl.searchParams.get('pks');
        if (labelPks) {
          const ids = labelPks.split(',').map(Number).filter(Boolean);
          if (ids.length === 0) return NextResponse.json([], {status: 200});
          const rows = await db
            .select()
            .from(activityLabels)
            .where(inArray(activityLabels.id, ids));
          return NextResponse.json(rows);
        }
        // Single fetch: GET /api/db/activity-labels?pk=123
        if (!pk)
          return NextResponse.json(
            {error: 'pk or pks required'},
            {status: 400},
          );
        const labelRows = await db
          .select()
          .from(activityLabels)
          .where(eq(activityLabels.id, Number(pk)));
        return NextResponse.json(labelRows[0] ?? null);
      }

      case 'activity-streams': {
        // Bulk fetch: GET /api/db/activity-streams?pks=1,2,3
        const streamPks = req.nextUrl.searchParams.get('pks');
        if (streamPks) {
          const ids = streamPks.split(',').map(Number).filter(Boolean);
          if (ids.length === 0) return NextResponse.json([], {status: 200});
          const rows = await db
            .select()
            .from(activityStreams)
            .where(inArray(activityStreams.activityId, ids));
          return NextResponse.json(rows);
        }
        // Single fetch: GET /api/db/activity-streams?pk=123
        if (!pk)
          return NextResponse.json({error: 'pk or pks required'}, {status: 400});
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
        // Bulk fetch: GET /api/db/zone-breakdowns?pks=1,2,3
        const zbPks = req.nextUrl.searchParams.get('pks');
        if (zbPks) {
          const ids = zbPks.split(',').map(Number).filter(Boolean);
          if (ids.length === 0) return NextResponse.json([], {status: 200});
          const rows = await db
            .select()
            .from(zoneBreakdowns)
            .where(inArray(zoneBreakdowns.activityId, ids));
          return NextResponse.json(rows);
        }
        // Single fetch: GET /api/db/zone-breakdowns?pk=123
        if (!pk)
          return NextResponse.json({error: 'pk or pks required'}, {status: 400});
        const rows = await db
          .select()
          .from(zoneBreakdowns)
          .where(eq(zoneBreakdowns.activityId, Number(pk)));
        return NextResponse.json(rows[0] ?? null);
      }

      case 'dashboard-cache': {
        // GET /api/db/dashboard-cache?pk=fitness:12345 → single cache entry by key
        if (!pk)
          return NextResponse.json({error: 'pk required'}, {status: 400});
        const dcRows = await db
          .select()
          .from(dashboardCache)
          .where(eq(dashboardCache.key, pk));
        return NextResponse.json(dcRows[0] ?? null);
      }

      case 'user-settings': {
        // GET /api/db/user-settings?athleteId=123 → settings for athlete
        const settingsAthleteId =
          req.nextUrl.searchParams.get('athleteId') ?? pk;
        if (!settingsAthleteId)
          return NextResponse.json(
            {error: 'athleteId or pk required'},
            {status: 400},
          );
        const settingsRows = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.athleteId, Number(settingsAthleteId)));
        return NextResponse.json(settingsRows[0] ?? null);
      }

      case 'chat-sessions': {
        // GET /api/db/chat-sessions?athleteId=123&persona=coach → sessions list
        // GET /api/db/chat-sessions?pk=uuid OR ?id=uuid → single session
        const sessionPk = pk ?? req.nextUrl.searchParams.get('id');
        if (sessionPk) {
          const rows = await db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.id, sessionPk));
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

      case 'physio-plans': {
        // GET /api/db/physio-plans?athleteId=123          → all plans for athlete
        // GET /api/db/physio-plans?athleteId=123&active=true → active plan only
        // GET /api/db/physio-plans?pk=uuid                → single plan by ID
        if (pk) {
          const rows = await db
            .select()
            .from(physioPlans)
            .where(eq(physioPlans.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const ppAthleteId = req.nextUrl.searchParams.get('athleteId');
        if (!ppAthleteId)
          return NextResponse.json(
            {error: 'athleteId required'},
            {status: 400},
          );
        const ppActiveOnly = req.nextUrl.searchParams.get('active') === 'true';
        const ppConditions = [eq(physioPlans.athleteId, Number(ppAthleteId))];
        if (ppActiveOnly) {
          ppConditions.push(eq(physioPlans.isActive, true));
        }
        const ppRows = await db
          .select()
          .from(physioPlans)
          .where(and(...ppConditions))
          .orderBy(desc(physioPlans.sharedAt));
        if (ppActiveOnly) {
          return NextResponse.json(ppRows[0] ?? null);
        }
        return NextResponse.json(ppRows);
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

      case 'activity-labels':
        await db
          .insert(activityLabels)
          .values(records)
          .onConflictDoUpdate({
            target: activityLabels.id,
            set: {
              data: sql`excluded.data`,
              computedAt: sql`excluded.computed_at`,
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

      case 'dashboard-cache':
        await db
          .insert(dashboardCache)
          .values(records)
          .onConflictDoUpdate({
            target: dashboardCache.key,
            set: {
              athleteId: sql`excluded.athlete_id`,
              settingsHash: sql`excluded.settings_hash`,
              lastActivityId: sql`excluded.last_activity_id`,
              lastActivityCount: sql`excluded.last_activity_count`,
              lastDate: sql`excluded.last_date`,
              continuationState: sql`excluded.continuation_state`,
              data: sql`excluded.data`,
              computedAt: sql`excluded.computed_at`,
            },
          });
        break;

      case 'user-settings':
        await db
          .insert(userSettings)
          .values(records)
          .onConflictDoUpdate({
            target: userSettings.athleteId,
            set: {
              maxHr: sql`excluded.max_hr`,
              restingHr: sql`excluded.resting_hr`,
              zones: sql`excluded.zones`,
              goal: sql`excluded.goal`,
              allergies: sql`excluded.allergies`,
              foodPreferences: sql`excluded.food_preferences`,
              injuries: sql`excluded.injuries`,
              aiModel: sql`excluded.ai_model`,
              weight: sql`excluded.weight`,
              city: sql`excluded.city`,
              trainingBalance: sql`excluded.training_balance`,
              updatedAt: sql`excluded.updated_at`,
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

      case 'physio-plans':
        await db
          .insert(physioPlans)
          .values(records)
          .onConflictDoUpdate({
            target: physioPlans.id,
            set: {
              title: sql`excluded.title`,
              summary: sql`excluded.summary`,
              phase: sql`excluded.phase`,
              strengthSessionsPerWeek: sql`excluded.strength_sessions_per_week`,
              sessions: sql`excluded.sessions`,
              content: sql`excluded.content`,
              isActive: sql`excluded.is_active`,
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
      case 'user-settings': {
        // PATCH /api/db/user-settings → partial update (weight, city from Strava profile)
        const body = await req.json();
        const athleteIdParam = body.athleteId;
        if (!athleteIdParam)
          return NextResponse.json(
            {error: 'athleteId required'},
            {status: 400},
          );

        const updates: Record<string, unknown> = {};
        if (body.weight !== undefined) updates.weight = body.weight;
        if (body.city !== undefined) updates.city = body.city;

        if (Object.keys(updates).length === 0) {
          return NextResponse.json({success: true, updated: 0});
        }

        await db
          .update(userSettings)
          .set(updates)
          .where(eq(userSettings.athleteId, Number(athleteIdParam)));

        return NextResponse.json({success: true});
      }

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

      case 'physio-plans': {
        // PATCH /api/db/physio-plans?id=uuid&athleteId=123 → activate this plan (deactivate others)
        const ppPlanId = req.nextUrl.searchParams.get('id');
        const ppAthleteId = req.nextUrl.searchParams.get('athleteId');
        if (!ppPlanId || !ppAthleteId)
          return NextResponse.json(
            {error: 'id and athleteId required'},
            {status: 400},
          );

        await db
          .update(physioPlans)
          .set({isActive: false})
          .where(eq(physioPlans.athleteId, Number(ppAthleteId)));

        await db
          .update(physioPlans)
          .set({isActive: true})
          .where(eq(physioPlans.id, ppPlanId));

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
      case 'chat-sessions': {
        // DELETE /api/db/chat-sessions?id=uuid → delete session, its messages, and linked plans
        const sessionId = req.nextUrl.searchParams.get('id');
        if (!sessionId)
          return NextResponse.json({error: 'id required'}, {status: 400});
        // Delete messages belonging to this session
        await db
          .delete(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId));
        // Delete plans linked to this session (best-effort — table may be out of sync)
        try {
          await db
            .delete(coachPlans)
            .where(eq(coachPlans.sourceSessionId, sessionId));
        } catch (e) {
          console.warn(
            '[DB DELETE /chat-sessions] Could not cascade-delete coach_plans:',
            (e as Error).message,
          );
        }
        // Delete the session itself (includes memory/summary)
        await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
        return NextResponse.json({success: true});
      }

      case 'chat-messages': {
        // DELETE /api/db/chat-messages?sessionId=uuid → delete all messages for a session
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!sessionId)
          return NextResponse.json(
            {error: 'sessionId required'},
            {status: 400},
          );
        await db
          .delete(chatMessages)
          .where(eq(chatMessages.sessionId, sessionId));
        return NextResponse.json({success: true});
      }

      case 'coach-plans': {
        // DELETE /api/db/coach-plans?id=uuid → delete a specific plan
        const planId = req.nextUrl.searchParams.get('id');
        if (!planId)
          return NextResponse.json({error: 'id required'}, {status: 400});
        await db.delete(coachPlans).where(eq(coachPlans.id, planId));
        return NextResponse.json({success: true});
      }

      case 'physio-plans': {
        // DELETE /api/db/physio-plans?id=uuid → delete a specific plan
        const ppPlanId = req.nextUrl.searchParams.get('id');
        if (!ppPlanId)
          return NextResponse.json({error: 'id required'}, {status: 400});
        await db.delete(physioPlans).where(eq(physioPlans.id, ppPlanId));
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
