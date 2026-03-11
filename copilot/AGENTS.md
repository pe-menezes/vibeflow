# AGENTS.md — Vibeflow Agent Policy

> If your repo already has an `AGENTS.md`, append the content below to it.
> If not, copy this file to the root of your repo (removing this note).

---

<!-- vibeflow:start -->
## Vibeflow Methodology

This repository uses **Vibeflow** (spec-driven development).
All non-trivial work follows the pipeline:

```
discover → analyze → gen-spec → prompt-pack → implement → audit
```

## Roles

### Architect (thinks, never implements)
- Produces PRDs, specs, prompt packs, and audit reports
- Challenges vague requirements — forces clarity
- Cuts scope aggressively
- Maintains `.vibeflow/` project knowledge
- See: `.github/agents/vibeflow-architect.agent.md`

### Coding Agent (implements, follows prompt packs)
- Receives self-contained prompt packs
- Follows patterns embedded in the prompt pack
- Does NOT deviate from the Definition of Done
- Does NOT refactor outside scope

## Guardrails

| Rule | Detail |
|------|--------|
| No DoD, no work | Every task needs 3-7 binary pass/fail checks |
| Minimum change | Close the DoD. Nothing beyond. |
| No refactoring outside scope | No cleanup "just because" |
| Budget | ≤ 6 files per task (default). ≤ 4 for quick tasks. |
| New dependency | Justify in 1 line |
| Abstraction | Only with 2+ real uses |
| Anti-scope | Explicit. What you won't do matters. |
| Tests mandatory | If tests fail, the task is not done |

## Knowledge Base

All project knowledge lives in `.vibeflow/`:

```
.vibeflow/
├── index.md          # Project overview, stack, structure
├── conventions.md    # Coding conventions with real examples
├── decisions.md      # Architectural decision log
├── patterns/         # One doc per discovered pattern
├── prds/             # PRDs from discover
├── specs/            # Specs from gen-spec
├── prompt-packs/     # Self-contained prompt packs
└── audits/           # Audit reports
```

**Before any task:** Read `.vibeflow/index.md` and relevant pattern docs.

## Prompt Files

Available in `.github/prompts/`:

| Prompt | Purpose |
|--------|---------|
| `vibeflow-discover` | Turn vague idea into PRD |
| `vibeflow-analyze` | Deep-analyze codebase, build `.vibeflow/` (flags: `--fresh`, `--scope`, `--interactive`, `--satellite`) |
| `vibeflow-gen-spec` | Generate grounded spec with DoD |
| `vibeflow-prompt-pack` | Self-contained prompt for coding agent |
| `vibeflow-audit` | Verify DoD + pattern + test compliance |
| `vibeflow-quick` | Fast-track for small tasks (≤4 files) |
| `vibeflow-teach` | Update `.vibeflow/` with feedback |
| `vibeflow-stats` | Audit statistics and trends |

## Language

Respond in the same language as the user's input.
Technical terms in English are acceptable.
<!-- vibeflow:end -->
