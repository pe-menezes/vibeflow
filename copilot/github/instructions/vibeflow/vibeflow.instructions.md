---
applyTo: '**'
---

# Vibeflow — Spec-Driven Development

This repository uses Vibeflow, a spec-driven development methodology.
Non-trivial work follows the pipeline:

```
discover → analyze → gen-spec → prompt-pack → implement → audit
```

Small tasks (≤4 files) fast-track through the `vibeflow-quick` prompt.

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
| `.github/prompts/vibeflow-*.prompt.md` | Reusable prompt files (the "commands") |
| `.github/agents/vibeflow-architect.agent.md` | Agent persona (architect) |

## Before Any Task

Read `.vibeflow/index.md` for project context, `.vibeflow/conventions.md` for
coding standards, and the pattern docs the task touches — then build the output
on their real patterns. In installed projects `.vibeflow/` is gitignored, and
IDE search, grep, and glob respect `.gitignore`: they miss the directory and
report it as absent. Open these files directly by path.

## Guardrails

- No DoD, no work. Every task needs a Definition of Done (3-7 binary checks).
- Minimum change to close the DoD. Nothing beyond scope, no cleanup "just
  because", no refactoring outside scope.
- Budget: ≤ 6 files per task, ≤ 4 for quick tasks. Justify if exceeding.
- New dependency: justify in 1 line.
- Abstraction: only with 2+ real uses.
- Anti-scope is a guardrail — what you won't do matters.
- Tests are mandatory. If tests fail, the task is not done.

## Roles

- **Architect** — produces PRDs, specs, prompt packs, and audit reports;
  challenges vague requirements, cuts scope, curates `.vibeflow/`. Thinks and
  documents, never implements. Persona:
  `.github/agents/vibeflow-architect.agent.md`.
- **Coding agent** — works from a self-contained prompt pack, follows the
  patterns embedded in it, holds to the Definition of Done, and stays inside
  the scope the pack declares.

## Language

Respond in the same language as the user's input.
Technical terms in English are acceptable (endpoint, middleware, deploy, etc.).

## Available Prompts

See `.github/prompts/` for the full set of Vibeflow prompts:
- `vibeflow-discover` — Turn a vague idea into a PRD
- `vibeflow-analyze` — Deep-analyze codebase, build `.vibeflow/` (flags: `--fresh`, `--scope`, `--interactive`, `--satellite`)
- `vibeflow-gen-spec` — Generate grounded spec with DoD
- `vibeflow-prompt-pack` — Self-contained prompt for any coding agent
- `vibeflow-audit` — Verify DoD + pattern + test compliance
- `vibeflow-quick` — Fast-track for small tasks
- `vibeflow-teach` — Update `.vibeflow/` with feedback
- `vibeflow-stats` — Audit statistics and trends
