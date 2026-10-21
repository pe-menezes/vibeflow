# Vibeflow

[![npm version](https://img.shields.io/npm/v/setup-vibeflow)](https://www.npmjs.com/package/setup-vibeflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/vibeflow.run-docs%20%26%20examples-8A2BE2)](https://vibeflow.run)

### Stop vibe-coding blind. Spec it, then ship it.

AI agents write code fast — but without specs, they write the **wrong** code fast. Vibeflow adds a thinking layer before coding: you define **what** to build with specs, guardrails, and quality gates. The agent implements following your project's real patterns.

> Works with **Codex** and **Claude Code** through one shared plugin, plus **Cursor** (rules + skills) and **GitHub Copilot** (prompts + agents).

## 3 commands to start

```
analyze              → scans your codebase, builds .vibeflow/ knowledge base
gen-spec "feature"   → generates spec with Definition of Done, scope, patterns
implement <spec>     → implements with guardrails (budget, DoD, tests)
```

Run `analyze` once, then `gen-spec` → `implement` for each feature. That's it.

## The pipeline

> **Think** before you code. **Build** from specs. **Verify** against DoD.

`analyze` → `discover` → `gen-spec` → `implement` → `audit`

| Command | What it does | When to use |
|---------|-------------|-------------|
| **analyze** | Deep-scans codebase → `.vibeflow/` knowledge base | Setup, or after major changes |
| **discover** | Dialogue that turns a vague idea into a PRD | Idea isn't clear yet |
| **gen-spec** | Generates spec with binary DoD, scope, anti-scope | Ready to specify |
| **implement** | Implements from spec with guardrails (budget, DoD, patterns); `--loop` runs the execution loop below | Spec approved, ready to code |
| **prompt-pack** | Self-contained prompt for another agent/session | Need to delegate |
| **audit** | Verifies DoD + patterns + tests + destructive-op gate from a review package of the diff, with a severity and a cause on every finding; `--reaudit` checks a fix round, `--probes` writes probe tests and sabotages risk code when run by hand, `--consolidate-hotfixes` reclassifies hotfix trace docs | After implementation |
| **hotfix** | Traceable fix in one call: trace doc + fix + regression test written before the fix | Observed defect with reproducible evidence |

**Utility:** `quick` (fast-track small tasks), `teach` (update knowledge base), `stats` (audit trends, plus the loop's numbers when you use it).

## The execution loop (opt-in)

`implement --loop` splits the work between sessions that cannot grade
themselves: the session you call becomes the orchestrator, an executor
implements each part in a fresh session, an independent audit checks it in
another one, and at most two fix rounds follow, each re-audited on its own
diff. With your OK, asked once per feature, every round is committed on the
feature branch, and the loop ends in company mode: a pull request whose body carries the evidence (verdicts, DoD,
findings, probes, commands run), opened after the suite runs in the CI's
environment. The agent never merges, deploys, migrates a shared environment or
reads production.

The loop is off by default, and nothing changes unless you turn it on:
`implement --loop` for one run, or `loop: true` in `.vibeflow/loop/config.md`
for the project (`--no-loop` turns it off for one run). It needs the loop kit,
which ships inside the `implement` skill (`plugins/vibeflow/skills/implement/loop/`),
and Node.js 18 or later for the kit's scripts. Claude Code and Codex get the kit
with the plugin; the Cursor and Copilot installers copy it into the project. See
[`MANUAL.md`](MANUAL.md) for the roles, the artifacts and the ceilings.

## Editions

Each edition adapts the same methodology to the agent's format. Codex and
Claude share the exact same skill sources under `plugins/vibeflow/`; their
platform-specific manifests only handle packaging and discovery.

### Codex (plugin)

```bash
codex plugin marketplace add pe-menezes/vibeflow
codex plugin add vibeflow@vibeflow-marketplace
```

Start a new task after installation. Ask naturally — for example, “analyze this
project with Vibeflow” — and Codex selects the matching focused skill.

### Claude Code (plugin — no npx)

Claude Code uses its own **plugin system**, not file downloads.

**Claude Desktop (Cowork):**

1. Sidebar → **Customize**
2. Click **+** next to "Personal plugins" → **Add marketplace**
3. Paste: `pe-menezes/vibeflow`
4. Click **Sync**
5. **Browse plugins** → Install **Vibeflow**

**Claude Code CLI (terminal only — these do NOT work in Desktop chat):**

```bash
/plugin marketplace add pe-menezes/vibeflow
/plugin install vibeflow@vibeflow-marketplace
```

Then run `/vibeflow:analyze` to get started. The plugin also brings the `vibeflow:executor` and `vibeflow:auditor` agents that `implement --loop` dispatches.

> **Source:** [`plugins/vibeflow/`](plugins/vibeflow/) in this repo. Existing users of [pe-menezes/vibeflow-claude](https://github.com/pe-menezes/vibeflow-claude) remain supported through an automatic compatibility mirror.

### Cursor

```bash
npx setup-vibeflow@latest --cursor
```

The loop kit goes to `.cursor/skills/vibeflow-implement/loop/`. See [`cursor/README.md`](cursor/README.md) for details.

### GitHub Copilot

```bash
npx setup-vibeflow@latest --copilot
```

The loop kit goes to `.github/vibeflow/loop/`. See [`copilot/README.md`](copilot/README.md) for details.

> By default the installer adds installed files and the `.vibeflow/` folder to `.gitignore`. Remove the "Vibeflow" block from `.gitignore` if you want to track them in git.

### Edition summary

| Edition | Install method | Command |
|---------|---------------|---------|
| **Codex** | Plugin marketplace | `codex plugin marketplace add pe-menezes/vibeflow`<br>`codex plugin add vibeflow@vibeflow-marketplace` |
| **Claude Code** | Plugin (inside Claude Code) | See install steps above |
| **Cursor** | npx installer | `npx setup-vibeflow@latest --cursor` |
| **GitHub Copilot** | npx installer | `npx setup-vibeflow@latest --copilot` |

## Prompt baseline

Vibeflow's prompts are written for the 2026 frontier generation — they state
rules once, without caps emphasis or restated knowledge, and leave judgment to
the model where a script would only guess. They work best on current models.
If a command misbehaves on an older one, that's a regression worth an issue,
not something to work around locally. Style guide:
[`proposals/unhobbling-style.md`](proposals/unhobbling-style.md).

## Documentation

- [vibeflow.run](https://vibeflow.run) — Website with command reference, examples, and plugin docs
- [MANUAL.md](MANUAL.md) — Full documentation of all commands, flows, and methodology (PT-BR)
- [CHANGELOG.md](CHANGELOG.md) — Version history

## License

[MIT](LICENSE)
