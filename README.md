# Vibeflow

[![npm version](https://img.shields.io/npm/v/setup-vibeflow)](https://www.npmjs.com/package/setup-vibeflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/vibeflow.run-docs%20%26%20examples-8A2BE2)](https://vibeflow.run)

### Stop vibe-coding blind. Spec it, then ship it.

AI agents write code fast — but without specs, they write the **wrong** code fast. Vibeflow adds a thinking layer before coding: you define **what** to build with specs, guardrails, and quality gates. The agent implements following your project's real patterns.

> Works with **Claude Code** (plugin), **Cursor** (rules + skills), and **GitHub Copilot** (prompts + agents).

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
| **implement** | Implements from spec with guardrails (budget, DoD, patterns) | Spec approved, ready to code |
| **prompt-pack** | Self-contained prompt for another agent/session | Need to delegate |
| **audit** | Verifies DoD + pattern compliance + tests | After implementation |

**Utility:** `quick` (fast-track small tasks), `teach` (update knowledge base), `stats` (audit trends).

## Editions

Each edition adapts the same prompts and methodology to the agent's format.
The methodology content is the same — only the file structure changes.

### Claude Code (plugin — no npx)

Claude Code uses its own **plugin system**, not file downloads.

**Claude Desktop (Cowork):**

1. Sidebar → **Customize**
2. Click **+** next to "Personal plugins" → **Add marketplace**
3. Paste: `pe-menezes/vibeflow-claude`
4. Click **Sync**
5. **Browse plugins** → Install **Vibeflow**

**Claude Code CLI (terminal only — these do NOT work in Desktop chat):**

```bash
/plugin marketplace add pe-menezes/vibeflow-claude
/plugin install vibeflow@vibeflow-marketplace
```

Then run `/vibeflow:analyze` to get started.

> **Source:** [`claude-code/`](claude-code/) in this repo → auto-synced to [pe-menezes/vibeflow-claude](https://github.com/pe-menezes/vibeflow-claude)

### Cursor

```bash
npx setup-vibeflow@latest --cursor
```

See [`cursor/README.md`](cursor/README.md) for details.

### GitHub Copilot

```bash
npx setup-vibeflow@latest --copilot
```

See [`copilot/README.md`](copilot/README.md) for details.

> By default the installer adds installed files and the `.vibeflow/` folder to `.gitignore`. Remove the "Vibeflow" block from `.gitignore` if you want to track them in git.

### Edition summary

| Edition | Install method | Command |
|---------|---------------|---------|
| **Claude Code** | Plugin (inside Claude Code) | See install steps above |
| **Cursor** | npx installer | `npx setup-vibeflow@latest --cursor` |
| **GitHub Copilot** | npx installer | `npx setup-vibeflow@latest --copilot` |

## Documentation

- [vibeflow.run](https://vibeflow.run) — Website with command reference, examples, and plugin docs
- [MANUAL.md](MANUAL.md) — Full documentation of all commands, flows, and methodology (PT-BR)
- [CHANGELOG.md](CHANGELOG.md) — Version history

## License

[MIT](LICENSE)
