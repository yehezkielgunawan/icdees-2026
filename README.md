# ICDEES LLM TypeScript Study

Reproducible TypeScript code-generation evaluation harness for the ICDEES
study. Generated outputs are evaluated independently through safety checks,
strict TypeScript compilation, the task's Vitest suite, and ESLint.

## Prerequisites

- Node.js 24 or newer
- pnpm 9.4.0
- OpenCode authentication for the configured providers

Install dependencies:

```bash
pnpm install
```

Check local task/configuration health:

```bash
pnpm run validate:tasks
pnpm run doctor --skip-live
pnpm test
pnpm run typecheck
pnpm run lint
```

For the managed OpenCode/provider check:

```bash
pnpm run doctor
```

The harness uses the normal OpenCode auth store. Do not put API keys or OAuth
tokens in this repository.

## Campaign Workflow

Create the primary three-task pilot:

```bash
pnpm run campaign:create --purpose pilot --campaign pilot-001
```

Generate, evaluate, and report:

```bash
pnpm run generate --campaign pilot-001
pnpm run evaluate --campaign pilot-001
pnpm run report --campaign pilot-001
```

Resume only missing work:

```bash
pnpm run generate --campaign pilot-001 --resume
pnpm run evaluate --campaign pilot-001 --resume
```

Create the full primary campaign:

```bash
pnpm run campaign:create --purpose final --campaign final-001
```

Create an exploratory free-model campaign separately from primary results:

```bash
pnpm run campaign:create --purpose exploratory --campaign exploratory-001
```

The primary cohort is `openai/gpt-5.6-sol`, `openai/gpt-5.6-terra`, and
`openai/gpt-5.6-luna`. The exploratory cohort is
`opencode/ling-3.0-flash-fin-free`, `opencode/mimo-v2.5-free`, and
`opencode/nemotron-3-ultra-free`.

To select explicit tasks, pass a comma-separated list:

```bash
pnpm run campaign:create --purpose pilot --campaign task-001 --tasks task-01,task-02
```

## pnpm and npm Arguments

pnpm forwards a standalone `--` to the script, so omit it:

```bash
pnpm run campaign:create --purpose pilot --campaign pilot-001
```

npm consumes its delimiter, so npm-style invocation remains supported:

```bash
npm run campaign:create -- --purpose pilot --campaign pilot-001
```

## Artifacts

Each campaign is frozen in `campaigns/<campaign-id>/`:

- `manifest.json`: schedule, model cohort, prompt, input hashes, and selected lockfile;
- `runtime/provider-snapshot.json`: OpenCode version and provider capabilities;
- `generations/`: raw SDK responses, raw text, normalized source, and generation metadata;
- `evaluations/`: detailed evaluation records;
- `report/`: CSV, JSONL, model summaries, and completeness status.

The report command also creates a publication bundle for the selected campaign:

```bash
pnpm run report --campaign final-001
```

The generated files are written to
`campaigns/<campaign-id>/report/publication/`:

- `tables/table-1-task-set.md` and `.tex`;
- `tables/table-2-main-results.md` and `.tex`;
- `tables/table-3-failure-characteristics.md` and `.tex`;
- `figures/figure-1-quality-gates.svg` and `.png`.

The tables preserve explicit numerators and denominators. The figure is rendered
as SVG and rasterized to a 2400-pixel-wide PNG using the pinned, open-licensed
DejaVu Sans font package. Reports remain campaign-scoped; run the command separately
for primary and exploratory campaigns.

Campaign input hashes include the study config, all task inputs, prompt, and the
selected lockfile. Do not manually edit generated artifacts or task tests after
campaign creation. Create a new campaign when inputs change.
