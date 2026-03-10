# Performance Budgets

These p95 targets are for hot AI planning/retrieval paths in normal load.

## Query/Path Targets (p95)

- `recent activities + labels` (`activities` + `activity_labels`): <= 180 ms
- `zone breakdown aggregation` (`zone_breakdowns` by athlete/activity): <= 140 ms
- `active weekly plan fetch` (`weekly_plans` active row): <= 80 ms
- `plan-vs-actual week review assembly`: <= 260 ms
- `chat retrieval bundle` (2-3 retrieval calls in one turn): <= 550 ms

## Required Indexes

- `activities (athlete_id, date DESC)`
- `zone_breakdowns (athlete_id, activity_id)`
- `weekly_plans (athlete_id, is_active, created_at DESC)`
- `ai_planning_state (athlete_id, session_id)` and `ai_planning_state (expires_at)`

## Precompute Expectations

- Nightly or rolling precompute should warm:
  - `activity_labels` for latest synced activities
  - `weekly_zone_rollups` for recent weeks
- Job target:
  - <= 2.5s per athlete for latest 80 activities and 8 weeks rollups
