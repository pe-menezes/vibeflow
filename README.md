# Vibeflow

[![npm version](https://img.shields.io/npm/v/setup-vibeflow)](https://www.npmjs.com/package/setup-vibeflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Website](https://img.shields.io/badge/vibeflow.run-docs%20%26%20examples-8A2BE2)](https://vibeflow.run)

**Spec-driven development** — define what to build before you code.

Vibeflow separates the thinker from the implementer. The Architect (you + AI) defines specs, makes decisions, and cuts scope. The Coding Agent receives a self-contained prompt pack and implements following the project's real patterns.

## Quick start (3 commands)

```
analyze              → scans your codebase, builds .vibeflow/ knowledge
gen-spec "feature"   → generates spec with DoD, scope, patterns
implement <spec>     → implements with guardrails (budget, DoD, tests)
```

That's it. Run `analyze` once, then `gen-spec` → `implement` for each feature.

## The full pipeline

```
analyze → discover → gen-spec → (prompt-pack | implement) → audit
```

| Step | What it does | When to use |
|------|-------------|-------------|
| **analyze** | Deep-scans the codebase, generates `.vibeflow/` | Initial setup or after major code changes |
| **discover** | Turns a vague idea into a PRD | The idea isn't clear yet |
| **gen-spec** | Generates a spec with binary DoD | Idea is clear, ready to specify |
| **implement** | Implements from spec with guardrails (budget, DoD, patterns) | Spec approved, agent has filesystem access |
| **prompt-pack** | Creates a self-contained prompt for a coding agent | Spec approved, need to delegate to another agent/session |
| **audit** | Verifies DoD + patterns + tests | Implementation done, time to validate |

Plus utility commands: **quick** (fast-track for small tasks), **teach** (update knowledge base, import patterns from external repos via `--from`), **stats** (audit statistics).

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

**Claude Code CLI (terminal):**

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
