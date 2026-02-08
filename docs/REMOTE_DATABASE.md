# Remote Database — Provider Evaluation

> **Status:** Research / Future Implementation  
> **Date:** 2026-02-08  
> **Current setup:** Dexie.js (IndexedDB) client-side cache (`src/lib/db.ts`)

## Context

The app currently stores all Strava data locally in the browser using Dexie.js (IndexedDB). This document evaluates remote database providers for a future migration that would enable server-side persistence, multi-device access, and more powerful analytics.

### Current Data Model

| Table             | Primary Key  | Description                                    |
| ----------------- | ------------ | ---------------------------------------------- |
| `activities`      | `id`         | Strava summary activities (indexed by `date`)  |
| `activityDetails` | `id`         | Full detailed activity payloads                |
| `activityStreams` | `activityId` | Time-series data (HR, pace, cadence, etc.)     |
| `athleteStats`    | `athleteId`  | Aggregate stats (recent, YTD, all-time totals) |
| `athleteZones`    | `key`        | Heart rate and power zones                     |

---

## Provider Comparison

### 1. Supabase (PostgreSQL)

**What it is:** Open-source Firebase alternative built on top of PostgreSQL.

**Pros:**

- Generous free tier (500 MB database, 1 GB file storage, 50k monthly active users)
- First-class TypeScript support and auto-generated types from the schema
- Built-in Row Level Security (RLS) — perfect for multi-user if we ever expand
- Real-time subscriptions out of the box (could live-update dashboards)
- JS client (`@supabase/supabase-js`) that works well in both client and server components
- PostgreSQL is powerful for queries — complex aggregations on activity data (monthly mileage, pace progression) directly in SQL
- Built-in auth (could complement the Strava OAuth flow)
- Edge Functions for server-side logic
- Great Next.js integration with SSR helpers

**Cons:**

- Free tier pauses after 1 week of inactivity (need to ping it or upgrade)
- PostgreSQL can feel heavy if just storing JSON blobs — ideally normalize the schema to get full value
- Slightly more setup overhead compared to NoSQL (need to define tables, migrations)
- Real-time and auth features may be overkill for a single-user dashboard

---

### 2. Neon (Serverless PostgreSQL)

**What it is:** Serverless PostgreSQL with auto-scaling and branching.

**Pros:**

- Truly serverless — scales to zero (no cost when idle)
- Free tier: 0.5 GiB storage, 191 compute hours/month — very generous for a personal project
- No inactivity pause on free tier (unlike Supabase)
- PostgreSQL power for complex activity queries
- Database branching (great for dev/staging workflows)
- Works perfectly with Drizzle ORM or Prisma
- Native `@neondatabase/serverless` driver optimized for edge/serverless

**Cons:**

- No built-in auth, real-time, or file storage (just a database)
- Cold starts on serverless connections (mitigated by their connection pooler)
- Requires an ORM or query builder (Drizzle recommended)

---

### 3. Turso (libSQL / SQLite at the Edge)

**What it is:** Distributed SQLite-compatible database built on libSQL.

**Pros:**

- Extremely generous free tier (9 GB storage, 500 databases, 25 billion row reads/month)
- Embedded replicas — can sync a local SQLite copy for blazing fast reads (conceptually similar to the current Dexie approach, but server-backed)
- Very low latency (edge-distributed)
- Lightweight — SQLite is simpler than PostgreSQL
- Great TypeScript SDK (`@libsql/client`)
- Works well with Drizzle ORM

**Cons:**

- SQLite has limitations vs. PostgreSQL (no advanced JSON operators, limited concurrent writes)
- Smaller ecosystem and community compared to PostgreSQL-based solutions
- Less mature tooling for migrations
- Not ideal if activity streams data gets very large (SQLite has size limits per row)

---

### 4. MongoDB Atlas (MongoDB)

**What it is:** Cloud-hosted NoSQL document database.

**Pros:**

- Strava data is already JSON — zero schema mapping needed. Raw Strava payloads can be stored as-is
- Free tier: 512 MB storage (M0 cluster)
- Flexible schema — easy to evolve as more data types are added
- Powerful aggregation pipeline for analytics on running data
- Great TypeScript support with the official driver or Mongoose
- Time-series collections are a native feature — perfect for activity streams

**Cons:**

- No relations (harder to join activities with user settings, zones, etc.)
- Aggregation pipeline syntax has a steep learning curve
- Free cluster is shared and can be slow
- Heavier client library compared to SQL alternatives
- Vendor lock-in on query syntax (not standard SQL)

---

### 5. Firebase Firestore (Google Cloud)

**What it is:** Google's serverless NoSQL document database.

**Pros:**

- Very generous free tier (1 GiB storage, 50k reads/day, 20k writes/day)
- Real-time listeners (live dashboard updates)
- Offline persistence built-in (similar to the current Dexie caching strategy)
- Simple SDK, works on both client and server
- Scales automatically

**Cons:**

- Pricing based on reads/writes, not storage — can get expensive with time-series streams data (lots of reads)
- Limited query capabilities (no joins, no complex aggregations)
- Vendor lock-in to Google ecosystem
- Not great for complex analytical queries on running data
- TypeScript DX has improved but still feels less native than alternatives

---

### 6. Vercel Postgres (powered by Neon)

**What it is:** Vercel's managed PostgreSQL offering (Neon under the hood).

**Pros:**

- Tightest integration if deploying on Vercel (zero config, env vars auto-populated)
- Same serverless PostgreSQL benefits as Neon
- Works with Drizzle, Prisma, or raw SQL
- Free on Vercel Hobby plan (limited)

**Cons:**

- Locked to Vercel's platform
- Smaller free tier than standalone Neon
- Vercel's markup over raw Neon pricing
- Less flexibility if moving away from Vercel

---

## Recommendation

| Priority              | Provider          | Rationale                                                                                                                                 |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Top pick**          | **Supabase**      | Best all-rounder. PostgreSQL gives powerful analytics, built-in auth could simplify OAuth, excellent TS DX. RLS enables multi-user later. |
| **Runner-up**         | **Neon**          | "Just a database" with no extra features. No inactivity pause, truly serverless. Pairs well with Drizzle ORM.                             |
| **Easiest migration** | **MongoDB Atlas** | Closest to the current Dexie model (document store). Least schema work. Best for storing raw Strava JSON payloads without normalization.  |

### Key Decision Point

> **Normalize into a relational schema** (Supabase or Neon + Drizzle) → more powerful queries for analytics (pace trends, weekly volume, PR tracking).  
> **Keep storing raw JSON documents** (MongoDB Atlas) → fastest migration path from the current `db.ts` / Dexie setup.

---

## Migration Notes

When implementing, consider:

1. **Keep Dexie as a local cache layer** on top of the remote DB for offline support and reduced API calls
2. **Use Next.js API routes** (`app/api/`) as a proxy between client and remote DB to keep credentials server-side
3. **Migrate the `stravaCache.ts` cache-through pattern** to check local cache → remote DB → Strava API (three-tier caching)
4. **Schema design** should account for the `fetchedAt` staleness pattern already established in `db.ts`
