# Multi-Agent Interaction Patterns (Bounded SOTA)

## Purpose

Select a practical multi-agent interaction method for weekly plan and training-block generation that improves coordination without causing latency, cost, or reliability blowups.

## Decision summary

Use a **bounded orchestrator pattern** with:

- one shared brief
- one proposal turn per specialist
- deterministic conflict resolver
- optional single repair turn
- hard stop on rounds and budget

Do **not** use open-ended agent swarms or unconstrained debate loops.

## Candidate patterns reviewed

### 1) Open debate / swarm agents

- Strength: broad exploration.
- Weakness: unstable runtimes, contradiction risk, poor cost predictability.
- Decision: rejected for production planning flows.

### 2) Router-only specialist selection

- Strength: fast and cheap.
- Weakness: weak cross-specialist reconciliation for mixed constraints (performance vs injury risk).
- Decision: keep for simple chat Q&A, not sufficient for weekly planning.

### 3) Bounded planner-critic with deterministic merge

- Strength: high reliability-to-cost ratio, easier to test, explicit governance.
- Weakness: less creative exploration than swarms.
- Decision: selected for weekly planning and block adaptation.

## Selected runtime contract

1. **Orchestrator brief**
   - Includes athlete context, goals, injury/risk signals, and strict constraints.
2. **Coach proposal**
   - Produces running sessions and intensity distribution intent.
3. **Physio proposal**
   - Produces strength/mobility overlays and risk constraints.
4. **Deterministic conflict resolver**
   - Applies safety-precedence and scheduling rules.
5. **Single repair turn (optional)**
   - Triggered only when unresolved high-severity conflicts remain.
6. **Finalize**
   - Persist unified plan and structured handoffs.

## Runtime limits (required)

- Max specialist turns: 2
- Max repair turns: 1
- Max total rounds: 3
- Max orchestration runtime budget: configurable timeout with conservative defaults
- Fallback: if budget exceeded, return conservative merged plan with explicit warning

## Conflict policy

- Safety wins over optimization.
- Physio injury-risk constraints override aggressive load progression.
- If unresolved tie remains: choose lower musculoskeletal stress option.
- Record conflict and resolution reason for telemetry and review.

## Evaluation policy

Track at minimum:

- contradiction rate across coach/physio outputs
- repair invocation rate
- unresolved conflict rate
- p95 latency
- token cost per successful plan
- safety-regression count

## Rollout recommendation

- Phase 1: weekly plan only, feature-flagged.
- Phase 2: training-block adaptation and creation.
- Phase 3: optional nutritionist involvement on flagged weeks only.

## Notes

This pattern aligns with the existing roadmap stance favoring bounded critic loops and explicit risk governance in `docs/ai-improvement/sota-ai-training-roadmap.md`.
