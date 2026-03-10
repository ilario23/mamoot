# Planning Stack Hardening Investigation

Date: 2026-03-10
Branch: `dev`

## Objective Checklist

- [x] 1) Chat runtime guardrails (retrieval-first + required follow-ups)
- [x] 2) Date + timezone correctness (ISO date required, shared Monday helper)
- [x] 3) Nutrition fail-closed on unknown allergies unless override
- [x] 4) ACWR >= 1.5 risk gate + override path
- [x] 5) Durable planning state (replace in-memory Map+TTL)
- [x] 6) Precompute jobs (labels + week zone rollups)
- [x] 7) DB gateway auth default enforced in production + tests
- [~] 8) Strava token broker via HttpOnly cookies (no localStorage tokens)
- [x] 9) Hot-path indexes + perf budgets docs
- [x] 10) Degraded/repair modes documented in Architecture.md

## Current Behavior + Gaps

### 1) Chat guardrails

- `app/api/ai/chat/route.ts` registers retrieval tools and `suggestFollowUps`, but currently relies on prompt instructions only; there is no hard runtime enforcement before responding.
- The route logs tool calls in `onStepFinish`, but does not block advice if no retrieval tool was called and does not fail closed when `suggestFollowUps` is missing.

### 2) Date/time correctness

- `src/lib/aiTools.ts` has `planSessionSchema.date` and `physioSessionSchema.date` optional; this permits non-rest sessions without dates.
- Monday/week boundaries are duplicated across files with `Date` + `toISOString().slice(0, 10)`:
  - `app/api/ai/chat/route.ts`
  - `app/api/ai/weekly-plan/route.ts`
  - `app/api/ai/training-block/route.ts`
  - `src/lib/aiRetrievalTools.ts`
  - `src/lib/weekReview.ts`
- This can drift and produce off-by-one behavior around timezone changes/travel.

### 3) Nutrition safety

- There is no dedicated nutrition generation route; nutrition is served via chat persona.
- `src/lib/aiPrompts.ts` includes allergy safety instructions, but `app/api/ai/chat/route.ts` does not enforce fail-closed behavior when allergy data is unknown/missing.

### 4) ACWR risk gates

- `app/api/ai/weekly-plan/route.ts` computes ACWR and includes it in context, but does not enforce blocking/capping policy for high-risk ACWR (`>= 1.5`) unless user explicitly overrides.

### 5) Planning durability

- `app/api/ai/chat/route.ts` stores planning flow state in `Map<string, PlanningState>` with 1h TTL cleanup.
- State is lost on restart/scale-out and cannot be resumed across instances.

### 6) Precompute performance

- `src/lib/aiRetrievalTools.ts` computes labels on-demand (`fetchOrComputeLabels`) and weekly zone aggregation on read.
- No nightly/rolling precompute endpoint/job exists for label warmup + week rollups.

### 7) DB gateway auth defaults

- `app/api/db/[table]/route.ts` currently defaults `DB_ROUTE_ENFORCE_AUTH` to `false`.
- This is risky in production if env var is omitted.

### 8) Strava token handling

- `src/lib/strava.ts` persists access/refresh tokens in `localStorage`.
- `app/api/strava/token/route.ts` proxies exchange/refresh but does not issue HttpOnly auth cookies.

### 9) Indexes and perf budgets

- Existing indexes include `activities(athlete_id,date)` and `zone_breakdowns(athlete_id,activity_id)`.
- Missing explicit `weekly_plans(athlete_id,is_active,created_at)` hot-path index.
- No dedicated `docs/perf-budgets.md` with p95 targets exists.

### 10) Degraded/repair modes

- Weekly plan route has repair flow for distribution and remaining-days locking.
- Training block route has adaptation + physio safety review.
- There is no single architecture document that summarizes degraded paths (missing PRs/zones/injuries/missing source plan behavior and repair decisions).

## Open Questions

- For objective #8, should we fully remove browser-side direct Strava API calls now, or introduce a staged broker-compatible fallback to avoid breaking existing sync UX in this PR?
- For objective #5, preferred durable store: Neon table (available now) or external Redis (not currently wired in repository)?

## Implemented Changes (This Iteration)

- Added runtime guardrails in `app/api/ai/chat/route.ts`:
  - retrieval-first violation blocks with `422`
  - missing `suggestFollowUps` blocks with `422`
  - guardrail violations are traced via `logAiTrace(..., 'guardrail_violation', ...)`
- Added nutrition fail-closed in chat route (`412`) unless `allowUnknownAllergies=true`.
- Added durable planning storage in Neon (`ai_planning_state`) and switched planning flow state reads/writes from in-memory map to DB.
- Added resume token in planning tool responses (`resumeToken` = `athleteId:sessionId` key).
- Added shared week/date helpers in `src/lib/weekTime.ts` and integrated in:
  - `app/api/ai/chat/route.ts`
  - `app/api/ai/weekly-plan/route.ts`
  - `src/lib/aiRetrievalTools.ts`
  - `src/lib/weekReview.ts`
- Enforced date presence for non-rest/non-recovery session schemas in `src/lib/aiTools.ts`.
- Added ACWR risk gate and override logic in:
  - `app/api/ai/weekly-plan/route.ts`
  - `app/api/ai/training-block/route.ts`
- Added precompute endpoint: `app/api/jobs/ai-precompute/route.ts`.
- Flipped DB route auth default to enforced in production + added startup assertion in `app/api/db/[table]/route.ts`.
- Added integration-style auth tests in `src/lib/dbRouteAuth.test.ts`.
- Added migration `drizzle/0019_planning_hardening.sql` for:
  - `ai_planning_state`
  - `weekly_zone_rollups`
  - hot-path indexes (including `weekly_plans` active fetch index).
- Added documentation:
  - `docs/perf-budgets.md`
  - `Architecture.md`

