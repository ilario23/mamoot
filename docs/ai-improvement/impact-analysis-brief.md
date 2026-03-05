# Running Coach AI Impact Analysis Brief

## Executive Summary

1. **Keep the current validation pattern and tune it with metrics, not complexity.** The current stack (Zod schemas + one retry + semantic checks) is high-value for running plans and avoids over-engineering.
2. **Explicit response feedback is a strong leverage point.** Message-level feedback (`helpful`/`not_helpful` + reason taxonomy) is the fastest way to prioritize prompt, tool, and validator improvements.
3. **Do not adopt full multi-agent team orchestration yet.** A staged role pipeline remains the best latency/reliability tradeoff for this app until clear quality plateaus are measured.
4. **Tracing is useful but still early-stage.** Correlation IDs and structured trace events are in place; the next impact step is queryable persistence and dashboards, not more logging volume.
5. **Prompt + anti-prompt is effective only when paired with enforceable checks.** Prompt contracts and runtime/tool constraints should continue to be treated as a combined control system.

---

## Impact Framework

Each topic is evaluated on:

- **User impact**: safety, personalization quality, trust.
- **Operational impact**: latency, reliability, debugging speed.
- **Engineering impact**: delivery effort, testability, maintenance.
- **Business impact**: cost and iteration velocity.
- **Risk profile**: expected failure modes if adopted or deferred.
- **Recommendation**: now / next / later.

---

## Topic-by-Topic Impact Analysis

## 1) Validation loop effectiveness in plan creation

**Current implementation**

- Request schemas validate input shape in `src/lib/aiRequestSchemas.ts`.
- Object generation uses retry wrapper in `src/lib/aiGeneration.ts`.
- Weekly/block semantic guards are in `src/lib/planSemanticValidators.ts`.
- Integration points:
  - `app/api/ai/weekly-plan/route.ts`
  - `app/api/ai/training-block/route.ts`

**Impact**

- **User:** fewer malformed plans; better consistency and fewer impossible sessions.
- **Operational:** lower hard-failure rates with one repair attempt; bounded latency increase.
- **Engineering:** moderate complexity, still understandable and maintainable.
- **Business:** good cost/quality ratio; avoids expensive retry cascades.

**Risk profile**

- If expanded aggressively (many retries), latency and token cost can rise quickly.
- If left static, semantic false positives/false negatives can limit plan quality.

**Recommendation:** **Now**

- Keep 1 retry max.
- Iterate semantic checks via observed failures, not speculative additions.

---

## 2) Coach feedback capabilities and structure

**Current implementation**

- Message-level feedback storage exists in `src/db/schema.ts` (`chat_message_feedback`).
- Read/write APIs are wired in `app/api/db/[table]/route.ts`.
- UI feedback actions (`thumbs up/down`) exist in `src/components/layout/AITeamChat.tsx`.
- Sync helpers are in `src/lib/chatSync.ts`.

**Impact**

- **User:** athletes can quickly signal usefulness and safety issues.
- **Operational:** creates direct quality signal to prioritize fixes.
- **Engineering:** low-to-medium complexity; simple taxonomy is easy to maintain.
- **Business:** high ROI by reducing blind prompt tuning.

**Risk profile**

- Sparse feedback volume can bias decisions if not normalized by usage.
- Free-text feedback can be noisy; reason taxonomy should remain primary.

**Recommendation:** **Now**

- Keep taxonomy short (`helpful`, `unsafe`, `too_generic`, `not_actionable`, `wrong_context`, `other`).
- Use free-text only as secondary context.

---

## 3) Persona collaboration model (single staged pipeline vs team-agent)

**Current implementation**

- Personas are clearly separated in `src/lib/aiPrompts.ts`.
- Chat uses persona-specific tool access in `app/api/ai/chat/route.ts`.
- Weekly plans already follow staged role generation (coach then physio).

**Impact comparison**

- **Single staged pipeline (current):**
  - Better reliability, lower latency, easier debugging.
  - Lower cognitive and operational complexity.
- **Team-agent/multi-agent orchestration:**
  - Potential quality gains in complex edge cases.
  - Higher cost, latency, coordination failure modes, and observability burden.

**Risk profile**

- Premature multi-agent adoption likely increases complexity faster than user value.

**Recommendation:** **Later**

- Keep current staged approach until feedback + trace metrics show quality plateau.
- Run limited experiments only on hard edge cases, not default flow.

---

## 4) LLM observability/debuggability

**Current implementation**

- Trace context, request IDs, prompt hashing, and event logs exist in `src/lib/aiTrace.ts`.
- Chat route emits step-level tool and token signals in `app/api/ai/chat/route.ts`.
- Weekly/block routes now return `x-trace-id`.

**Impact**

- **User:** indirect but meaningful (faster issue diagnosis -> faster quality improvements).
- **Operational:** significantly improved incident triage.
- **Engineering:** still mostly console-based; hard to aggregate trends.
- **Business:** high leverage once data is queryable.

**Risk profile**

- Console-only telemetry limits learnings and trend detection.
- Over-logging without aggregation increases noise.

**Recommendation:** **Next**

- Persist trace metadata to a queryable store.
- Add basic dashboards: failure reasons, latency, tool error rate, feedback correlation.

---

## 5) Input/output schema strategy and state-of-art fit

**Current implementation**

- Input validation via Zod request schemas.
- Output validation via structured generation schemas.
- Post-schema semantic checks for domain logic.

**State-of-art fit (pragmatic tier)**

- This is aligned with modern production patterns for assistant-backed apps:
  1. strict request schema
  2. strict output schema
  3. bounded repair attempt
  4. domain semantic validation
  5. observability + human feedback loop

**Recommendation:** **Now**

- Continue current approach.
- Avoid advanced policy engines unless medical/legal scope expands.

---

## 6) MCP, rules, instructions, tools

**Impact by layer**

- **Runtime product quality:** mainly improved by tool reliability, prompt contracts, validators, and feedback loops.
- **Developer workflow:** MCP/rules/instructions are valuable for consistency and speed of development.

**Risk profile**

- Treating MCP/rules as runtime quality substitute can misprioritize work.

**Recommendation:** **Next**

- Keep using MCP/rules for development operations.
- Prioritize runtime quality loops first for athlete-facing value.

---

## 7) Persona prompt + anti-prompt strategy

**Current implementation**

- Persona and anti-prompt constraints are centralized in `src/lib/aiPrompts.ts`.
- Prompt behavior contract and check script exist in:
  - `src/lib/promptContracts.ts`
  - `scripts/check-prompt-contracts.mjs`

**Impact**

- **User:** stronger consistency across coach/nutritionist/physio behavior.
- **Operational:** fewer persona drift incidents.
- **Engineering:** low maintenance when contracts stay concise and tested.

**Risk profile**

- Prompt-only controls can drift under model/provider changes.

**Recommendation:** **Now**

- Keep prompt + anti-prompt, but always paired with:
  - tool constraints
  - schema validation
  - semantic checks
  - feedback-based calibration

---

## Tradeoff Narrative (What Gains, What Costs, What to Defer)

- **Biggest near-term gains** come from better feedback analysis and trace persistence, not from new orchestration complexity.
- **Main cost pressure** is latency and token spend from retries and extra tooling; bounded design is essential.
- **Best defer decision** is full team-agent collaboration as default planner behavior.
- **Primary quality loop** should be: prompt contracts -> runtime checks -> user feedback -> targeted tuning.

---

## Recommendations by Time Horizon

## Do Now (0-4 weeks)

- Stabilize and monitor validation + semantic check results.
- Operationalize feedback reason taxonomy in weekly quality review.
- Enforce prompt contract checks in CI/release checks.
- Keep persona boundaries strict for safety-critical topics.

## Do Next (1-2 months)

- Persist trace metadata (beyond console) and add lightweight dashboards.
- Correlate `not_helpful` reasons with trace events and route/model/persona.
- Refine semantic validators based on observed real failures.

## Re-evaluate Later (after metrics)

- Team-agent orchestration for plan creation.
- Advanced policy engines or highly granular anti-prompt systems.
- Complex multi-retry self-healing loops.

---

## KPI and Decision Gates

Use these metrics to decide whether to tune, scale, or defer:

- **Schema failure rate** (weekly/block requests)
  - Target: `< 2%`
  - Action: if above target, inspect request payload quality and schema strictness.
- **Retry recovery rate** (successful on attempt 2)
  - Target: `>= 50%` of first-attempt failures recovered
  - Action: if low, adjust prompts/semantic checks; if very high, inspect attempt-1 prompt quality.
- **Negative feedback ratio by reason** (per persona)
  - Target: downward trend week-over-week
  - Action: prioritize fixes by dominant reason bucket.
- **Trace coverage ratio** (requests with usable `x-trace-id` and key events)
  - Target: `>= 95%`
  - Action: block releases if critical flows lose trace coverage.
- **p95 generation latency** (weekly/block)
  - Target: maintain acceptable UX thresholds for your user base
  - Action: if rising, cap additional checks/retries before adding complexity.

---

## What is intentionally not worth building now

- Default multi-agent team planning flow.
- Heavy governance/policy frameworks for non-regulated coaching scope.
- More than one repair retry by default.

These are valid in other contexts (regulated medical decision support, high-stakes financial advisory, enterprise compliance), but are disproportionate for this product stage.
