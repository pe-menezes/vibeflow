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

Small tasks (≤4 files) fast-track through `quick`. An observed defect with
reproducible evidence goes to `hotfix` regardless of size.

The workflows are the skills in `.opencode/skills/<name>/` (analyze, discover,
gen-spec, prompt-pack, implement, audit, hotfix, quick, teach, stats). Each
skill holds its own guardrails: load it with your skill tool before doing that
workflow's work, or let the user start it with its command,
`/vibeflow-<name>` (for example `/vibeflow-analyze`, `/vibeflow-gen-spec`,
`/vibeflow-implement`, `/vibeflow-audit`).

`architect` is the primary agent for discovery, specs, prompt packs and audits;
it never writes code. `/vibeflow-implement` and `/vibeflow-hotfix` run from
Build. With `--loop`, `implement` sends each round to a fresh `subagent` call:
the `executor` agent for executor and fix rounds, the `auditor` agent for
audits.

Before any task, read `.vibeflow/index.md` and `.vibeflow/conventions.md`
directly by path.
<!-- vibeflow:end -->
