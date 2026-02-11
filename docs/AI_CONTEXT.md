# AI Context: Dual Strategy (Explicit + Implicit)

> **Status:** Implemented  
> **Date:** 2026-02-11  
> **Depends on:** [Two-Tier Cache](./TWO_TIER_CACHE.md)

## Overview

The AI coaching team uses a **dual context strategy** to give each persona the data it needs without wasting tokens on irrelevant information.

### Problem (Before)

Every chat message pushed ~1-2K tokens of athlete context into the system prompt via `serializeAthleteSummary()`, regardless of relevance. This wasted tokens, diluted model attention, and scaled poorly as data grew.

### Solution (Now)

Two complementary ways for context to reach the LLM:

1. **Explicit (@-mentions)**: User types `@` in the chat input, selects a data category (and optionally a specific item), and a pill/tag appears. The referenced data is fetched client-side from Neon (via API routes) and sent alongside the message. The AI sees it immediately — no tool call needed.

2. **Implicit (AI tools)**: The LLM has 10 retrieval tools it can call autonomously when it decides it needs data the user didn't explicitly reference. Tools execute server-side against Neon.

```
┌─────────────────────────────────────────────────────────────┐
│  Client                                                      │
│                                                              │
│  User types message                                          │
│    └── types @gear → popup → selects Nike Pegasus 41         │
│    └── pill appears: [@gear: Nike Pegasus 41]                │
│                                                              │
│  On Send:                                                    │
│    ├── Resolve pill data from Neon (via API routes)          │
│    └── POST /api/ai/chat with {messages, explicitContext}    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Server: /api/ai/chat                                        │
│                                                              │
│  1. Build minimal system prompt (name + HR zones only)       │
│  2. Inject explicitContext into last user message             │
│  3. Register retrieval tools (bound to athleteId)            │
│  4. streamText() with stopWhen(stepCountIs(5))               │
│     └── LLM may call tools → tool queries Neon → returns     │
│  5. Stream response to client                                │
└──────────────────────────────────────────────────────────────┘
```

---

## @-Mention Categories

Users type `@` in the chat input to attach specific data.

| Category    | Label             | Sub-items?            | Data Source (Neon)           | Description                  |
| ----------- | ----------------- | --------------------- | -------------------------- | ---------------------------- |
| `@goal`     | Training Goal     | No                    | localStorage (settings)    | Free-text training goal      |
| `@injuries` | Injuries          | No                    | localStorage (settings)    | Current reported injuries    |
| `@diet`     | Diet & Allergies  | No                    | localStorage (settings)    | Allergies + food preferences |
| `@training` | Training Summary  | No                    | `db.activities`            | 4-week aggregate stats       |
| `@zones`    | Zone Distribution | No                    | `db.zoneBreakdowns`        | HR zone time percentages     |
| `@fitness`  | Fitness Metrics   | No                    | `db.activities` + settings | BF, LI, IT, ACWR             |
| `@activity` | Activity          | **Yes** (pick a run)  | `db.activities`            | Specific activity details    |
| `@gear`     | Gear              | **Yes** (pick a shoe) | `db.athleteGear`           | Specific shoe with mileage   |
| `@plan`     | Coach Plan        | No                    | `db.coachPlans`            | Active training plan         |

### How it works

1. User types `@` → a popup opens with all 9 categories
2. User selects a category (fuzzy search supported)
3. For `@activity` and `@gear`, a sub-item list loads from Neon
4. A pill (e.g., `[@gear: Nike Pegasus 41]`) appears above the textarea
5. On send, pills are resolved into text data from Neon
6. Data is sent as `explicitContext` in the request body
7. Server injects it into the user message as `[User attached context]`

### Adding a new @-mention category

1. Add the category to `MENTION_CATEGORIES` in `src/lib/mentionTypes.ts`
2. Add a resolver case in `useMentionResolver()` in `src/hooks/useMentionData.ts`
3. If it has sub-items, add a `load*SubItems()` function in the same file

---

## Retrieval Tools (Implicit)

The LLM has 10 read-only tools that query Neon server-side.

| Tool                  | Parameters            | Description                    | Neon Source                    |
| --------------------- | --------------------- | ------------------------------ | ------------------------------ |
| `getTrainingGoal`     | —                     | Athlete's stated training goal | `user_settings.goal`           |
| `getInjuries`         | —                     | Current injuries with notes    | `user_settings.injuries`       |
| `getDietaryInfo`      | —                     | Allergies + food preferences   | `user_settings`                |
| `getTrainingSummary`  | `weeks?` (default 4)  | N-week aggregate stats         | `activities`                   |
| `getWeeklyBreakdown`  | `weeks?` (default 4)  | Per-week stats                 | `activities`                   |
| `getZoneDistribution` | `weeks?` (default 4)  | HR zone time %                 | `zone_breakdowns`              |
| `getFitnessMetrics`   | —                     | BF, LI, IT, ACWR               | `activities` + `user_settings` |
| `getRecentActivities` | `count?` (default 10) | Last N activities              | `activities`                   |
| `getGearStatus`       | —                     | Shoes with mileage             | `athlete_gear`                 |
| `getCoachPlan`        | —                     | Active training plan           | `coach_plans`                  |

All personas get all tools. The `shareTrainingPlan` tool (Coach only) is separate.

### How it works

1. User sends a message without @-mentions
2. LLM reads the system prompt, which describes available tools
3. LLM decides which data it needs and calls tools
4. Tools query Neon and return compact text summaries
5. LLM uses the data to generate its response
6. Up to 5 steps (tool calls + final response) via `stopWhen(stepCountIs(5))`

### Adding a new retrieval tool

1. Add the tool definition to `createRetrievalTools()` in `src/lib/aiRetrievalTools.ts`
2. Add a description line to `CONTEXT_ACCESS` in `src/lib/aiPrompts.ts`
3. (Optional) Add per-persona guidance in the relevant persona prompt

---

## System Prompt Structure

The system prompt is now **minimal**. It contains:

1. **Persona template** — Role, expertise, behavioral guidelines
2. **Context access instructions** — How to use @-mentions and tools
3. **Conversation memory** — Summary of past conversations (if exists)
4. **Minimal always-on context** — Athlete name + HR zones only

Everything else is fetched on-demand via tools or provided via @-mentions.

### Before (push-everything)

```
System prompt = persona + memory + full athlete context (~1-2K tokens)
                                   ↑ zones, goals, injuries, allergies,
                                     gear, weekly breakdown, zone dist,
                                     fitness metrics, recent activities
```

### After (pull-on-demand)

```
System prompt = persona + tool docs + memory + name/zones (~200 tokens)
                                      ↑ only 2 fields always included
```

---

## File Map

```
src/lib/
├── aiPrompts.ts          ← System prompts with context access docs
├── aiRetrievalTools.ts   ← 10 retrieval tool definitions (server-side)
├── aiTools.ts            ← shareTrainingPlan schema (unchanged)
├── aiContext.ts           ← Legacy — kept for non-chat UI use
└── mentionTypes.ts       ← @-mention category registry

src/hooks/
└── useMentionData.ts     ← Resolves pills → text from Neon

src/components/chat/
├── ChatInput.tsx          ← Textarea with @-detection + pills
└── MentionPopup.tsx       ← Category + sub-item selector (cmdk)

app/api/ai/chat/
└── route.ts              ← Registers tools, injects explicitContext

src/db/
└── schema.ts             ← Includes user_settings table

src/contexts/
└── SettingsContext.tsx    ← Syncs settings to Neon (fire-and-forget)
```

---

## Per-Persona Tool Guidance

Each persona's system prompt includes specific hints on when to use tools:

- **Coach**: "Before prescribing workouts, check if @training or @fitness was attached; if not, call `getFitnessMetrics` and `getTrainingSummary`. Check `getInjuries` if the athlete mentions pain."
- **Nutritionist**: "Always verify dietary info — use @diet if attached or call `getDietaryInfo`. Check @training or call `getTrainingSummary` to estimate caloric needs."
- **Physio**: "Always verify injuries — use @injuries if attached or call `getInjuries`. Check @gear or call `getGearStatus` for shoe wear. Check @fitness or call `getFitnessMetrics` for ACWR."
