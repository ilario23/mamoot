# CI/CD Setup

## Pipelines

- `AI Quality Gates` (`.github/workflows/ai-quality-gates.yml`)
  - Runs on PRs touching AI/prompt/gate files and on pushes to `main`/`master`.
  - Uses Bun (`bun install --frozen-lockfile`) and runs `lint`, `typecheck`, offline tests (`bun run test:offline`), and AI gate scripts on PRs.
  - `build` runs only on `push` to `main`/`master`.
- `Vercel Git Deploy` (managed in Vercel)
  - Production deploys are triggered by Vercel's Git integration on `main`/`master`.
  - GitHub Actions are used for CI checks only.

## Required GitHub Secrets

No Vercel deploy secrets are required in GitHub for production deploys when using Vercel Git integration.

## Offline Test Policy

- CI uses `npm run test:offline`.
- Offline tests block external network calls by default in `vitest.setup.ts`.
- Tests that need `fetch` must explicitly stub it in the test file.
- No test in the default CI path should invoke model providers or consume LLM tokens.

## Local Reproduction

Run the same checks as CI:

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test:offline
bun run build
bun run test:ai-gates
bun run test:ai-evals
bun run test:cohort-replay
```
