# Vibeflow

> Spec-driven development for AI agents. Define what to build, let the agent build it right.

Vibeflow is a shared plugin for Codex, Claude Code, Claude Desktop and Hermes
Agent. It analyzes your codebase, generates grounded specs with a binary
Definition of Done, implements within explicit scope and budget guardrails, and
audits the result against your project's real patterns.

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

### Hermes Agent

Install the package from this repository's path and enable it:

```bash
hermes plugins install pe-menezes/vibeflow/plugins/vibeflow
hermes plugins enable vibeflow
```

The install scan reads the kit README's description of the secret detector as
a secret; `--force` installs; a catalog listing removes the prompt. Start a new
Hermes session after installation so the skills are loaded. As in Codex, the
skills are selected from natural-language requests; Hermes has no slash
commands for them.

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
Codex and Hermes, describe the same goal naturally and the matching skill is
discovered from its description.

## Workflows

| Skill | What it does |
|-------|--------------|
| `analyze` | Deep-analyzes the codebase and builds `.vibeflow/` project knowledge |
| `discover` | Turns a vague idea into a focused PRD through a short dialogue |
| `gen-spec` | Produces an implementation contract with binary DoD and anti-scope |
| `implement` | Implements an approved spec within its budget and patterns; `--loop` runs the execution loop |
| `audit` | Checks DoD, patterns, tests, and the destructive-operation Critical Gate from a review package; `--reaudit` checks a fix round |
| `hotfix` | Fixes an evidenced defect with a trace document and regression test |
| `prompt-pack` | Creates a self-contained handoff for another agent or task |
| `quick` | Fast-tracks a clear task that fits in four files or fewer |
| `teach` | Adds corrections, conventions, decisions, or imported patterns |
| `stats` | Aggregates audit verdicts, gaps, and quality trends, plus the loop's numbers |

## The execution loop

`implement --loop` is off by default: without it, `implement` runs its
pipeline (phases 0 to 8) as before. With it (or `loop: true` in
`.vibeflow/loop/config.md`; `--no-loop` turns it off for one run), the session
becomes the orchestrator: an executor implements each part in a fresh session,
the orchestrator checks the work from outside, an independent audit reads it
from a review package, and at most two fix rounds follow, each re-audited on
its own diff. With your OK, asked once per feature, every round is committed
on the feature branch, and the loop ends with a pull request carrying the
evidence. The agent never merges, deploys, migrates a shared environment or
reads production.

In Claude Code the rounds run in the `vibeflow:executor` and `vibeflow:auditor`
agents; in Codex, in a native subagent or a new task given the briefing's path;
in Hermes, in a `delegate_task` task whose `goal` points at the briefing and
whose `context` names the role file, its result arriving as a new turn at the
end of the round, or in the `delegate_task` call itself in a session with no
later-result consumer, such as a one-shot CLI run or cron, where the
orchestrator reads it and goes on.
The loop kit (principles, briefing templates, the orchestrator's flow, the PR
body template, the role files and the scripts) lives in
`skills/implement/loop/` and ships with the plugin. Its scripts need Node.js 18
or later and exit 64 below it; `preflight.mjs --power` is macOS only. In
Claude Code the loop needs version 2.1.69 or newer, the one that substitutes
`${CLAUDE_SKILL_DIR}` in a skill's body. An `audit` run by hand needs it too,
to build its review package: on an older version it does not find the kit,
records `Review package: none (kit not installed)` and computes the diff as
before, and updating Claude Code, not the plugin, fixes it. In Codex and
Hermes the variable is never substituted, and the skills resolve the kit path
from their own folder.

The pull request at the end is opened with `gh`, so it needs a remote on GitHub
(or GitHub Enterprise) and `gh auth status` ok for its host; the `pr ending`
line of `preflight.mjs` tells you before the first dispatch. Without it, the
loop pushes the branch and writes the body to
`.vibeflow/reviews/<feature>-pr-body.md`, for you to open the pull request or
merge request by hand. On GitHub Enterprise, the watch of the checks takes the
`origin` host in `--repo`; that host form was checked only against a fake
`gh`, not against a real GitHub Enterprise.

A standalone `audit` writes the probe file and sabotages risk code only with
`--probes`; without it, the report lists the probe cases as code and records
`Sabotage: skipped (standalone audit; --probes runs it)`. The copy each
sabotage is undone from goes to a temporary folder outside the project, never
to `.vibeflow/`; each copy is deleted once its file is restored and its hash
checked, and the folder after the last restore.

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
├── audits/
├── loop/          # implement --loop: ledgers and config.md
├── briefings/     # one briefing per round
├── progress/      # executor and fix rounds' progress files
└── reviews/       # review packages and the PR body (working copies, not versioned)
```

Commit `.vibeflow/` with the project, except `reviews/`: it holds working
material, the review packages (copies of the diff and of the new files each
audit reads, rewritten on every audit) and the PR body, so add
`.vibeflow/reviews/` to your `.gitignore`.

The knowledge is adaptive: it is grounded in code that actually exists in the
project, and it compounds as specs, decisions, fixes, and audits are added.

## Package structure

```text
plugins/vibeflow/
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── plugin.json              # Hermes Agent manifest (Agent Plugins v1)
├── skills/
│   ├── <workflow>/SKILL.md
│   └── implement/loop/      # the loop kit: README.md, manifest.json, scripts/, roles/
└── agents/
    ├── architect.md
    ├── executor.md
    └── auditor.md
```

The ten skills are the shared source of truth. The Claude manifest exposes the
Claude-specific architect sub-agent with project-scoped persistent memory, and
the executor and auditor agents whose bodies are byte-identical to
`skills/implement/loop/roles/`;
Codex exposes only the shared skills and uses `.vibeflow/` as durable project
context through its native task/agent model. Hermes, reading `plugin.json`,
exposes only the shared skills as well: it ignores `agents/` and accepts
`allowed-tools` in a skill's frontmatter without applying it.

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
to this package, and Hermes installs it from the package's path in the
repository. GitHub Actions publishes a Claude-only compatibility view to
[`pe-menezes/vibeflow-claude`](https://github.com/pe-menezes/vibeflow-claude).

## Documentation

- [vibeflow.run](https://vibeflow.run) — command reference and examples
- [MANUAL.md](https://github.com/pe-menezes/vibeflow/blob/main/MANUAL.md) — complete guide in Portuguese
- [CHANGELOG.md](https://github.com/pe-menezes/vibeflow/blob/main/CHANGELOG.md) — version history

## License

MIT
