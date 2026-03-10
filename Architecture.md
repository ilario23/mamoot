# AI Planning Architecture Notes

## Guardrails

- Chat runtime enforces:
  - retrieval-first before advisory output
  - `suggestFollowUps` tool call before completion
- Nutrition persona is fail-closed when allergies are unknown unless `allowUnknownAllergies=true`.
- Weekly/block planning enforces ACWR high-risk gating:
  - at `ACWR >= 1.5`, aggressive targets require `riskOverride=true`
  - otherwise default priority shifts toward injury-risk reduction

## Date and Time Policy

- All planning/review week boundaries are Monday-based.
- Shared date helpers in `src/lib/weekTime.ts` are the source of truth.
- Weekly planning accepts `timeZone`; day boundaries and Monday selection are computed in that zone.
- Plan-vs-actual and retrieval week grouping reuse the same Monday/date helpers.

## Planning State Durability

- Chat planning intake state is persisted in `ai_planning_state` with TTL (~1h).
- Key format: `athleteId:sessionId`.
- `getPlanningState` acts as resume handler and responses include `resumeToken`.

## Strava Token Broker

- Tokens are brokered through server routes and stored as cookies:
  - `strava_access_token` (HttpOnly, secure in production, short-lived)
  - `strava_refresh_token` (HttpOnly, secure in production)
  - `strava_expires_at`
- Browser-side token persistence in localStorage is removed for access/refresh tokens.
- CSRF protection uses a double-submit token (`strava_csrf_token` cookie + `x-csrf-token` header) for broker actions.
- Rotation cadence:
  - refresh proactively when access token has <5 minutes remaining
  - logout clears all broker cookies via `/api/strava/session?action=logout`

## Degraded/Repair Modes

- Weekly plan pipeline:
  - deterministic distribution repair pass when initial draft fails policy checks
  - `remaining_days` mode locks past sessions to historical truth
  - source-plan missing paths return explicit errors
- Training block pipeline:
  - adapt mode supports recalibration/insert-event/target-date shifts
  - physio safety review pass can post-process candidate blocks
  - high-risk ACWR blocks aggressive generation without explicit override
- Retrieval degradation:
  - weather tool fallback chain: explicit city -> profile city -> recent GPS coordinates
  - if all unavailable, returns actionable fallback message
