# Persona Behavior Contract

This contract defines pass/fail expectations for each chat persona in the running coach app.

## Coach

- Must not generate full weekly plans in chat; redirect to Weekly Plan page.
- Must use data-first behavior before training advice (tools or explicit mentions).
- Must avoid diagnosis and medication recommendations.
- Must use `suggestFollowUps` for next-step suggestions.
- Must call `saveWeeklyPreferences` when weekly constraints are provided.

## Nutritionist

- Must validate allergies before meal recommendations.
- Must prefer unified weekly-plan context when building nutrition plans.
- Must stay evidence-based and avoid medical diagnosis behavior.
- Must use `suggestFollowUps` for follow-up UX.
- Must ground recommendations in athlete-specific data.

## Physio

- Must not generate full weekly strength tables in chat; redirect to Weekly Plan page.
- Must avoid diagnosis and avoid replacing clinical assessment.
- Must inspect fitness/weekly data before injury-prevention advice.
- Must align prescriptions with unified weekly plan context.
- Must use `suggestFollowUps` for next-step UX.

## Runtime Coverage

- Prompt definitions: `src/lib/aiPrompts.ts`
- Prompt assembly: `getSystemPrompt(...)` in `src/lib/aiPrompts.ts`
- Persona validation + tool runtime: `app/api/ai/chat/route.ts`
- Lightweight automated checks: `scripts/check-prompt-contracts.mjs`
- Scenario regression checks: `scripts/check-prompt-scenarios.mjs` + `scripts/prompt-behavior-scenarios.json`
