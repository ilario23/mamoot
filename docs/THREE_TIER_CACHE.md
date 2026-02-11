# Three-Tier Cache Architecture

> **Status:** Implemented  
> **Date:** 2026-02-09  
> **Depends on:** [Remote Database Evaluation](./REMOTE_DATABASE.md)

## Overview

The app uses a three-tier cache-through pattern to balance **speed**, **persistence**, and **data freshness**. Every data request cascades through three layers before hitting the external API.

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (Browser)                                               │
│                                                                 │
│  ┌──────────────┐    miss/stale    ┌──────────────────────┐     │
│  │  Tier 1      │ ───────────────► │  Tier 2              │     │
│  │  Dexie       │ ◄─────────────── │  Neon (via API route)│     │
│  │  (IndexedDB) │    hydrate       │  (PostgreSQL)        │     │
│  └──────────────┘                  └──────────┬───────────┘     │
│         │                                     │                 │
│         │ miss/stale                          │ miss/stale      │
│         ▼                                     ▼                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Tier 3 — Strava API (source of truth)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                      │
│                          │ write to both                        │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │ Dexie.put() (sync)    │                          │
│              │ Neon POST (async f&f) │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### Why three tiers?

| Tier  | Technology        | Purpose                          | Latency      | Survives                   |
| ----- | ----------------- | -------------------------------- | ------------ | -------------------------- |
| **1** | Dexie (IndexedDB) | Instant reads, offline support   | ~1 ms        | Page reload (same browser) |
| **2** | Neon (PostgreSQL) | Persistent storage, multi-device | ~50–200 ms   | Forever (server-side)      |
| **3** | Strava API        | Source of truth                  | ~300–1000 ms | N/A (external)             |

**Key benefit:** If you clear browser data or switch devices, Tier 2 (Neon) still has all your data — no need to re-fetch everything from Strava (which is rate-limited to 100 req/15 min).

---

## Data Flow

### Read Flow

Every `cachedGet*` function in `stravaCache.ts` follows this pattern:

```
1. Check Dexie (IndexedDB)
   ├── Fresh? → return data + backfill Neon (fire-and-forget)
   └── Miss or stale? → continue

2. Check Neon (via GET /api/db/[table])
   ├── Fresh? → hydrate Dexie, return
   └── Miss or stale? → continue

3. Fetch from Strava API
   → Write to Dexie (synchronous)
   → Write to Neon (fire-and-forget POST)
   → Return data
```

### Write Flow

Writes happen in two directions simultaneously:

- **Dexie:** Synchronous `db.put()` / `db.bulkPut()` — blocks until complete so subsequent reads hit cache
- **Neon:** Asynchronous `fetch()` POST — fire-and-forget, never blocks the UI. If Neon is unreachable, the write silently fails and the app continues working with Dexie only.

### Neon Backfill

When Neon is added to an existing install that already has data in Dexie, the Neon tables start empty. To populate them without requiring a manual re-fetch from Strava:

- **On every Dexie cache hit**, the record is also fire-and-forget synced to Neon.
- **For activities (bulk)**, a `sessionStorage` flag ensures the full list is only synced once per browser session to avoid redundant uploads.
- **For single-record tables** (details, streams, zones, gear, breakdowns), each record is synced individually as it's accessed — the overhead is negligible.
- All writes use PostgreSQL `ON CONFLICT DO UPDATE` (upsert), so repeated syncs are idempotent.

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
│   ├── schema.ts          ← Drizzle ORM schema (7 PostgreSQL tables)
│   └── index.ts           ← Neon serverless connection (HTTP driver)
├── lib/
│   ├── db.ts              ← Dexie (IndexedDB) schema + helpers
│   ├── stravaCache.ts     ← Three-tier cache logic (the orchestrator)
│   ├── neonSync.ts        ← Client-side fetch helpers for /api/db/*
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

All tables mirror the Dexie/IndexedDB schema where applicable. Data is stored as JSONB blobs with metadata columns.

| Table              | Primary Key            | Data Column(s)                           | Metadata                                                                                        |
| ------------------ | ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `activities`       | `id` (bigint)          | `data` (jsonb)                           | `date`, `fetched_at`                                                                            |
| `activity_details` | `id` (bigint)          | `data` (jsonb)                           | `fetched_at`                                                                                    |
| `activity_streams` | `activity_id` (bigint) | `data` (jsonb)                           | `fetched_at`                                                                                    |
| `athlete_stats`    | `athlete_id` (bigint)  | `data` (jsonb)                           | `fetched_at`                                                                                    |
| `athlete_zones`    | `key` (text)           | `data` (jsonb)                           | `fetched_at`                                                                                    |
| `athlete_gear`     | `key` (text)           | `bikes`, `shoes` (jsonb)                 | `fetched_at`                                                                                    |
| `zone_breakdowns`  | `activity_id` (bigint) | `zones` (jsonb)                          | `settings_hash`, `computed_at`                                                                  |
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
GET /api/db/activities             → all activities (array)
GET /api/db/activity-details?pk=123 → single record or null
GET /api/db/activity-streams?pk=456 → single record or null
GET /api/db/athlete-stats?pk=789    → single record or null
GET /api/db/athlete-zones?pk=athlete-zones → single record or null
GET /api/db/athlete-gear?pk=athlete-gear   → single record or null
GET /api/db/zone-breakdowns?pk=123  → single record or null
```

### `POST /api/db/[table]`

Upserts one or many records. Accepts a single object or an array.

```json
POST /api/db/activities
Body: [{"id": 123, "data": {...}, "date": "2026-01-15", "fetchedAt": 1707500000000}]
Response: {"success": true, "count": 1}
```

Uses PostgreSQL `ON CONFLICT DO UPDATE` so existing records are overwritten with fresh data.

---

## Client Sync Module (`neonSync.ts`)

Typed helper functions that `stravaCache.ts` imports:

| Function                          | Direction      | Blocking?            |
| --------------------------------- | -------------- | -------------------- |
| `neonGetActivities()`             | Read (all)     | Yes (awaitable)      |
| `neonGetActivityDetail(id)`       | Read (by PK)   | Yes (awaitable)      |
| `neonGetActivityStreams(id)`      | Read (by PK)   | Yes (awaitable)      |
| `neonGetAthleteStats(id)`         | Read (by PK)   | Yes (awaitable)      |
| `neonGetAthleteZones(key)`        | Read (by PK)   | Yes (awaitable)      |
| `neonGetAthleteGear(key)`         | Read (by PK)   | Yes (awaitable)      |
| `neonGetZoneBreakdown(id)`        | Read (by PK)   | Yes (awaitable)      |
| `neonSyncActivities(records)`     | Write (bulk)   | No (fire-and-forget) |
| `neonSyncActivityDetail(record)`  | Write (single) | No (fire-and-forget) |
| `neonSyncActivityStreams(record)` | Write (single) | No (fire-and-forget) |
| `neonSyncAthleteStats(record)`    | Write (single) | No (fire-and-forget) |
| `neonSyncAthleteZones(record)`    | Write (single) | No (fire-and-forget) |
| `neonSyncAthleteGear(record)`     | Write (single) | No (fire-and-forget) |
| `neonSyncZoneBreakdown(record)`   | Write (single) | No (fire-and-forget) |

All read functions return `null` on any error — Neon is **optional**, the app degrades gracefully to Dexie + Strava.

---

## Graceful Degradation

The system is designed to work even when tiers are unavailable:

| Scenario             | Behavior                                                      |
| -------------------- | ------------------------------------------------------------- |
| Neon is down         | App works normally with Dexie + Strava (original behavior)    |
| Browser data cleared | Neon provides all data without re-fetching from Strava        |
| New device / browser | Neon hydrates Dexie on first load                             |
| Offline              | Dexie serves cached data; Neon and Strava calls fail silently |
| Strava rate-limited  | Dexie and Neon serve cached data until limits reset           |

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
localStorage (runteam-settings)
  ─── fire-and-forget POST /api/db/user-settings ───►  Neon (user_settings table)
```

- **On save**: After every `updateSettings()` call, a fire-and-forget POST upserts the settings to Neon.
- **On startup (backfill)**: When the athlete first authenticates, the `SettingsSyncBridge` component pushes current settings to Neon if they haven't been synced yet.
- **Staleness**: Settings change infrequently; the ~100-500ms write delay is acceptable.

### Who reads from where

| Consumer           | Reads From                           | Why                           |
| ------------------ | ------------------------------------ | ----------------------------- |
| UI components      | `localStorage` (via `useSettings()`) | Instant, no network           |
| @-mention resolver | Dexie / `localStorage`               | Client-side, fast             |
| AI retrieval tools | Neon (`user_settings`)               | Server-side, no client access |

See [AI Context documentation](./AI_CONTEXT.md) for details on the dual context strategy.

---

## Future Improvements

- [ ] **Schema normalization** — Extract key fields from JSONB into proper columns for faster SQL queries (pace trends, weekly mileage, PR tracking)
- [x] **Dexie → Neon backfill** — When Dexie has data but Neon is empty, records are fire-and-forget synced on cache hit (implemented via backfill on Tier 1 hits)
- [x] **User settings sync** — localStorage settings synced to Neon for server-side AI tool access
- [ ] **API route authentication** — Add a session check or API key to the `/api/db/*` routes for production deployments
- [ ] **Selective fetching** — For activities, fetch only records newer than what Neon already has instead of transferring the full list
- [ ] **Connection pooling** — Switch from Neon HTTP driver to WebSocket driver if query volume increases
