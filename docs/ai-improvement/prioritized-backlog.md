# AI Improvement Backlog (Impact x Effort)

## P0 — Do now (completed)

- **Persona contract checks** (`low effort`, `high impact`) - ✅ done
  - `scripts/check-prompt-contracts.mjs` remains in CI/pre-release checks (`npm run test:ai-gates` via `.github/workflows/ai-quality-gates.yml`).
- **Validation retry + semantic post-checks** (`medium effort`, `high impact`) - ✅ done
  - Weekly plan and training block generation retry once on schema/semantic failure (`generateObjectWithRetry` + route integrations).
- **Message-level feedback capture** (`medium effort`, `high impact`) - ✅ done
  - Added strict server-side feedback validation (rating/reason taxonomy + consistency) and kept message-level thumbs up/down capture.
  - Added feedback lifecycle cleanup when deleting chat sessions (prevents orphaned feedback rows).
- **Trace correlation baseline** (`medium effort`, `high impact`) - ✅ done
  - Standardized trace events and baseline payload fields across chat/weekly-plan/training-block flows.
  - Ensured `x-trace-id` coverage across success/error response paths in touched AI routes.

## P1 — Next

- **Feedback dashboards** (`medium effort`, `medium/high impact`)
  - Slice by persona, route, reason code, and model to spot regressions.
- **Prompt-behavior regression suite expansion** (`medium effort`, `medium impact`)
  - Add scenario-based checks for safety and plan redirection behavior.
- **Typed AI error taxonomy in UI** (`low/medium effort`, `medium impact`)
  - Better user-facing recovery actions from route-level errors.

## P2 — Later (data-driven)

- **Multi-agent persona collaboration experiments** (`high effort`, `unknown impact`)
  - Run only if P0/P1 metrics plateau and clear gains justify complexity.
- **Persistent trace storage for long-term evals** (`medium/high effort`, `context dependent`)
  - Add only if debugging volume exceeds console/log sink capabilities.
