# AI Architecture Note (Current + Upgrades)

## Current strengths

- Structured generation already uses Zod schemas for weekly plans and training blocks.
- Chat persona routing and tool allowlisting are implemented server-side.
- Existing logs include step-level tool calls and token usage for chat requests.

## Current gaps

- No first-class chat feedback entity tied to assistant message quality.
- Validation in weekly/block routes has limited request-body schema checks.
- Schema failures in generation flows fail fast without a repair attempt.
- Observability is mostly console-based, without persistent structured traces.

## Implemented upgrades in this cycle

- Added request-body schema validation for AI routes (`chat`, `weekly-plan`, `training-block`).
- Added minimal retry/repair wrapper for object generation with semantic post-checks.
- Added explicit chat message feedback model and API handling.
- Added structured trace baseline with correlation IDs and normalized event payloads.
- Added persona prompt contract document + lightweight verification script.

## Running-coach pragmatism

- Keep hardening lightweight: one retry max, bounded semantic checks, focused telemetry.
- Prioritize safety and personalization over heavy multi-agent orchestration complexity.
- Add deeper orchestration only after measurable quality gains from feedback + trace data.
