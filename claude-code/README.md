# Vibeflow

> Your vibe coding method. From discovery to shipping.

Vibeflow is a plugin for [Claude Code](https://code.claude.com) and
[Claude Cowork](https://claude.com/product/cowork) that structures the
full vibe coding cycle: discover what to build, analyze your codebase,
generate grounded specs, create self-contained prompt packs for coding
agents, and audit implementations against a Definition of Done AND your
project's real patterns.

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
    "description": "Spec-driven development: analyze, spec, prompt pack, audit"
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

## Commands

| Command | Description |
|---------|-------------|
| `/vibeflow:analyze [--fresh] [--scope <path>]` | Deep-analyze the codebase, build pattern docs in `.vibeflow/` |
| `/vibeflow:discover <idea>` | Interactive dialogue to turn a vague idea into a PRD |
| `/vibeflow:quick <description>` | Fast-track: generates prompt pack directly for small tasks (≤4 files) |
| `/vibeflow:gen-spec <feature>` | Generate a spec with DoD, scope, anti-scope, applicable patterns |
| `/vibeflow:prompt-pack <spec>` | Generate a self-contained prompt pack with embedded patterns |
| `/vibeflow:audit <spec>` | Audit implementation against DoD + patterns + tests |
| `/vibeflow:teach <feedback>` | Update `.vibeflow/` with corrections, conventions, or decisions |
| `/vibeflow:stats` | Show audit statistics: pass rates, common violations, trends |

## How It Works

```
/vibeflow:analyze → discovers codebase patterns (run once)
        ↓
/vibeflow:discover → dialogue → PRD (when the idea is vague)
        ↓
/vibeflow:gen-spec → spec with DoD and patterns (accepts PRD as input)
        ↓
/vibeflow:prompt-pack → self-contained prompt with real code
        ↓
    Coding agent implements
        ↓
/vibeflow:audit → verifies DoD + pattern compliance
        ↓
    PASS? Ship. PARTIAL/FAIL? Incremental prompt → repeat
```

**Fast-track:** `/vibeflow:quick "description"` → prompt pack directly (skips discover/spec)

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

## Agent: Architect

The **architect** sub-agent is a senior CTO/CPO that thinks before coding.
It has persistent memory (`memory: project`) and reads `.vibeflow/` docs
before every task. Claude delegates to it for planning and architecture decisions.

It never writes implementation code — only specs, prompt packs, and audits.

## Skill

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

Veja o [MANUAL.md](../MANUAL.md) para a documentação completa de todos os comandos e fluxos.

## Distribuição

O Claude Code exige um repo git dedicado para o marketplace.
O repo de distribuição (marketplace) é [pe-menezes/vibeflow-claude](https://github.com/pe-menezes/vibeflow-claude).
O source of truth dos arquivos está nesta pasta (`claude-code/`).

## License

MIT
