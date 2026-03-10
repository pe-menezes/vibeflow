# Vibeflow

[![npm version](https://img.shields.io/npm/v/setup-vibeflow)](https://www.npmjs.com/package/setup-vibeflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

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

Plus utility commands: **quick** (fast-track for small tasks), **teach** (update knowledge), **stats** (audit statistics).

## Editions

| Edition | Folder | Install |
|---------|--------|---------|
| **GitHub Copilot** | [`copilot/`](copilot/) | `npx setup-vibeflow@latest --copilot` |
| **Cursor** | [`cursor/`](cursor/) | `npx setup-vibeflow@latest --cursor` |
| **Claude Code** | [`claude-code/`](claude-code/) | `pe-menezes/vibeflow-claude` |

Each edition adapts the same prompts and methodology to the agent's format.
The methodology content is the same — only the file structure changes.

### Claude Code

Claude Code uses a git-based plugin system. The distribution repo (marketplace) is maintained separately:

**Distribution repo:** [pe-menezes/vibeflow-claude](https://github.com/pe-menezes/vibeflow-claude) — auto-synced from `claude-code/` in this repo.

Install via Claude Code CLI:
```
pe-menezes/vibeflow-claude
```

### Cursor

See [`cursor/README.md`](cursor/README.md) for installation instructions.

Or use the automatic installer:
```bash
npx setup-vibeflow@latest --cursor
```

### GitHub Copilot

See [`copilot/README.md`](copilot/README.md) for installation instructions.

Or use the automatic installer:
```bash
npx setup-vibeflow@latest --copilot
```

> By default the installer adds installed files and the `.vibeflow/` folder to `.gitignore`. Remove the "Vibeflow" block from `.gitignore` if you want to track them in git.

## Documentation

- [vibeflow.run](https://vibeflow.run) — Website with command reference, examples, and plugin docs
- [MANUAL.md](MANUAL.md) — Full documentation of all commands, flows, and methodology (PT-BR)
- [CHANGELOG.md](CHANGELOG.md) — Version history

## License

[MIT](LICENSE)
