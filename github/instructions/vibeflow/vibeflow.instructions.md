# Vibeflow — Spec-Driven Development

This repository uses **Vibeflow**, a spec-driven development methodology.
Before starting any non-trivial task, follow the pipeline:

```
discover → analyze → gen-spec → prompt-pack → implement → audit
```

Fast-track for small tasks (≤4 files): use the `vibeflow-quick` prompt.

## Where Things Live

| Path | Purpose |
|------|---------|
| `.vibeflow/index.md` | Project overview, stack, structure, key files |
| `.vibeflow/conventions.md` | Coding conventions with real code examples |
| `.vibeflow/patterns/*.md` | One doc per discovered pattern (real code) |
| `.vibeflow/decisions.md` | Architectural decision log (newest first) |
| `.vibeflow/prds/` | PRDs from discover |
| `.vibeflow/specs/` | Specs from gen-spec |
| `.vibeflow/prompt-packs/` | Prompt packs (self-contained, agent-agnostic) |
| `.vibeflow/audits/` | Audit reports |
| `.github/prompts/vibeflow/` | Reusable prompt files (the "commands") |
| `.github/agents/vibeflow/` | Agent personas (architect) |
| `.github/skills/vibeflow/` | Methodology reference (spec-driven-dev) |

## Before Any Task

1. Read `.vibeflow/index.md` for project context (if it exists).
2. Read `.vibeflow/conventions.md` for coding standards.
3. Read relevant pattern docs from `.vibeflow/patterns/`.
4. Use real patterns from these docs in your output.

## Guardrails (Always Active)

- **No DoD, no work.** Every task needs a Definition of Done (3-7 binary checks).
- **Minimum change** to close the DoD. Nothing beyond scope.
- **No refactoring outside scope.** No cleanup "just because".
- **Budget:** ≤ 6 files per task (default). ≤ 4 for quick tasks. Justify if exceeding.
- **New dependency:** justify in 1 line.
- **Abstraction:** only with 2+ real uses.
- **Anti-scope is a guardrail.** What you won't do matters.
- **Tests are mandatory.** If tests fail, the task is not done.

## Language

Respond in the same language as the user's input.
Technical terms in English are acceptable (endpoint, middleware, deploy, etc.).

## Available Prompts

See `.github/prompts/vibeflow/` for the full set of Vibeflow prompts:
- `vibeflow-discover` — Turn a vague idea into a PRD
- `vibeflow-analyze` — Deep-analyze codebase, build `.vibeflow/`
- `vibeflow-gen-spec` — Generate grounded spec with DoD
- `vibeflow-prompt-pack` — Self-contained prompt for any coding agent
- `vibeflow-audit` — Verify DoD + pattern + test compliance
- `vibeflow-quick` — Fast-track for small tasks
- `vibeflow-teach` — Update `.vibeflow/` with feedback
- `vibeflow-stats` — Audit statistics and trends
