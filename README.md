# RunTeam AI

AI-powered running analytics dashboard with real-time Strava integration, built with a bold Neo-Brutalist design system.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss)

---

## Overview

RunTeam AI connects to your Strava account to pull activity data and present it through rich, interactive charts and analytics. It features per-kilometer splits, heart rate zone distribution, segment tracking, personal records, and an AI coaching team — all wrapped in a distinctive Neo-Brutalist UI with thick borders, flat colors, and bold typography.

---

## Features

- **Dashboard** — Weekly volume, training load, and pace zone distribution at a glance
- **Activity Browser** — Filterable list of all synced activities with key stats
- **Activity Detail** — Synchronized pace/HR/elevation charts, interactive Leaflet map, splits table, and segment efforts
- **Calendar** — Monthly view of training volume with daily activity summaries
- **Segments** — Starred segment tracking with effort history and progression charts
- **Personal Records** — PR tracking across distances with pace progression over time
- **AI Team Chat** — Mock AI coaching personas (Coach, Nutritionist, Physio) with contextual advice
- **Settings** — Strava OAuth connection, HR zone configuration, and data sync management

---

## Tech Stack

| Layer          | Technology                                      |
| -------------- | ----------------------------------------------- |
| Framework      | Next.js 16 (App Router)                         |
| Language       | TypeScript 5                                    |
| UI Components  | shadcn/ui + Radix UI primitives                 |
| Styling        | Tailwind CSS 3                                  |
| Charts         | Recharts                                        |
| Maps           | Leaflet + React Leaflet                         |
| Data Fetching  | TanStack React Query                            |
| Cloud Database | Neon PostgreSQL + Drizzle ORM                   |
| Forms          | React Hook Form + Zod validation                |
| Font           | Space Grotesk                                   |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (recommended: install via [nvm](https://github.com/nvm-sh/nvm))
- A **Strava API application** — create one at [strava.com/settings/api](https://www.strava.com/settings/api)

### Setup

```sh
# Clone the repository
git clone https://github.com/your-username/run-zone-ai.git
cd run-zone-ai

# Install dependencies
npm install

# Copy the environment template and fill in your Strava credentials
cp .env.example .env.local

# Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**.

### Environment Variables

| Variable                          | Description                        | Required |
| --------------------------------- | ---------------------------------- | -------- |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID`    | Your Strava app's Client ID       | Yes      |
| `NEXT_PUBLIC_STRAVA_REDIRECT_URI` | OAuth callback URL                 | Yes      |
| `STRAVA_CLIENT_SECRET`            | Your Strava app's Client Secret    | Yes      |
| `DATABASE_URL`                    | Neon PostgreSQL connection string   | Yes      |

> The client secret and database URL are only used server-side and are never exposed to the browser.

---

## Project Structure

```
run-zone-ai/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/strava/token/   # Server-side OAuth token exchange
│   ├── activities/         # Activities list page
│   ├── activity/[id]/      # Activity detail page
│   ├── ai-chat/            # AI coaching chat page
│   ├── calendar/           # Calendar view page
│   ├── records/            # Personal records page
│   ├── segments/           # Segments page
│   ├── settings/           # Settings & Strava connection page
│   ├── layout.tsx          # Root layout with providers
│   └── page.tsx            # Dashboard (home)
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── activities/     # Activity list & filters
│   │   ├── activity/       # Detail view charts, map, tables
│   │   ├── calendar/       # Calendar grid & summary cards
│   │   ├── dashboard/      # Stat cards, volume chart, zone distribution
│   │   ├── layout/         # App shell, sidebar, bottom nav
│   │   ├── records/        # PR cards, progression charts
│   │   ├── segments/       # Segment cards, effort history
│   │   └── ui/             # shadcn/ui primitives
│   ├── contexts/           # React contexts (Settings, Strava Auth)
│   ├── hooks/              # Custom hooks (useStrava, usePageTheme, etc.)
│   ├── db/                 # Drizzle ORM schema & Neon connection
│   ├── lib/                # Utilities, Strava API client, caching
│   └── views/              # Page-level view components
├── docs/                   # Technical documentation
│   ├── TWO_TIER_CACHE.md   # Cache architecture (Neon → Strava)
│   ├── STRAVA_API.md       # Strava API reference & data models
│   └── REMOTE_DATABASE.md  # Remote DB provider evaluation
├── drizzle/                # Database migrations
└── public/                 # Static assets
```

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start development server on port 3000 |
| `npm run build` | Create production build              |
| `npm run start` | Start production server              |
| `npm run lint`  | Run ESLint                           |
| `npm run db:push` | Push schema changes to Neon (dev)  |
| `npm run db:generate` | Generate migration files         |
| `npm run db:migrate`  | Run pending migrations           |
| `npm run db:studio`   | Open Drizzle Studio              |

---

## Design System

The app uses a **Neo-Brutalist** visual identity:

- **Font:** Space Grotesk (Bold/Black headings, Medium body)
- **Colors:** White backgrounds, solid black borders (3px+), vibrant flat accents — Magenta (`#FF58E5`), Electric Blue (`#3B82F6`), Bright Yellow (`#FACC15`)
- **Components:** Thick black borders, hard offset drop shadows (no blur), mix of sharp rectangles and pill-shaped elements
- **No gradients, no soft shadows** — everything is flat and bold

---

## Data Flow

1. User authenticates via Strava OAuth (authorization code flow)
2. Access tokens are exchanged server-side through `app/api/strava/token/route.ts`
3. Activity data is fetched from the Strava V3 API and cached in Neon PostgreSQL
4. TanStack React Query provides in-memory caching and manages background refetching
5. The cache layer uses a `fetchedAt` timestamp to determine data staleness
6. See [Two-Tier Cache Architecture](docs/TWO_TIER_CACHE.md) for details

---

## License

This project is private and not licensed for redistribution.
