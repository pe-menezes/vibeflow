# AGENTS.md — Vibeflow Agent Policy

> If your repo already has an `AGENTS.md`, append the content below to it.
> If not, copy this file to the root of your repo (removing this note).

---

<!-- vibeflow:start -->
## Vibeflow Methodology

This repository uses Vibeflow (spec-driven development). All non-trivial work
follows the pipeline:

```
discover → analyze → gen-spec → prompt-pack → implement → audit
```

Guardrails, roles, the `.vibeflow/` knowledge base and the full prompt list
live in `.github/instructions/vibeflow/vibeflow.instructions.md`, which Copilot
auto-applies through that file's `applyTo: '**'` frontmatter. That file is the
source; this one points at it.

Before any task, read `.vibeflow/index.md` and `.vibeflow/conventions.md`
directly by path.
<!-- vibeflow:end -->
