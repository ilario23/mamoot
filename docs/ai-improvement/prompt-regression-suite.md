# Prompt Regression Suite

This project runs two deterministic AI prompt gates:

- `scripts/check-prompt-contracts.mjs`
  - Validates baseline required prompt clauses.
- `scripts/check-prompt-scenarios.mjs`
  - Validates scenario fixtures in `scripts/prompt-behavior-scenarios.json`.

Both run in CI via `npm run test:ai-gates`.

## How to add a scenario

1. Add a new object to `scripts/prompt-behavior-scenarios.json` with:
   - `id` (stable unique ID)
   - `persona` (`coach`, `nutritionist`, `physio`, or `shared`)
   - `description`
   - `mustInclude` (array of exact required prompt clauses)
2. Update `src/lib/aiPrompts.ts` if a required clause is missing.
3. Run `npm run test:ai-gates` locally.
4. Keep scenario intent aligned with `docs/ai-improvement/persona-behavior-contract.md`.

## Guidance to avoid drift

- Reuse exact phrase snippets from `src/lib/aiPrompts.ts` in `mustInclude`.
- Prefer small, behavior-focused scenarios (safety, redirection, tool usage).
- Avoid broad natural-language paraphrases that are hard to verify deterministically.
