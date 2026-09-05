# Vibeflow

> Spec-driven development for AI agents. Define what to build, let the agent build it right.

Vibeflow is a shared plugin for Codex, Claude Code, and Claude Desktop. It
analyzes your codebase, generates grounded specs with a binary Definition of
Done, implements within explicit scope and budget guardrails, and audits the
result against your project's real patterns.

## Install

### Codex

Add the main repository as a marketplace and install the plugin:

```bash
codex plugin marketplace add pe-menezes/vibeflow
codex plugin add vibeflow@vibeflow-marketplace
```

Start a new Codex task after installation so the skills are loaded. Vibeflow
skills are selected automatically from natural-language requests; for example,
ask Codex to “analyze this project with Vibeflow” or “generate a Vibeflow spec
for this feature.”

### Claude Desktop

1. Open **Customize** in the sidebar.
2. Click **+** next to “Personal plugins”, then **Add marketplace**.
3. Paste `pe-menezes/vibeflow`.
4. Click **Sync**.
5. Choose **Browse plugins** and install **Vibeflow**.

### Claude Code CLI

These slash commands run inside the Claude Code terminal session:

```text
/plugin marketplace add pe-menezes/vibeflow
/plugin install vibeflow@vibeflow-marketplace
```

Existing installations that use `pe-menezes/vibeflow-claude` remain
supported. That repository is a compatibility mirror generated from this
package.

### Local development

From a checkout of the main repository:

```bash
# Codex
codex plugin marketplace add /absolute/path/to/vibeflow
codex plugin add vibeflow@vibeflow-marketplace
```

```text
# Claude Code
/plugin marketplace add /absolute/path/to/vibeflow
/plugin install vibeflow@vibeflow-marketplace
```

## Quick start

The core workflow is the same on every host:

```text
analyze              → scan the codebase and build .vibeflow/ knowledge
gen-spec "feature"   → define DoD, scope, anti-scope, and patterns
implement <spec>     → implement within the agreed guardrails
audit <spec>         → verify the result with evidence
```

In Claude, invoke the namespaced commands such as `/vibeflow:analyze`. In
Codex, describe the same goal naturally and the matching skill is discovered
from its description.

## Workflows

| Skill | What it does |
|-------|--------------|
| `analyze` | Deep-analyzes the codebase and builds `.vibeflow/` project knowledge |
| `discover` | Turns a vague idea into a focused PRD through a short dialogue |
| `gen-spec` | Produces an implementation contract with binary DoD and anti-scope |
| `implement` | Implements an approved spec within its budget and patterns |
| `audit` | Checks DoD, patterns, tests, and the destructive-operation Critical Gate |
| `hotfix` | Fixes an evidenced defect with a trace document and regression test |
| `prompt-pack` | Creates a self-contained handoff for another agent or task |
| `quick` | Fast-tracks a clear task that fits in four files or fewer |
| `teach` | Adds corrections, conventions, decisions, or imported patterns |
| `stats` | Aggregates audit verdicts, gaps, and quality trends |

## Project knowledge

Vibeflow stores its durable project context in one directory:

```text
.vibeflow/
├── index.md
├── conventions.md
├── decisions.md
├── patterns/
├── prds/
├── specs/
├── prompt-packs/
├── hotfixes/
└── audits/
```

The knowledge is adaptive: it is grounded in code that actually exists in the
project, and it compounds as specs, decisions, fixes, and audits are added.

## Package structure

```text
plugins/vibeflow/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── skills/
│   └── <workflow>/SKILL.md
└── agents/
    └── architect.md
```

The ten skills are the shared source of truth. The Claude manifest exposes the
Claude-specific architect sub-agent with project-scoped persistent memory;
Codex exposes only the shared skills and uses `.vibeflow/` as durable project
context through its native task/agent model.

## Philosophy

- **No DoD, no work.** Every planned task needs binary pass/fail checks.
- **Patterns first.** Specs and implementations follow evidence from the repo.
- **Directional, not prescriptive.** Context and constraints beat scripted code.
- **Minimum viable change.** Close the DoD and stop outside the agreed scope.
- **Anti-scope is a guardrail.** What will not change is part of the contract.
- **Knowledge compounds.** Each cycle leaves the project easier to understand.

## Distribution

The source of truth is this directory in
[`pe-menezes/vibeflow`](https://github.com/pe-menezes/vibeflow). The repository
root carries separate Claude and Codex marketplace catalogs that both resolve
to this package. GitHub Actions publishes a Claude-only compatibility view to
[`pe-menezes/vibeflow-claude`](https://github.com/pe-menezes/vibeflow-claude).

## Documentation

- [vibeflow.run](https://vibeflow.run) — command reference and examples
- [MANUAL.md](https://github.com/pe-menezes/vibeflow/blob/main/MANUAL.md) — complete guide in Portuguese
- [CHANGELOG.md](https://github.com/pe-menezes/vibeflow/blob/main/CHANGELOG.md) — version history

## License

MIT
