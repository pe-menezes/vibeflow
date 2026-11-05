# Vibeflow — OpenCode Edition

Vibeflow configuration files for **OpenCode** (checked against OpenCode 2.2.5).

## What's included

```
opencode/
├── agents/
│   ├── architect.md                              → .opencode/agents/ (primary agent — the Architect persona)
│   ├── executor.md                               → .opencode/agents/ (subagent — executor and fix rounds of the loop)
│   └── auditor.md                                → .opencode/agents/ (subagent — audit and re-audit rounds of the loop)
└── commands/
    ├── vibeflow-analyze.md                       → .opencode/commands/ (deep-analyze codebase)
    ├── vibeflow-gen-spec.md                      → .opencode/commands/ (feature/PRD → spec)
    ├── vibeflow-implement.md                     → .opencode/commands/ (spec → code with guardrails; --loop)
    ├── vibeflow-prompt-pack.md                   → .opencode/commands/ (spec → prompt pack)
    ├── vibeflow-audit.md                         → .opencode/commands/ (verify DoD + patterns)
    ├── vibeflow-discover.md                      → .opencode/commands/ (idea → PRD)
    ├── vibeflow-hotfix.md                        → .opencode/commands/ (evidence → trace doc + fix + test)
    ├── vibeflow-quick.md                         → .opencode/commands/ (fast-track ≤4 files)
    ├── vibeflow-teach.md                         → .opencode/commands/ (update .vibeflow/ + --from import)
    └── vibeflow-stats.md                         → .opencode/commands/ (audit statistics)
```

The workflows themselves are the shared skills of the plugin, unchanged: each `plugins/vibeflow/skills/<name>/` folder goes to `.opencode/skills/<name>/`, keeping its name, because OpenCode requires a skill's name to match its folder and the `implement` loop kit is reached as `loop/` inside the `implement` folder. Each command is a thin entry point that loads the skill of the same name and passes what you typed after it as `$ARGUMENTS`.

OpenCode names an agent and a command after its file, so the agents are `architect`, `executor` and `auditor` (the names the loop's orchestrator calls), and the commands carry the `vibeflow-` prefix to avoid clashing with the project's own commands.

## Installation

At the root of the target repo, copy the files into `.opencode/`:

- `opencode/agents/*.md` into `.opencode/agents/`
- `opencode/commands/*.md` into `.opencode/commands/`
- each `plugins/vibeflow/skills/<name>/` folder, with everything inside it, into `.opencode/skills/<name>/`

OpenCode does not read Claude Code plugins (`~/.claude/plugins/`), so the Claude Code plugin being installed on the same machine does not make the workflows available here.

## Usage

### Slash commands
Type `/` in OpenCode and pick the command:

**Core:**
- `/vibeflow-analyze` — analyzes the codebase and generates `.vibeflow/` (flags: `--fresh`, `--scope`, `--interactive`, `--satellite`, `--measure`)
- `/vibeflow-gen-spec` — generates a spec with DoD, scope, anti-scope and applicable patterns
- `/vibeflow-implement` — implements the spec with guardrails (budget, DoD, patterns); `--loop` turns on the execution loop (below), `--no-loop` turns it off for one run
- `/vibeflow-prompt-pack` — generates a self-contained prompt pack with embedded patterns

**Secondary:**
- `/vibeflow-audit` — audits the implementation against DoD + patterns + tests + Critical Gate (PASS / PARTIAL / FAIL), from a review package of the diff (`--package`, `--base <ref>`); `--reaudit <commit>` checks a fix round; `--probes` writes the probes and sabotages risk code when run by hand; `--consolidate-hotfixes` reclassifies hotfix trace docs
- `/vibeflow-discover` — interactive dialogue (1–5 rounds) that turns a vague idea into a PRD
- `/vibeflow-hotfix` — observed defect with reproducible evidence: trace doc + fix + regression test written before the fix, in one call

**Utilities:**
- `/vibeflow-quick` — fast-track for small tasks (≤4 files)
- `/vibeflow-teach` — updates `.vibeflow/` with corrections, conventions or decisions; `--from <url|path>` imports patterns from external repos
- `/vibeflow-stats` — audit statistics: rates, violations, trends, and the loop's numbers when there are ledgers in `.vibeflow/loop/`

A command runs in the agent you are in. OpenCode also offers the skills by themselves, so asking in plain words ("audit the last part") can load the matching skill without the command.

### The Architect agent
`architect` is a primary agent: switch to it with Tab, as you switch to OpenCode's own `plan`. It reads, searches, runs commands, edits, browses the web and asks you questions, and it can load the eight workflows its command table names (discover, analyze, gen-spec, prompt-pack, audit, quick, teach, stats). `implement` and `hotfix` write code, so they are denied there: run them from Build or any agent that can edit.

### Execution loop (opt-in)

Off by default. With `/vibeflow-implement <spec> --loop` (or `loop: true` in `.vibeflow/loop/config.md`), the session becomes the orchestrator: the executor implements each part in a fresh session, the independent audit runs in another one, and there are at most two fix rounds. In OpenCode, each fresh session is a call of the `subagent` tool in the foreground, to the `executor` agent for executor and fix rounds and to the `auditor` agent for audits; the call returns when the round ends. Without these agents installed, the orchestrator calls OpenCode's `general` agent instead. The kit's scripts need Node.js 18 or newer (below that they exit with code 64). Details in [MANUAL.md](../MANUAL.md) (in Portuguese).

## What OpenCode does not have

- **No restriction by allow-list.** OpenCode starts every agent from "allow everything" and lets the last matching permission rule win, so each agent opens with `"*": deny` and lists what its role may do after it. `executor` and `auditor` may read, search, run shell commands and edit; they cannot load skills, ask questions, browse or open another subagent. None of the three opens a subagent. Reading `.env` files asks first, as in OpenCode's own agents.
- **Paths outside the project ask first.** A file or command outside the project directory needs your answer in all three agents. The auditor's sabotage copies go to a temporary folder outside the project, so an audit that sabotages risk code asks for that folder.
- **No agent memory.** The Architect's body is the same text as the Claude Code agent, which keeps a `MEMORY.md` index through Claude Code's project memory; OpenCode has no such memory, so the knowledge lives in `.vibeflow/` alone. The same body lists the workflows as `/vibeflow:<name>`, the Claude Code form; in OpenCode the command is `/vibeflow-<name>`.
- **No `tools:` list.** The Claude Code agent files do not load in OpenCode as they are: a comma-separated `tools:` field makes OpenCode drop the file. Use the files in this folder.

## After installation

1. Run `/vibeflow-analyze` to generate the `.vibeflow/` folder.
2. Add `.vibeflow/` to git.
3. For new features, start with `/vibeflow-discover`.

See [MANUAL.md](../MANUAL.md) (in Portuguese) for the full documentation, or visit [vibeflow.run](https://vibeflow.run) for the command docs and more about the plugin.
