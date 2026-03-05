# Two-Tier Cache Architecture

> **Status:** Implemented  
> **Date:** 2026-02-11  
> **Depends on:** [Remote Database Evaluation](./REMOTE_DATABASE.md)

## Overview

The app uses a two-tier cache-through pattern to balance **persistence**, **multi-device access**, and **data freshness**. Every data request cascades through two layers before hitting the external API. React Query provides in-memory caching for instant reads within a browser session.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (Browser)                                               │
│                                                                 │
│  ┌──────────────┐                                               │
│  │  React Query  │  (in-memory, per-session)                    │
│  │  staleTime    │                                              │
│  └──────┬───────┘                                               │
│         │ miss/stale                                            │
│         ▼                                                       │
│  ┌──────────────────────┐    miss/stale    ┌─────────────────┐  │
│  │  Tier 1              │ ───────────────► │  Tier 2          │  │
│  │  Neon (via API route)│                  │  Strava API      │  │
│  │  (PostgreSQL)        │ ◄─────────────── │  (source of      │  │
│  └──────────────────────┘    write back     │   truth)         │  │
│                                            └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Why two tiers?

| Tier  | Technology        | Purpose                              | Latency      | Survives                   |
| ----- | ----------------- | ------------------------------------ | ------------ | -------------------------- |
| **1** | Neon (PostgreSQL) | Persistent storage, multi-device     | ~50–200 ms   | Forever (server-side)      |
| **2** | Strava API        | Source of truth                      | ~300–1000 ms | N/A (external)             |

**In-memory layer:** React Query caches data in the browser for the duration of a session (~0ms reads after first fetch). It handles deduplication, stale-while-revalidate, and background refetching.

**Key benefit:** Data persists in Neon across devices and browser sessions. No need to re-fetch everything from Strava (which is rate-limited to 100 req/15 min) when switching browsers or clearing local storage.

---

## Data Flow

### Read Flow

Every `cachedGet*` function in `stravaCache.ts` follows this pattern:

```
1. Check Neon (via GET /api/db/[table])
   ├── Fresh? → return data
   └── Miss or stale? → continue

2. Fetch from Strava API
   → Write to Neon (awaitable)
   → Return data
```

React Query wraps these functions and adds an in-memory cache layer:
- If data is in React Query's cache and within `staleTime`, the `cachedGet*` function is never called.
- If data is stale or missing, React Query calls the function which triggers the Neon → Strava cascade.

### Write Flow

Writes go to Neon via awaitable POST requests through `/api/db/[table]`. All writes use PostgreSQL `ON CONFLICT DO UPDATE` (upsert), so repeated writes are idempotent.

---

## Staleness Thresholds

Defined in `src/lib/stravaCache.ts`:

| Data Type        | Max Age           | Rationale                                 |
| ---------------- | ----------------- | ----------------------------------------- |
| Activities list  | 1 hour            | New activities appear frequently          |
| Activity detail  | ∞ (never expires) | Historical data never changes             |
| Activity streams | ∞ (never expires) | Time-series data is immutable             |
| Athlete stats    | 1 hour            | Updates with new activities               |
| Athlete zones    | 24 hours          | Rarely reconfigured                       |
| Athlete gear     | 1 hour            | Shoes/bikes change occasionally           |
| Zone breakdowns  | By `settingsHash` | Invalidated when user changes zone config |

---

## File Map

```
src/
├── db/
│   ├── schema.ts          ← Drizzle ORM schema (PostgreSQL tables)
│   └── index.ts           ← Neon serverless connection (HTTP driver)
├── lib/
│   ├── cacheTypes.ts      ← Shared type definitions for cached records
│   ├── stravaCache.ts     ← Two-tier cache logic (the orchestrator)
│   ├── neonSync.ts        ← Client-side fetch helpers for /api/db/*
│   ├── chatSync.ts        ← Client-side fetch helpers for chat/plan tables
│   └── strava.ts          ← Strava API client + token management
└── hooks/
    └── useStrava.ts       ← React Query hooks (call stravaCache functions)

app/
└── api/
    └── db/
        └── [table]/
            └── route.ts   ← Dynamic API route (GET + POST for all tables)

drizzle.config.ts          ← Drizzle Kit config (migrations, push)
```

---

## Database Tables (Neon)

Data is stored as JSONB blobs with metadata columns.

| Table              | Primary Key            | Data Column(s)                           | Metadata                                                                                        |
| ------------------ | ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `activities`       | `id` (bigint)          | `data` (jsonb)                           | `athlete_id`, `date`, `fetched_at`                                                             |
| `activity_details` | `id` (bigint)          | `data` (jsonb)                           | `athlete_id`, `fetched_at`                                                                     |
| `activity_streams` | `activity_id` (bigint) | `data` (jsonb)                           | `athlete_id`, `fetched_at`                                                                     |
| `activity_labels`  | `id` (bigint)          | `data` (jsonb)                           | `athlete_id`, `computed_at`                                                                    |
| `athlete_stats`    | `athlete_id` (bigint)  | `data` (jsonb)                           | `fetched_at`                                                                                    |
| `athlete_zones`    | `key` (text)           | `data` (jsonb)                           | `athlete_id`, `fetched_at`                                                                     |
| `athlete_gear`     | `key` (text)           | `bikes`, `shoes` (jsonb)                 | `athlete_id`, `fetched_at`                                                                     |
| `zone_breakdowns`  | `activity_id` (bigint) | `zones` (jsonb)                          | `athlete_id`, `settings_hash`, `computed_at`                                                   |
| `user_settings`    | `athlete_id` (bigint)  | `zones`, `allergies`, `injuries` (jsonb) | `max_hr`, `resting_hr`, `goal`, `food_preferences`, `ai_model`, `updated_at`                    |
| `chat_sessions`    | `id` (text)            | —                                        | `athlete_id`, `persona`, `title`, `summary`, `message_count`, `created_at`, `updated_at`        |
| `chat_messages`    | `id` (text)            | —                                        | `session_id`, `role`, `content`, `created_at`                                                   |
| `coach_plans`      | `id` (text)            | `sessions` (jsonb)                       | `athlete_id`, `title`, `summary`, `goal`, `duration_weeks`, `content`, `is_active`, `shared_at` |

---

## API Routes

A single dynamic route handles all tables:

### `GET /api/db/[table]`

Returns all records or a single record filtered by primary key.

```
GET /api/db/activities?athleteId=123                   → all activities for athlete (array)
GET /api/db/activity-details?athleteId=123&pk=123      → single record or null
GET /api/db/activity-streams?athleteId=123&pk=456      → single record or null
GET /api/db/athlete-stats?pk=789    → single record or null
GET /api/db/athlete-zones?athleteId=123                → single record or null
GET /api/db/athlete-gear?athleteId=123                 → single record or null
GET /api/db/zone-breakdowns?athleteId=123&pk=123       → single record or null
```

### `POST /api/db/[table]`

Upserts one or many records. Accepts a single object or an array.

```json
POST /api/db/activities
Body: [{"id": 123, "athleteId": 123, "data": {...}, "date": "2026-01-15", "fetchedAt": 1707500000000}]
Response: {"success": true, "count": 1}
```

Uses PostgreSQL `ON CONFLICT DO UPDATE` so existing records are overwritten with fresh data.

---

## Client Sync Modules

### `neonSync.ts` — Strava data tables

| Function                          | Direction      | Blocking?       |
| --------------------------------- | -------------- | --------------- |
| `neonGetActivities(athleteId)`             | Read (all)     | Yes (awaitable) |
| `neonGetActivityDetail(athleteId, id)`     | Read (by PK)   | Yes (awaitable) |
| `neonGetActivityStreams(athleteId, id)`    | Read (by PK)   | Yes (awaitable) |
| `neonGetAthleteStats(id)`         | Read (by PK)   | Yes (awaitable) |
| `neonGetAthleteZones(athleteId)`  | Read (by athlete) | Yes (awaitable) |
| `neonGetAthleteGear(athleteId)`   | Read (by athlete) | Yes (awaitable) |
| `neonGetZoneBreakdown(athleteId, id)` | Read (by PK) | Yes (awaitable) |
| `neonSyncActivities(records)`     | Write (bulk)   | Yes (awaitable) |
| `neonSyncActivityDetail(record)`  | Write (single) | Yes (awaitable) |
| `neonSyncActivityStreams(record)` | Write (single) | Yes (awaitable) |
| `neonSyncAthleteStats(record)`    | Write (single) | Yes (awaitable) |
| `neonSyncAthleteZones(record)`    | Write (single) | Yes (awaitable) |
| `neonSyncAthleteGear(record)`     | Write (single) | Yes (awaitable) |
| `neonSyncZoneBreakdown(record)`   | Write (single) | Yes (awaitable) |

### `chatSync.ts` — Chat, messages, and coach plan tables

All functions are awaitable (both reads and writes).

---

## Graceful Degradation

| Scenario             | Behavior                                                       |
| -------------------- | -------------------------------------------------------------- |
| Neon is down         | Strava API is called directly; writes fail silently with a log |
| New device / browser | Neon provides all data without re-fetching from Strava         |
| Strava rate-limited  | Neon serves cached data until limits reset                     |

---

## CLI Commands

```bash
npm run db:push       # Push schema changes to Neon (quick for dev)
npm run db:generate   # Generate SQL migration files from schema changes
npm run db:migrate    # Run pending migrations against Neon
npm run db:studio     # Open Drizzle Studio (visual DB browser)
```

---

## Environment Variables

```bash
# In .env.local (server-side only, never committed)
DATABASE_URL=postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
```

**Important:** No `NEXT_PUBLIC_` prefix — the connection string stays server-side. The client communicates with Neon exclusively through the `/api/db/[table]` route.

---

## User Settings Sync

User settings (HR zones, training goal, injuries, allergies, food preferences, AI model) are stored in `localStorage` and synced to Neon's `user_settings` table. This enables **server-side AI retrieval tools** to access athlete settings without a client round-trip.

### Sync path

```
localStorage (mamoot-settings:{athleteId})
  ─── awaitable POST /api/db/user-settings ───►  Neon (user_settings table)
```

- **On save**: After every `updateSettings()` call, a POST upserts the settings to Neon.
- **On startup (backfill)**: When the athlete first authenticates, the `SettingsSyncBridge` component pushes current settings to Neon if they haven't been synced yet.

### Who reads from where

| Consumer           | Reads From                           | Why                           |
| ------------------ | ------------------------------------ | ----------------------------- |
| UI components      | `localStorage` (via `useSettings()`) | Instant, no network           |
| @-mention resolver | Neon (via API routes)                | Client-side, persistent       |
| AI retrieval tools | Neon (`user_settings`)               | Server-side, no client access |

See [AI Context documentation](./AI_CONTEXT.md) for details on the dual context strategy.

---

## Future Improvements

- [ ] **Schema normalization** — Extract key fields from JSONB into proper columns for faster SQL queries (pace trends, weekly mileage, PR tracking)
- [ ] **API route authentication** — Add a session check or API key to the `/api/db/*` routes for production deployments
- [ ] **Selective fetching** — For activities, fetch only records newer than what Neon already has instead of transferring the full list
- [ ] **Connection pooling** — Switch from Neon HTTP driver to WebSocket driver if query volume increases
- [ ] **Offline support** — Add a service worker or lightweight IndexedDB layer if offline access is needed

---

## Multi-Account Regression Checklist

Run this sequence when validating shared-browser multi-user behavior:

1. Login with athlete A, sync, and confirm activities/zones/gear/settings load correctly.
2. Logout, login with athlete B, sync, and confirm no athlete A data appears.
3. Switch back to athlete A and verify A's prior data is still intact.
4. Verify weekly plan and mention popup sub-items are scoped to active athlete only.
5. Verify `/api/db/*` calls for activity-family tables include `athleteId` query param.
