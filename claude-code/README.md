# Vibeflow

> Spec-driven development for AI agents. Define what to build, let the agent build it right.

Vibeflow is a plugin for [Claude Code](https://code.claude.com) and
[Claude Cowork](https://claude.com/product/cowork) that separates thinking
from coding. It analyzes your codebase, generates grounded specs with a
Definition of Done, implements with guardrails (budget, anti-scope, pattern
compliance), and audits the result — all driven by your project's real patterns.

## Install

### Option A: From GitHub marketplace (recommended)

In Claude (Add marketplace from GitHub), use:

```text
pe-menezes/vibeflow-claude
```

Important: the marketplace repo is **vibeflow-claude** (synced from this repo). Use `owner/repo` or the full GitHub URL, not the raw `marketplace.json` URL.

In Claude Code CLI:

```bash
/plugin marketplace add pe-menezes/vibeflow-claude
/plugin install vibeflow@vibeflow-marketplace
```

### Option B: From a local marketplace (development)

```bash
# 1. Create a marketplace wrapper
mkdir vibeflow-marketplace
cd vibeflow-marketplace
mkdir .claude-plugin

# 2. Create marketplace.json
cat > .claude-plugin/marketplace.json << 'EOF'
{
  "name": "vibeflow-marketplace",
  "owner": { "name": "Vibeflow" },
  "plugins": [{
    "name": "vibeflow",
    "source": "./vibeflow-plugin",
    "description": "Spec-driven development for AI agents"
  }]
}
EOF

# 3. Clone the plugin (marketplace repo)
git clone https://github.com/pe-menezes/vibeflow-claude.git vibeflow-plugin

# 4. In Claude Code
/plugin marketplace add /path/to/vibeflow-marketplace
/plugin install vibeflow@vibeflow-marketplace
# Restart Claude Code
```

### Option C: Upload to Cowork

In the Cowork desktop app:
1. Go to Customize → Browse Plugins → Upload Plugin
2. Select the `vibeflow` folder (this repo)
3. The plugin loads automatically

## Quick Start (3 commands)

```
/vibeflow:analyze              → scans your codebase, builds .vibeflow/ knowledge
/vibeflow:gen-spec "feature"   → generates spec with DoD, scope, patterns
/vibeflow:implement <spec>     → implements with guardrails (budget, DoD, tests)
```

That's it. Run `analyze` once, then `gen-spec` → `implement` for each feature.

## All Commands

### Core Pipeline

| Command | Description |
|---------|-------------|
| `/vibeflow:analyze` | Deep-analyzes the codebase, builds pattern docs in `.vibeflow/` |
| `/vibeflow:gen-spec <feature>` | Generates a spec with DoD, scope, anti-scope, applicable patterns |
| `/vibeflow:implement <spec>` | Implements from spec with guardrails (budget, DoD, patterns, tests) |

`analyze` supports `--fresh`, `--scope <path>`, `--interactive`, and `--satellite <url>` flags.

### Secondary

| Command | Description |
|---------|-------------|
| `/vibeflow:audit <spec>` | Audits implementation against DoD + patterns + tests (PASS / PARTIAL / FAIL) |
| `/vibeflow:discover <idea>` | Interactive dialogue to turn a vague idea into a PRD (1–5 rounds) |
| `/vibeflow:prompt-pack <spec>` | Generates a self-contained prompt pack with embedded patterns for any agent |

### Utility

| Command | Description |
|---------|-------------|
| `/vibeflow:quick <description>` | Fast-track: generates prompt pack directly for small tasks (≤4 files) |
| `/vibeflow:teach <feedback>` | Updates `.vibeflow/` with corrections, conventions, or decisions |
| `/vibeflow:stats` | Compiles audit statistics: pass rates, common violations, trends |

## How It Works

```
/vibeflow:analyze → discovers codebase patterns (run once)
        ↓
/vibeflow:discover → dialogue → PRD (when the idea is vague)
        ↓
/vibeflow:gen-spec → spec with DoD and patterns (accepts PRD as input)
        ↓
/vibeflow:implement → implements from spec with guardrails (Claude Code)
   or /vibeflow:prompt-pack → self-contained prompt for other agents
        ↓
/vibeflow:audit → verifies DoD + pattern compliance
        ↓
    PASS? Ship. PARTIAL/FAIL? Incremental prompt → repeat
```

**Shortcuts:**
- `/vibeflow:quick "description"` → prompt pack directly (skips discover/spec)
- `/vibeflow:analyze --satellite <url>` → analyze a dependency repo (e.g. design system)

## Project Knowledge (.vibeflow/)

When you run `/vibeflow:analyze`, Vibeflow scans your codebase and creates
a `.vibeflow/` directory with curated documentation:

```
.vibeflow/
├── index.md              # Project overview, structure, key files
├── conventions.md        # Coding conventions with real examples
├── decisions.md          # Architectural decisions log (grows with use)
├── patterns/
│   └── <varies>.md       # One doc per discovered pattern (adaptive)
├── prds/                 # PRDs from /vibeflow:discover
├── specs/                # Specs from /vibeflow:gen-spec
├── prompt-packs/         # Prompt packs from /vibeflow:prompt-pack and :quick
└── audits/               # Audit reports from /vibeflow:audit
```

**Everything lives in `.vibeflow/`.** One folder to commit or gitignore as you prefer.

**This is adaptive.** Vibeflow doesn't assume your project is a monorepo,
a Next.js app, or any specific structure. It discovers what your project
actually is and creates pattern docs that match.

**This is real, not theoretical.** Every pattern doc includes actual code
from your repo showing how the pattern works. When a prompt pack is generated,
these real examples are embedded so the coding agent follows your conventions
exactly.

**This grows with use.** The initial analyze builds the foundation. Every
subsequent spec, prompt pack, and audit can update the knowledge — new patterns
discovered, decisions made, pitfalls encountered.

**Commit it to git.** The `.vibeflow/` directory is living documentation.
Review it, commit it, and your whole team benefits.

## Plugin Structure

```
vibeflow/
├── .claude-plugin/
│   └── plugin.json         # Plugin manifest (name, version, description)
├── skills/
│   ├── analyze/SKILL.md    # Deep codebase analysis
│   ├── discover/SKILL.md   # Idea → PRD dialogue
│   ├── gen-spec/SKILL.md   # PRD/idea → technical spec
│   ├── implement/SKILL.md  # Spec → code with guardrails
│   ├── audit/SKILL.md      # DoD + pattern verification
│   ├── prompt-pack/SKILL.md # Spec → self-contained prompt
│   ├── quick/SKILL.md      # Fast-track for small tasks
│   ├── teach/SKILL.md      # Update .vibeflow/ knowledge
│   ├── stats/SKILL.md      # Audit statistics
│   └── spec-driven-dev/SKILL.md  # Methodology (auto-loaded)
└── agents/
    └── architect.md        # Senior architect sub-agent
```

## Agent: Architect

The **architect** sub-agent is a senior CTO/CPO that thinks before coding.
It has persistent memory (`memory: project`) and reads `.vibeflow/` docs
before every task. Claude delegates to it for planning and architecture decisions.

It never writes implementation code — only specs, prompt packs, and audits.

## Skill: spec-driven-dev

The **spec-driven-dev** skill loads automatically when Claude detects
planning, architecture, or review context. It teaches Claude the full
methodology without you needing to invoke a command.

## Philosophy

- **No DoD, no work.** Every task needs binary pass/fail checks.
- **Patterns first.** Specs and prompt packs reference real patterns from your repo.
- **Directional, not prescriptive.** Prompt packs give context, direction, and
  patterns to follow — not step-by-step instructions.
- **Minimum viable change.** Close the DoD. Nothing beyond.
- **Anti-scope is a guardrail.** What you won't do matters as much as what you will.
- **Knowledge compounds.** The more you use Vibeflow, the better it understands
  your project.

## Manual

See the [MANUAL.md](../MANUAL.md) for the full documentation of all commands and flows.

## Distribution

Claude Code requires a dedicated git repo for the marketplace.
The distribution repo (marketplace) is [pe-menezes/vibeflow-claude](https://github.com/pe-menezes/vibeflow-claude).
The source of truth for all files is this folder (`claude-code/`).

## License

MIT
