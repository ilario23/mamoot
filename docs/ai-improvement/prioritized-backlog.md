# AI Improvement Backlog (Impact x Effort)

## P0 — Do now

- **Persona contract checks** (`low effort`, `high impact`)
  - Keep `scripts/check-prompt-contracts.mjs` in CI/pre-release checks.
- **Validation retry + semantic post-checks** (`medium effort`, `high impact`)
  - Weekly plan and training block generation now retry once on schema/semantic failure.
- **Message-level feedback capture** (`medium effort`, `high impact`)
  - Track thumbs up/down + short reason taxonomy for assistant messages.
- **Trace correlation baseline** (`medium effort`, `high impact`)
  - Standardized trace events, prompt hash, tool counts, usage, latency.

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
