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
  chatMessageFeedback,
  trainingBlocks,
  weeklyPlans,
  orchestratorGoals,
  orchestratorPlanItems,
  orchestratorBlockers,
  orchestratorHandoffs,
} from '@/db/schema';
import {eq, and, sql, desc, inArray, gte, isNull} from 'drizzle-orm';
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
        // Paginated fetch: GET /api/db/activities?limit=20&offset=0
        const limitParam = req.nextUrl.searchParams.get('limit');
        if (limitParam) {
          const offsetParam = req.nextUrl.searchParams.get('offset');
          const rows = await db
            .select()
            .from(activities)
            .orderBy(desc(activities.date))
            .limit(Number(limitParam))
            .offset(Number(offsetParam ?? 0));
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
        try {
          const settingsRows = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.athleteId, Number(settingsAthleteId)));
          return NextResponse.json(settingsRows[0] ?? null);
        } catch {
          // Backward compatibility: older DBs may not have newly added settings columns.
          const legacyRows = await db.execute(sql`
            SELECT
              athlete_id,
              max_hr,
              resting_hr,
              zones,
              goal,
              allergies,
              food_preferences,
              injuries,
              ai_model,
              weight,
              city,
              training_balance,
              weekly_preferences,
              updated_at
            FROM user_settings
            WHERE athlete_id = ${Number(settingsAthleteId)}
            LIMIT 1
          `);
          const firstRow =
            (legacyRows as unknown as {rows?: Record<string, unknown>[]}).rows?.[0] ??
            null;
          return NextResponse.json(firstRow);
        }
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

      case 'chat-message-feedback': {
        if (pk) {
          const rows = await db
            .select()
            .from(chatMessageFeedback)
            .where(eq(chatMessageFeedback.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!sessionId) {
          return NextResponse.json(
            {error: 'sessionId required'},
            {status: 400},
          );
        }
        const rows = await db
          .select()
          .from(chatMessageFeedback)
          .where(eq(chatMessageFeedback.sessionId, sessionId))
          .orderBy(chatMessageFeedback.createdAt);
        return NextResponse.json(rows);
      }

      case 'orchestrator-goals': {
        if (pk) {
          const rows = await db
            .select()
            .from(orchestratorGoals)
            .where(eq(orchestratorGoals.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const athleteId = req.nextUrl.searchParams.get('athleteId');
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!athleteId || !sessionId) {
          return NextResponse.json(
            {error: 'athleteId and sessionId required'},
            {status: 400},
          );
        }
        const rows = await db
          .select()
          .from(orchestratorGoals)
          .where(
            and(
              eq(orchestratorGoals.athleteId, Number(athleteId)),
              eq(orchestratorGoals.sessionId, sessionId),
            ),
          )
          .orderBy(desc(orchestratorGoals.updatedAt));
        return NextResponse.json(rows);
      }

      case 'orchestrator-plan-items': {
        if (pk) {
          const rows = await db
            .select()
            .from(orchestratorPlanItems)
            .where(eq(orchestratorPlanItems.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const athleteId = req.nextUrl.searchParams.get('athleteId');
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!athleteId || !sessionId) {
          return NextResponse.json(
            {error: 'athleteId and sessionId required'},
            {status: 400},
          );
        }
        const rows = await db
          .select()
          .from(orchestratorPlanItems)
          .where(
            and(
              eq(orchestratorPlanItems.athleteId, Number(athleteId)),
              eq(orchestratorPlanItems.sessionId, sessionId),
            ),
          )
          .orderBy(desc(orchestratorPlanItems.updatedAt));
        return NextResponse.json(rows);
      }

      case 'orchestrator-blockers': {
        if (pk) {
          const rows = await db
            .select()
            .from(orchestratorBlockers)
            .where(eq(orchestratorBlockers.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const athleteId = req.nextUrl.searchParams.get('athleteId');
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!athleteId || !sessionId) {
          return NextResponse.json(
            {error: 'athleteId and sessionId required'},
            {status: 400},
          );
        }
        const rows = await db
          .select()
          .from(orchestratorBlockers)
          .where(
            and(
              eq(orchestratorBlockers.athleteId, Number(athleteId)),
              eq(orchestratorBlockers.sessionId, sessionId),
            ),
          )
          .orderBy(desc(orchestratorBlockers.updatedAt));
        return NextResponse.json(rows);
      }

      case 'orchestrator-handoffs': {
        if (pk) {
          const rows = await db
            .select()
            .from(orchestratorHandoffs)
            .where(eq(orchestratorHandoffs.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const athleteId = req.nextUrl.searchParams.get('athleteId');
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        if (!athleteId || !sessionId) {
          return NextResponse.json(
            {error: 'athleteId and sessionId required'},
            {status: 400},
          );
        }
        const rows = await db
          .select()
          .from(orchestratorHandoffs)
          .where(
            and(
              eq(orchestratorHandoffs.athleteId, Number(athleteId)),
              eq(orchestratorHandoffs.sessionId, sessionId),
            ),
          )
          .orderBy(desc(orchestratorHandoffs.updatedAt));
        return NextResponse.json(rows);
      }

      case 'training-blocks': {
        if (pk) {
          const rows = await db
            .select()
            .from(trainingBlocks)
            .where(and(eq(trainingBlocks.id, pk), isNull(trainingBlocks.deletedAt)));
          return NextResponse.json(rows[0] ?? null);
        }
        const tbAthleteId = req.nextUrl.searchParams.get('athleteId');
        if (!tbAthleteId)
          return NextResponse.json(
            {error: 'athleteId required'},
            {status: 400},
          );
        const tbActiveOnly = req.nextUrl.searchParams.get('active') === 'true';
        const tbConditions = [
          eq(trainingBlocks.athleteId, Number(tbAthleteId)),
          isNull(trainingBlocks.deletedAt),
        ];
        if (tbActiveOnly) {
          tbConditions.push(eq(trainingBlocks.isActive, true));
        }
        const tbRows = await db
          .select()
          .from(trainingBlocks)
          .where(and(...tbConditions))
          .orderBy(desc(trainingBlocks.createdAt));
        if (tbActiveOnly) {
          return NextResponse.json(tbRows[0] ?? null);
        }
        return NextResponse.json(tbRows);
      }

      case 'weekly-plans': {
        if (pk) {
          const rows = await db
            .select()
            .from(weeklyPlans)
            .where(eq(weeklyPlans.id, pk));
          return NextResponse.json(rows[0] ?? null);
        }
        const wpAthleteId = req.nextUrl.searchParams.get('athleteId');
        if (!wpAthleteId)
          return NextResponse.json(
            {error: 'athleteId required'},
            {status: 400},
          );
        const wpActiveOnly = req.nextUrl.searchParams.get('active') === 'true';
        const wpConditions = [eq(weeklyPlans.athleteId, Number(wpAthleteId))];
        if (wpActiveOnly) {
          wpConditions.push(eq(weeklyPlans.isActive, true));
        }
        const wpRows = await db
          .select()
          .from(weeklyPlans)
          .where(and(...wpConditions))
          .orderBy(desc(weeklyPlans.createdAt));
        if (wpActiveOnly) {
          return NextResponse.json(wpRows[0] ?? null);
        }
        return NextResponse.json(wpRows);
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
        try {
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
                weeklyPreferences: sql`excluded.weekly_preferences`,
                strategySelectionMode: sql`excluded.strategy_selection_mode`,
                strategyPreset: sql`excluded.strategy_preset`,
                optimizationPriority: sql`excluded.optimization_priority`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        } catch {
          // Backward compatibility for older DB schemas without strategy columns.
          const legacyRecords = records.map((record) => {
            const r = record as Record<string, unknown>;
            return {
              athleteId: r.athleteId,
              maxHr: r.maxHr,
              restingHr: r.restingHr,
              zones: r.zones,
              goal: r.goal,
              allergies: r.allergies,
              foodPreferences: r.foodPreferences,
              injuries: r.injuries,
              aiModel: r.aiModel,
              weight: r.weight,
              city: r.city,
              trainingBalance: r.trainingBalance,
              weeklyPreferences: r.weeklyPreferences,
              updatedAt: r.updatedAt,
            };
          }) as Array<typeof userSettings.$inferInsert>;

          await db
            .insert(userSettings)
            .values(legacyRecords)
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
                weeklyPreferences: sql`excluded.weekly_preferences`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
        }
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

      case 'chat-message-feedback':
        await db
          .insert(chatMessageFeedback)
          .values(records)
          .onConflictDoUpdate({
            target: chatMessageFeedback.id,
            set: {
              rating: sql`excluded.rating`,
              reason: sql`excluded.reason`,
              freeText: sql`excluded.free_text`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'orchestrator-goals':
        await db
          .insert(orchestratorGoals)
          .values(records)
          .onConflictDoUpdate({
            target: orchestratorGoals.id,
            set: {
              title: sql`excluded.title`,
              detail: sql`excluded.detail`,
              status: sql`excluded.status`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'orchestrator-plan-items':
        await db
          .insert(orchestratorPlanItems)
          .values(records)
          .onConflictDoUpdate({
            target: orchestratorPlanItems.id,
            set: {
              title: sql`excluded.title`,
              detail: sql`excluded.detail`,
              status: sql`excluded.status`,
              ownerPersona: sql`excluded.owner_persona`,
              dueDate: sql`excluded.due_date`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'orchestrator-blockers':
        await db
          .insert(orchestratorBlockers)
          .values(records)
          .onConflictDoUpdate({
            target: orchestratorBlockers.id,
            set: {
              title: sql`excluded.title`,
              detail: sql`excluded.detail`,
              status: sql`excluded.status`,
              linkedPlanItemId: sql`excluded.linked_plan_item_id`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'orchestrator-handoffs':
        await db
          .insert(orchestratorHandoffs)
          .values(records)
          .onConflictDoUpdate({
            target: orchestratorHandoffs.id,
            set: {
              targetPersona: sql`excluded.target_persona`,
              title: sql`excluded.title`,
              detail: sql`excluded.detail`,
              status: sql`excluded.status`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'training-blocks':
        await db
          .insert(trainingBlocks)
          .values(records)
          .onConflictDoUpdate({
            target: trainingBlocks.id,
            set: {
              goalEvent: sql`excluded.goal_event`,
              goalDate: sql`excluded.goal_date`,
              totalWeeks: sql`excluded.total_weeks`,
              startDate: sql`excluded.start_date`,
              phases: sql`excluded.phases`,
              weekOutlines: sql`excluded.week_outlines`,
              isActive: sql`excluded.is_active`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
        break;

      case 'weekly-plans':
        await db
          .insert(weeklyPlans)
          .values(records)
          .onConflictDoUpdate({
            target: weeklyPlans.id,
            set: {
              weekStart: sql`excluded.week_start`,
              title: sql`excluded.title`,
              summary: sql`excluded.summary`,
              goal: sql`excluded.goal`,
              sessions: sql`excluded.sessions`,
              content: sql`excluded.content`,
              isActive: sql`excluded.is_active`,
              blockId: sql`excluded.block_id`,
              weekNumber: sql`excluded.week_number`,
              createdAt: sql`excluded.created_at`,
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
        if (body.weeklyPreferences !== undefined) updates.weeklyPreferences = body.weeklyPreferences;
        if (body.strategySelectionMode !== undefined) updates.strategySelectionMode = body.strategySelectionMode;
        if (body.strategyPreset !== undefined) updates.strategyPreset = body.strategyPreset;
        if (body.optimizationPriority !== undefined) updates.optimizationPriority = body.optimizationPriority;

        if (Object.keys(updates).length === 0) {
          return NextResponse.json({success: true, updated: 0});
        }

        try {
          await db
            .update(userSettings)
            .set(updates)
            .where(eq(userSettings.athleteId, Number(athleteIdParam)));
        } catch {
          // Backward compatibility for older DB schemas without strategy columns.
          const legacyUpdates = {...updates};
          delete legacyUpdates.strategySelectionMode;
          delete legacyUpdates.strategyPreset;
          delete legacyUpdates.optimizationPriority;
          await db
            .update(userSettings)
            .set(legacyUpdates)
            .where(eq(userSettings.athleteId, Number(athleteIdParam)));
        }

        return NextResponse.json({success: true});
      }

      case 'training-blocks': {
        const body = await req.json();
        const tbId = req.nextUrl.searchParams.get('id');
        const tbAthleteId = req.nextUrl.searchParams.get('athleteId');

        if (tbId && tbAthleteId && !body.weekOutlines) {
          await db
            .update(trainingBlocks)
            .set({isActive: false})
            .where(
              and(
                eq(trainingBlocks.athleteId, Number(tbAthleteId)),
                isNull(trainingBlocks.deletedAt),
              ),
            );
          await db
            .update(trainingBlocks)
            .set({isActive: true})
            .where(
              and(
                eq(trainingBlocks.id, tbId),
                eq(trainingBlocks.athleteId, Number(tbAthleteId)),
                isNull(trainingBlocks.deletedAt),
              ),
            );
          return NextResponse.json({success: true});
        }

        if (tbId && body.weekOutlines) {
          const updates: Record<string, unknown> = {
            weekOutlines: body.weekOutlines,
            updatedAt: body.updatedAt ?? Date.now(),
          };
          if (body.phases) updates.phases = body.phases;
          await db
            .update(trainingBlocks)
            .set(updates)
            .where(and(eq(trainingBlocks.id, tbId), isNull(trainingBlocks.deletedAt)));
          return NextResponse.json({success: true});
        }

        return NextResponse.json({error: 'id required'}, {status: 400});
      }

      case 'weekly-plans': {
        const wpPlanId = req.nextUrl.searchParams.get('id');
        const wpAthleteId = req.nextUrl.searchParams.get('athleteId');
        if (!wpPlanId || !wpAthleteId)
          return NextResponse.json(
            {error: 'id and athleteId required'},
            {status: 400},
          );

        await db
          .update(weeklyPlans)
          .set({isActive: false})
          .where(eq(weeklyPlans.athleteId, Number(wpAthleteId)));

        await db
          .update(weeklyPlans)
          .set({isActive: true})
          .where(eq(weeklyPlans.id, wpPlanId));

        return NextResponse.json({success: true});
      }

      case 'orchestrator-goals': {
        const goalId = req.nextUrl.searchParams.get('id');
        if (!goalId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        const body = await req.json();
        await db
          .update(orchestratorGoals)
          .set({
            ...(body.title !== undefined ? {title: body.title} : {}),
            ...(body.detail !== undefined ? {detail: body.detail} : {}),
            ...(body.status !== undefined ? {status: body.status} : {}),
            updatedAt: Date.now(),
          })
          .where(eq(orchestratorGoals.id, goalId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-plan-items': {
        const planItemId = req.nextUrl.searchParams.get('id');
        if (!planItemId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        const body = await req.json();
        await db
          .update(orchestratorPlanItems)
          .set({
            ...(body.title !== undefined ? {title: body.title} : {}),
            ...(body.detail !== undefined ? {detail: body.detail} : {}),
            ...(body.status !== undefined ? {status: body.status} : {}),
            ...(body.ownerPersona !== undefined
              ? {ownerPersona: body.ownerPersona}
              : {}),
            ...(body.dueDate !== undefined ? {dueDate: body.dueDate} : {}),
            updatedAt: Date.now(),
          })
          .where(eq(orchestratorPlanItems.id, planItemId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-blockers': {
        const blockerId = req.nextUrl.searchParams.get('id');
        if (!blockerId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        const body = await req.json();
        await db
          .update(orchestratorBlockers)
          .set({
            ...(body.title !== undefined ? {title: body.title} : {}),
            ...(body.detail !== undefined ? {detail: body.detail} : {}),
            ...(body.status !== undefined ? {status: body.status} : {}),
            ...(body.linkedPlanItemId !== undefined
              ? {linkedPlanItemId: body.linkedPlanItemId}
              : {}),
            updatedAt: Date.now(),
          })
          .where(eq(orchestratorBlockers.id, blockerId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-handoffs': {
        const handoffId = req.nextUrl.searchParams.get('id');
        if (!handoffId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        const body = await req.json();
        await db
          .update(orchestratorHandoffs)
          .set({
            ...(body.targetPersona !== undefined
              ? {targetPersona: body.targetPersona}
              : {}),
            ...(body.title !== undefined ? {title: body.title} : {}),
            ...(body.detail !== undefined ? {detail: body.detail} : {}),
            ...(body.status !== undefined ? {status: body.status} : {}),
            updatedAt: Date.now(),
          })
          .where(eq(orchestratorHandoffs.id, handoffId));
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

      case 'training-blocks': {
        const tbBlockId = req.nextUrl.searchParams.get('id');
        const tbAthleteId = req.nextUrl.searchParams.get('athleteId');
        if (!tbBlockId || !tbAthleteId)
          return NextResponse.json(
            {error: 'id and athleteId required'},
            {status: 400},
          );

        const athleteIdNum = Number(tbAthleteId);
        const now = Date.now();
        const updated = await db
          .update(trainingBlocks)
          .set({isActive: false, deletedAt: now, updatedAt: now})
          .where(
            and(
              eq(trainingBlocks.id, tbBlockId),
              eq(trainingBlocks.athleteId, athleteIdNum),
              isNull(trainingBlocks.deletedAt),
            ),
          )
          .returning({id: trainingBlocks.id});

        if (updated.length === 0) {
          throw new Error('TRAINING_BLOCK_NOT_FOUND');
        }

        await db
          .update(weeklyPlans)
          .set({blockId: null, weekNumber: null})
          .where(
            and(
              eq(weeklyPlans.athleteId, athleteIdNum),
              eq(weeklyPlans.blockId, tbBlockId),
            ),
          );

        return NextResponse.json({success: true});
      }

      case 'weekly-plans': {
        const wpPlanId = req.nextUrl.searchParams.get('id');
        if (!wpPlanId)
          return NextResponse.json({error: 'id required'}, {status: 400});
        await db.delete(weeklyPlans).where(eq(weeklyPlans.id, wpPlanId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-goals': {
        const goalId = req.nextUrl.searchParams.get('id');
        if (!goalId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        await db.delete(orchestratorGoals).where(eq(orchestratorGoals.id, goalId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-plan-items': {
        const planItemId = req.nextUrl.searchParams.get('id');
        if (!planItemId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        await db
          .delete(orchestratorPlanItems)
          .where(eq(orchestratorPlanItems.id, planItemId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-blockers': {
        const blockerId = req.nextUrl.searchParams.get('id');
        if (!blockerId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        await db
          .delete(orchestratorBlockers)
          .where(eq(orchestratorBlockers.id, blockerId));
        return NextResponse.json({success: true});
      }

      case 'orchestrator-handoffs': {
        const handoffId = req.nextUrl.searchParams.get('id');
        if (!handoffId) {
          return NextResponse.json({error: 'id required'}, {status: 400});
        }
        await db
          .delete(orchestratorHandoffs)
          .where(eq(orchestratorHandoffs.id, handoffId));
        return NextResponse.json({success: true});
      }

      default:
        return NextResponse.json({error: 'Unknown table'}, {status: 404});
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'TRAINING_BLOCK_NOT_FOUND') {
      return NextResponse.json(
        {error: 'Training block not found'},
        {status: 404},
      );
    }
    console.error(`[DB DELETE /${table}]`, error);
    return NextResponse.json({error: 'Database error'}, {status: 500});
  }
};
