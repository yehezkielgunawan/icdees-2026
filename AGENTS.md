# ICDEES Repository Guide

## Project

- This is a reproducible TypeScript LLM code-generation evaluation harness.
- Use Node.js `>=24` and pnpm `9.4.0`; the package is ESM and uses NodeNext resolution.
- Local TypeScript imports use `.js` extensions. Preserve the strict compiler settings and `verbatimModuleSyntax`.
- `src/cli.ts` is the command entrypoint. Campaign orchestration lives in `src/campaign-store.ts`, `src/generation-campaign.ts`, `src/evaluation-campaign.ts`, and `src/report-campaign.ts`.
- `config/opencode/opencode.json` intentionally disables tools and permissions for the benchmark agent. Do not loosen it to make generation convenient.

## Commands

```bash
pnpm install
pnpm run validate:tasks
pnpm run doctor --skip-live
pnpm test
pnpm run typecheck
pnpm run lint
```

- `pnpm run doctor` performs the live provider/runtime check and requires the normal OpenCode authentication store.
- Run one source test with `pnpm exec vitest run test/<file>.test.ts`.
- `vitest.tasks.config.ts` includes task fixtures, but those tests import a per-task generated `candidate.js`; a clean checkout will fail if they are run directly. The evaluation campaign materializes candidates in temporary `.work/` workspaces. The default `pnpm test` only includes `test/**/*.test.ts`.
- For pnpm scripts, pass options directly: `pnpm run report --campaign final-001`. Do not add npm's extra `--`; npm requires `npm run report -- --campaign final-001`.

## Campaign Workflow

```bash
pnpm run campaign:create --purpose pilot --campaign pilot-001
pnpm run generate --campaign pilot-001
pnpm run evaluate --campaign pilot-001
pnpm run report --campaign pilot-001
```

- `--purpose` is `pilot`, `final`, or `exploratory`; `--tasks task-01,task-02` and `--runs N` are also supported.
- `--resume` applies to generation and evaluation. `--partial` applies to reporting and must be used deliberately for incomplete campaigns.
- The primary cohort is `sol`, `terra`, and `luna`; the exploratory cohort is `ling`, `mimo`, and `nemotron`.
- A campaign manifest freezes the schedule and hashes `config/study.json`, every task input, the prompt, and the selected lockfile. Do not manually edit campaign artifacts or task tests after campaign creation; create a new campaign when inputs change.
- Generation and evaluation enforce all manifest hashes. Reporting alone permits a lockfile-only mismatch because report rendering dependencies may change; do not broaden that exception.

## Evaluation And Reports

- Each task directory must contain `task.json`, `task.test.ts`, and `reference.ts`; `validate:tasks` expects exactly 15 tasks and numeric task ordering.
- Candidate evaluation runs safety inspection, strict TypeScript compilation, then Vitest and ESLint in parallel. Temporary candidate workspaces are under `.work/` and are removed after evaluation.
- The quality gate requires successful extraction, compilation, complete functional correctness, and zero ESLint errors. Preserve explicit numerators and denominators when changing report metrics.
- Reports are campaign-scoped. Standard files are under `campaigns/<campaign-id>/report/`; publication tables and the quality-gate figure are under `report/publication/`.
- `campaigns/`, `.work/`, `generated/`, `coverage/`, `docs/`, and `graphify-out/` are ignored local artifacts. Do not put API keys or OAuth tokens in the repository; `.env` files are ignored.

## Change Checks

- Add harness regression tests under `test/`; update task tests only when intentionally changing the benchmark corpus.
- Before finishing code changes, run the focused tests, then `pnpm test`, `pnpm run typecheck`, and `pnpm run lint`.
