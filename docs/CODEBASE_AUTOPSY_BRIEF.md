# Mamoot Codebase Autopsy Brief

## 1) Executive Summary

- Monolithic Next.js 16 App Router app (`app/`) with client-heavy UI and server route handlers for AI, Strava OAuth, and DB access; no separate worker service found. (`package.json:5-8`, `README.md:35-43`, `app/layout.tsx:43-59`)
- Runtime is hybrid: browser React + server route handlers (`app/api/**`), with AI endpoints using streaming (`streamText`) and long route budgets (`maxDuration = 120`). (`app/api/ai/chat/route.ts:1107-1113`, `app/api/ai/weekly-plan/route.ts:67`, `app/api/ai/training-block/route.ts:48`)
- Primary data store is Neon Postgres via Drizzle; many Strava payloads are persisted as JSONB plus athlete-scoped metadata. (`src/db/index.ts:1-15`, `src/db/schema.ts:21-27`, `src/db/schema.ts:88-113`)
- Two-tier data access pattern is explicit: Neon cache first, Strava API fallback, then write-back to Neon; React Query is third in-memory layer in browser. (`src/lib/stravaCache.ts:64-77`, `src/lib/stravaCache.ts:96-142`, `src/hooks/useStrava.ts:32-39`)
- AI system is multi-persona (Coach/Nutritionist/Physio + orchestration behavior), grounded by retrieval tools and structured Zod contracts. (`src/lib/aiPrompts.ts:63-108`, `src/lib/aiRetrievalTools.ts:209-259`, `src/lib/aiTools.ts:399-484`)
- Chat planning flow is stateful but in-memory (`Map`) with TTL, not durable in DB; this is a reliability trade-off for multi-turn intake. (`app/api/ai/chat/route.ts:94-106`, `app/api/ai/chat/route.ts:297-304`)
- Weekly plan and block generation enforce schema + semantic checks + retry-repair loops; remaining-days mode locks historical days from actuals. (`src/lib/aiGeneration.ts:12-33`, `src/lib/planSemanticValidators.ts:61-101`, `app/api/ai/weekly-plan/route.ts:695-721`)
- Safety controls exist at multiple layers: red-flag refusal in chat, deterministic semantic validation in planning, conflict resolver between coach/physio sessions, date normalization for tool patches. (`app/api/ai/chat/route.ts:542-559`, `src/lib/planSemanticValidators.ts:69-99`, `src/lib/multiAgentContracts.ts:114-153`, `src/lib/aiTools.ts:266-317`)
- Weather and hydration adaptation are grounded by a retrieval tool backed by Open-Meteo, with city/profile/coordinate fallback and hydration flags. (`src/lib/aiRetrievalTools.ts:1322-1338`, `src/lib/aiRetrievalTools.ts:1379-1436`, `src/lib/aiRetrievalTools.ts:1517-1529`)
- Gear retirement is app-owned (not Strava-native), persisted in Neon and used for AI guidance constraints. (`src/db/schema.ts:66-73`, `src/lib/retiredGear.ts:19-39`, `src/lib/aiPrompts.ts:86-87`)
- Observability is better than average for an app this size: AI trace IDs, per-step telemetry, persisted telemetry events, and experiment assignment logging. (`src/lib/aiTrace.ts:18-33`, `app/api/ai/chat/route.ts:1113-1167`, `app/api/ai/experiments/route.ts:41-63`)
- Key risk areas: dynamic DB route auth defaults, prompt-contract enforcement gap at runtime, in-memory planning state loss, migration chronology ambiguity. (`app/api/db/[table]/route.ts:36-57`, `src/lib/promptContracts.ts:104-116`, `app/api/ai/chat/route.ts:104-106`, `drizzle/0011_curly_goliath.sql:14-34`)

## 2) Architecture Diagram

```mermaid
flowchart LR
  U[User Browser]
  UI[Next.js App Router UI\nReact + TanStack Query]
  CHAT[/api/ai/chat]
  WPLAN[/api/ai/weekly-plan]
  TBLOCK[/api/ai/training-block]
  DBAPI[/api/db/[table]]
  STRAVA_TOKEN[/api/strava/token]
  AI[OpenAI/Anthropic via AI SDK]
  RT[Retrieval Tools Factory]
  NEON[(Neon Postgres)]
  STRAVA[Strava API v3]
  WEATHER[Open-Meteo]

  U --> UI
  UI --> CHAT
  UI --> WPLAN
  UI --> TBLOCK
  UI --> DBAPI
  UI --> STRAVA_TOKEN

  CHAT --> AI
  CHAT --> RT
  RT --> NEON
  RT --> WEATHER

  WPLAN --> AI
  WPLAN --> NEON
  TBLOCK --> AI
  TBLOCK --> NEON

  UI --> STRAVA
  STRAVA_TOKEN --> STRAVA

  UI --> NEON
  DBAPI --> NEON
```

**Legend**
- `UI -> STRAVA`: client Strava reads are wrapped in cache-through helpers.
- `CHAT -> RT -> NEON/WEATHER`: chat grounding path.
- `WPLAN/TBLOCK`: deterministic generation pipelines with Zod + semantic validators.
- `DBAPI`: generic table gateway used by sync helpers.

## 3) Data Model & Schemas

- **Core persistence**
  - Strava caches: `activities`, `activity_details`, `activity_streams`, `athlete_stats`, `athlete_zones`, `athlete_gear`, `zone_breakdowns` (JSONB-heavy, athlete scoped). (`src/db/schema.ts:21-83`)
  - Athlete profile/config: `user_settings` includes goal, allergies, injuries, model, weight/city, weekly preferences, strategy knobs. (`src/db/schema.ts:88-113`)
  - AI/chat domain: `chat_sessions`, `chat_messages`, `training_blocks`, `weekly_plans`, `athlete_readiness_signals`, `ai_telemetry_events`. (`src/db/schema.ts:115-183`, `src/db/schema.ts:232-277`)
- **Schema contracts (Zod)**
  - Request contracts: chat, weekly plan, training block requests with strict mode/date enums. (`src/lib/aiRequestSchemas.ts:15-46`, `src/lib/aiRequestSchemas.ts:129-154`)
  - Tool contracts: planning flow schemas (`start/set/get/confirm/execute`), weekly/block patch schemas, follow-up schema. (`src/lib/aiTools.ts:319-370`, `src/lib/aiTools.ts:399-484`)
  - Date normalization and alias repair for training block patches (`goal_date`, `eventDate`, etc.). (`src/lib/aiTools.ts:266-317`)
- **Migrations and tenancy/indexing**
  - Multi-user athlete scoping was added and backfilled with indexes. (`drizzle/0013_multi_user_athlete_scope.sql:1-54`)
  - AI telemetry/readiness tables include operational indexes (`trace`, `route+event`, `created_at`). (`drizzle/0016_ai_telemetry_and_readiness.sql:16-45`)
  - Orchestrator state tables were later dropped. (`drizzle/0017_remove_orchestrator_state.sql:1-4`)

## 4) AI Orchestration Map

- **Persona responsibilities + hard prompt rules**
  - Coach: data-first, planning flow tools required for weekly plan/block creation, must end with follow-up tool, no diagnosis. (`src/lib/aiPrompts.ts:74-106`)
  - Nutritionist: allergy-first and weekly-plan-first for nutrition plans, weather-aware hydration guidance. (`src/lib/aiPrompts.ts:125-175`)
  - Physio: fitness+weekly breakdown checks, injury prevention orientation, shoe wear and ACWR risk signaling. (`src/lib/aiPrompts.ts:206-217`)
- **Registered runtime tools**
  - Chat route composes retrieval tools + coach-only tools + follow-up tool; max tool steps are bounded. (`app/api/ai/chat/route.ts:1091-1113`, `app/api/ai/chat/route.ts:1105`)
  - Retrieval tool surface includes goal/injury/diet/training summary/zone distribution/fitness/recent activities/activity detail/PR/gear/weekly plan/plan-vs-actual/weather/training block. (`src/lib/aiPrompts.ts:25-39`, `src/lib/aiRetrievalTools.ts:209-260`, `src/lib/aiRetrievalTools.ts:1322-1543`)
- **Required planning sequence (coach flow)**
  - `startPlanningFlow -> setPlanningField -> getPlanningState -> confirmPlanningState -> executePlanningGeneration`. (`app/api/ai/chat/route.ts:614-659`, `app/api/ai/chat/route.ts:661-734`, `app/api/ai/chat/route.ts:736-836`, `app/api/ai/chat/route.ts:801-967`)
- **Flags/modes**
  - Weekly mode: `full` or `remaining_days` carried from intake into `/api/ai/weekly-plan`. (`src/lib/aiRequestSchemas.ts:36`, `app/api/ai/chat/route.ts:926-930`)

## 5) Critical Flows (Happy Paths)

1. **Weekly plan create/edit**
   1) UI/intake assembles request and posts to chat or directly to weekly-plan endpoint. (`src/components/chat/CoachGuidedIntakePanel.tsx`, `src/hooks/useWeeklyPlan.ts:253-270`)
   2) Coach planning state is collected in chat tool loop and confirmed. (`app/api/ai/chat/route.ts:614-836`)
   3) Execution calls `/api/ai/weekly-plan` with mode/strategy/edit metadata. (`app/api/ai/chat/route.ts:916-967`)
   4) Weekly pipeline builds context, generates with retries + semantic checks, optionally applies repair pass. (`app/api/ai/weekly-plan/route.ts:751-789`, `app/api/ai/weekly-plan/route.ts:804-833`)
   5) Result streams SSE progress to client and persists unified sessions to `weekly_plans`. (`src/hooks/useWeeklyPlan.ts:302-402`, `src/db/schema.ts:257-277`)

2. **Training block create/update**
   1) Intake or block view calls `/api/ai/training-block`. (`src/hooks/useTrainingBlock.ts`, `app/api/ai/chat/route.ts:856-879`)
   2) Route validates request, loads readiness/activity context, applies strategy selection and structured generation. (`app/api/ai/training-block/route.ts:172-202`, `app/api/ai/training-block/route.ts:625-646`, `app/api/ai/training-block/route.ts:832-842`)
   3) Optional physio safety review path is invoked when enabled. (`app/api/ai/training-block/route.ts:257`, `app/api/ai/training-block/route.ts:842`)
   4) Persisted to `training_blocks`; adaptations can be called later by tool/API. (`src/db/schema.ts:236-255`, `src/lib/aiTools.ts:137-165`)

3. **Plan vs actual review**
   1) Retrieval tool `comparePlanVsActual` path calls week review builder.
   2) Week review aligns planned sessions with activity labels and outputs Hit/Modified/Missed/Unplanned summary. (`src/lib/weekReview.ts:111-246`)
   3) Coach can use this in chat for next-week adjustments. (`src/lib/aiPrompts.ts:101-103`)

4. **Weather-aware planning / hydration**
   1) Persona calls `getWeatherForecast(days, city?)`.
   2) Tool resolves city from explicit input -> profile city -> latest activity coordinates. (`src/lib/aiRetrievalTools.ts:1338-1346`, `src/lib/aiRetrievalTools.ts:1379-1436`)
   3) Open-Meteo daily forecast fetched and hydration risk notes injected into output. (`src/lib/aiRetrievalTools.ts:1438-1468`, `src/lib/aiRetrievalTools.ts:1517-1529`)
   4) Nutritionist/Coach prompt rules direct adaptation of hydration/intensity. (`src/lib/aiPrompts.ts:167-175`, `src/lib/aiPrompts.ts:98-99`)

5. **Gear checks / rotation hints**
   1) Gear data is cached from Strava and stored with `retiredGearIds`. (`src/lib/stravaCache.ts:271-292`, `src/db/schema.ts:66-73`)
   2) UI toggles retirement status through Neon-backed helper. (`src/views/Gear.tsx`, `src/lib/retiredGear.ts:19-39`)
   3) Coach/Physio prompts prohibit recommending retired gear. (`src/lib/aiPrompts.ts:86-87`, `src/lib/aiPrompts.ts:212-213`)

## 6) Risk Register

- **Auth hardening gap in DB gateway**
  - Risk: `DB_ROUTE_ENFORCE_AUTH` defaults false; accidental prod misconfig could expose table route.
  - Evidence: `app/api/db/[table]/route.ts:36-57`.
  - Mitigation: default true in production branch + startup assert + integration test for unauthorized calls.

- **Prompt contract is test-time, not runtime-enforced**
  - Risk: `validatePromptContract` exists but chat route does not call it before serving prompt/model request.
  - Evidence: `src/lib/promptContracts.ts:104-116`; no usage in `app/api/ai/chat/route.ts`.
  - Mitigation: enforce contract check in route init; fail closed or alert telemetry when missing checks.

- **Planning state durability**
  - Risk: chat planning state is in-memory `Map` with 1h TTL; restart/scaling can lose flow state.
  - Evidence: `app/api/ai/chat/route.ts:104-106`, `app/api/ai/chat/route.ts:297-304`.
  - Mitigation: persist planning state per `athleteId+sessionId` in Neon or Redis.

- **Migration chronology ambiguity**
  - Risk: `0011_curly_goliath.sql` re-creates objects covered by adjacent migrations; may complicate reproducibility across environments.
  - Evidence: `drizzle/0011_curly_goliath.sql:14-34`.
  - Mitigation: reconcile/linearize migration history; run full migration replay in CI ephemeral DB.

- **Client token storage**
  - Risk: Strava access/refresh tokens in `localStorage` are vulnerable to XSS exfiltration.
  - Evidence: `src/lib/strava.ts:42-91`.
  - Mitigation: move to HttpOnly secure cookies with server session broker.

## 7) Onboarding Checklist (First 48h)

- **Read first**
  - `README.md`, `app/layout.tsx`, `app/providers.tsx`, `app/app-shell.tsx` for runtime shell.
  - `src/lib/stravaCache.ts`, `src/lib/neonSync.ts`, `app/api/db/[table]/route.ts` for data plane.
  - `app/api/ai/chat/route.ts`, `app/api/ai/weekly-plan/route.ts`, `app/api/ai/training-block/route.ts` for AI plane.
  - `src/lib/aiTools.ts`, `src/lib/aiRetrievalTools.ts`, `src/lib/aiPrompts.ts`, `src/lib/planSemanticValidators.ts`.

- **Run commands**
  - `npm install`
  - `npm run dev`
  - `npm run lint && npm run typecheck`
  - `npm run test:ai-gates`
  - `npm run test:ai-evals`
  - Optional DB ops: `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`. (`package.json:5-20`)

- **Minimum local env**
  - `NEXT_PUBLIC_STRAVA_CLIENT_ID`, `NEXT_PUBLIC_STRAVA_REDIRECT_URI`, `STRAVA_CLIENT_SECRET`, `DATABASE_URL`. (`README.md:74-83`)

- **Functional smoke tests**
  - Strava OAuth login + token exchange route.
  - Dashboard loads from Neon cache and refreshes staleness.
  - Weekly plan generation with `full` and `remaining_days`.
  - Chat persona calls retrieval tools + follow-up tool.
  - Gear retirement toggle persists and affects UI.

- **Unknowns / assumptions to resolve next**
  - Production deployment target (Vercel/self-host) not explicitly documented.
  - No explicit queue/cron worker discovered; heavy recomputations appear request-driven.
  - Runtime enforcement status of prompt contracts is unclear (likely test-only).

## 8) Appendix (Evidence Excerpts)

```90:106:app/api/ai/chat/route.ts
type PlanningState = {
  flow: PlanningFlowIntent;
  confirmed: boolean;
  weeklyPlan: WeeklyPlanRequirements;
  ...
};
const planningStateStore = new Map<string, PlanningState>();
const PLANNING_TTL_MS = 60 * 60 * 1000;
```

```542:559:app/api/ai/chat/route.ts
if (detectRedFlagInput(latestUserText) || reliability.refusalRequired) {
  ...
  return new Response(
    `I can't safely provide diagnosis or emergency guidance in chat...`,
    { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
```

```695:717:app/api/ai/weekly-plan/route.ts
if (effectiveMode === 'remaining_days') {
  ...
  const actualized = buildActualizedWeekContext({
    weekDates,
    sourceSessions: sourcePlanForReplan.sessions as UnifiedSession[],
    activities: weekActivities,
    todayIso,
  });
  lockedPastByDate = actualized.lockedByDate;
}
```

```266:313:src/lib/aiTools.ts
const normalizeIsoDate = (value: unknown): string | undefined => {
  ...
  const embeddedMatch = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  return embeddedMatch?.[0];
};

const normalizeTrainingBlockPatch = (patch: unknown): Record<string, unknown> | unknown => {
  ...
  if (parsedGoalDate) {
    normalized.goalDate = parsedGoalDate;
  }
};
```

```1322:1338:src/lib/aiRetrievalTools.ts
getWeatherForecast: tool({
  description:
    'Get the weather forecast using Open-Meteo...Use to adjust hydration and electrolyte recommendations.',
  inputSchema: z.object({
    days: z.number().optional(),
    city: z.string().optional(),
  }),
  execute: async ({days = 5, city}: {days?: number; city?: string}) => {
```

```1379:1430:src/lib/aiRetrievalTools.ts
// 1b. Fallback: use latest activity coordinates when no city is available.
...
if (!fallback) {
  return {
    weather:
      'No city or activity coordinates available. Ask the athlete for a city, or sync an activity with GPS location data.',
  };
}
```

```1517:1529:src/lib/aiRetrievalTools.ts
let hydrationNote = '';
if (tMax >= 25 && humMax >= 70) {
  hydrationNote = ' [HIGH heat+humidity — increase fluids + electrolytes significantly]';
} else if (tMax >= 25) {
  hydrationNote = ' [WARM — increase fluid intake]';
}
```

```36:57:app/api/db/[table]/route.ts
const DB_ROUTE_ENFORCE_AUTH =
  (process.env.DB_ROUTE_ENFORCE_AUTH ?? 'false').toLowerCase() === 'true';

const enforceDbRouteAccess = (...) => {
  if (!DB_ROUTE_ENFORCE_AUTH) return null;
  ...
};
```

```61:76:src/lib/planSemanticValidators.ts
export const validateCoachWeekOutput = (value: CoachWeekOutput) => {
  const uniqueDates = new Set(value.sessions.map((session) => session.date));
  if (uniqueDates.size !== 7) return {ok: false, reason: 'Coach output must include 7 unique dates'};
  const hardCount = value.sessions.filter((session) => HARD_RUN_TYPES.has(session.type)).length;
  if (hardCount > 4) return {ok: false, reason: `Coach output has too many hard sessions`};
```

```114:129:src/lib/multiAgentContracts.ts
if (isHardRunType(currentCoach.type) && isStrengthPhysioType(currentPhysio.type)) {
  addConflict(conflicts, {
    rule: 'hard_day_no_strength_overlay',
    severity: 'high',
    ...
  });
  physioByDate.set(date, {
    ...currentPhysio,
    type: 'mobility',
  });
}
```

```1:45:drizzle/0016_ai_telemetry_and_readiness.sql
CREATE TABLE IF NOT EXISTS "athlete_readiness_signals" (...);
CREATE INDEX IF NOT EXISTS "athlete_readiness_athlete_idx" ON "athlete_readiness_signals" ("athlete_id");
...
CREATE TABLE IF NOT EXISTS "ai_telemetry_events" (...);
CREATE INDEX IF NOT EXISTS "ai_telemetry_trace_idx" ON "ai_telemetry_events" ("trace_id");
```
