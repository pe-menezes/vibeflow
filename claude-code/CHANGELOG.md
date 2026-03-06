# Changelog

### v1.3.0 (2026-03-06)

- **gen-spec: smart next-step suggestion** — In Claude Code, gen-spec now suggests implementing directly from the spec (since the agent has filesystem access to `.vibeflow/`), with prompt-pack as an optional fallback for separate sessions. Cursor and Copilot editions unchanged (still suggest prompt-pack by default).

### v1.2.0 (2026-03-03)

- **Analyze: `--scope <path>` flag** — Deep-dive into a specific module/directory. Requires a prior general analysis (`.vibeflow/` must exist). Inherits global context (stack, domain, conventions) and samples the target module densely (all files if ≤30, ≥80% if larger). Enriches existing global pattern docs with examples from the scoped module. Creates new pattern docs only for module-specific patterns not covered globally. Registers scoped analyses in `index.md`.
- All 3 editions (copilot, cursor, claude-code) updated in sync.

### v1.1.0 (2026-03-03)

- **Analyze: domain detection + mandatory patterns** — Phase 1 now classifies the project by domain (mobile, web-frontend, api-backend, library, cli) and activates a mandatory pattern checklist per domain. Mobile projects REQUIRE design-system, screen-composition, and navigation patterns; web frontends REQUIRE component-library, route-composition, and state-management; API/backends REQUIRE endpoint-definition, data-access, and auth/middleware.
- **Analyze: progressive sampling scale** — Replaced fixed minimums ("≥2 per module, minimum 8 total") with a 6-level scale based on repo size: 8 → 12 → 20 → 30 → 40 → 50-60 files. Large repos (1000+ files) now get cross-module sampling: same layer sampled across 3-4 features to find the real pattern by repetition.
- **Analyze: mandatory pattern verification** — After sampling, REQUIRED patterns not covered trigger additional targeted sampling (2-3 files per missing pattern). Truly absent patterns are documented as "Not found" instead of silently omitted.
- **Analyze: cross-module pattern rule** — Horizontal pattern docs (UI, data, navigation, design system) must include examples from ≥3 features/modules.
- **Analyze: updated budget** — Max budget raised from 10 to 12 for repos with 2000+ source files. Mid-range adjusted (151-500 → ≤8, 501-2000 → ≤10).
- All 3 editions (copilot, cursor, claude-code) updated in sync.

### v1.0.0 (2026-03-01)

- **Stable release.** All 8 planned improvements implemented and verified.
- **Artifacts centralized in `.vibeflow/`** — PRDs, specs, prompt packs and audits now all live inside `.vibeflow/` (previously they were loose folders at repo root). One folder to commit or gitignore.
- `plugin.json` version aligned with MANUAL and CHANGELOG.
- Verify installation updated to list all 8 commands.
- Contextual budget referenced in skill guardrails (MANUAL).
- General consistency reviewed and corrected.

### v0.5.0 (2026-02-28)

- **New command: `/vibeflow:teach`** — structured feedback to update `.vibeflow/`. Accepts pattern corrections, new conventions, architectural decisions, and new patterns in natural language. Edits docs outside auto markers to survive incremental runs.
- **New command: `/vibeflow:stats`** — audit statistics. Reads all audit reports and compiles: PASS/PARTIAL/FAIL rates, most violated patterns, most failing DoD checks, quality trends.
- **Contextual budget** — `/vibeflow:analyze` now calculates a suggested budget based on project size (2-3% of source files, min 4, max 10) and writes it to `.vibeflow/index.md`. `gen-spec` and `prompt-pack` read this value. Fallback: ≤6 if unavailable.
- **Adaptive discover** — `/vibeflow:discover` now evaluates clarity after the first response. If problem, audience, and scope are already clear, uses fast-track (1-2 rounds instead of 3-5). Opening reformulated to invite upfront detail.
- **MANUAL.md trimmed** — changelog extracted to `CHANGELOG.md`. Sections condensed: commands reference, workflow example, file map. Target ~500 lines.

### v0.4.0 (2026-02-28)

- **New command: `/vibeflow:quick`** — fast-track for small tasks. A single command that generates a prompt pack directly, skipping discover and spec. Runs lightweight scan if `.vibeflow/` doesn't exist. Default budget ≤4 files. Ephemeral spec (not persisted).
- **Architect model → user's choice** — architect agent no longer hardcodes a model. It inherits whatever model the user has configured.
- **Mandatory tests in audit** — `/vibeflow:audit` now detects and runs tests automatically based on the project stack (npm test, pytest, cargo test, etc.). Test failure = automatic FAIL, regardless of DoD. `/vibeflow:prompt-pack` now always includes mandatory test commands section.

### v0.3.0 (2026-02-26)

- `/vibeflow:analyze` — **incremental analysis:**
  - **Phase 0 (new)** — Detect Mode: checks if `.vibeflow/` exists and if `--fresh` flag is present. Routes to fresh or incremental mode. On incremental: reads previous analysis date, runs `git log` to find changed files, identifies affected modules. On "no changes": reports "No changes detected" and exits early. Fallback to fresh if git unavailable.
  - **Phases 1-5 updated with incremental scoping:** Each phase now has an "Incremental mode:" paragraph describing what to preserve and what to re-analyze. Fresh mode unchanged.
  - **Marker system for pattern docs:** Pattern docs and `conventions.md` now use `<!-- vibeflow:auto:start/end -->` markers to delimit auto-generated sections. During incremental updates, only content within markers is regenerated; manual edits outside markers are preserved. Legacy pattern docs without markers are rewritten with markers added.
  - **decisions.md protection:** Never modified by analyze command in any mode (fresh or incremental). Created only on first run if doesn't exist. Reserved for architect and manual curation.
  - **Smart defaults:** `/vibeflow:analyze` (no args) runs incrementally if `.vibeflow/` exists. `--fresh` flag forces complete rebuild.
  - **Usage:** `/vibeflow:analyze [--fresh]`

### v0.2.0 (2026-02-26)

- `/vibeflow:analyze` — **enhanced to 6 phases with deep adaptive analysis and rules integration:**
  - Phase 1 now explicitly detects knowledge sources (`.cursorrules`, `.cursor/rules/*.mdc`, `CLAUDE.md`, `.clinerules`, `.github/copilot-instructions.md`, `/docs/`, `ARCHITECTURE.md`, `ADRs/`)
  - Phase 1.5 (new) — Rules Integration: extracts conventions from rules files, builds module map, validates rules against code, flags conflicts
  - Phase 2 (renamed from "Convention Mining") — adaptive sampling strategy: detects modules by directory/prefix/rules, reads ≥2 files per module, minimum 8 total, documents coverage gaps for large repos
  - Phase 3 (renamed from "Pattern Deep Dive") — expands scope using rules map; if a rule mentions a module not sampled, reads it for pattern docs
  - Phase 4 (renamed from "Compile") — `conventions.md` now incorporates rules-extracted conventions with source attribution; conflicts marked with ⚠️
  - Reporting now includes knowledge sources found, rules integrated, and conflicts detected

### v0.1.2 (2026-02-25)

- New command: `/vibeflow:discover` — interactive dialogue for PRD
- `gen-spec` accepts PRD as input (`/vibeflow:gen-spec prds/<slug>.md`)

### v0.1.1 (2026-02-25)

- Default output language now adapts to user's input language across all commands and agent

### v0.1.0 — Initial release

- `/vibeflow:analyze` — 5-phase adaptive codebase analysis, generates `.vibeflow/` pattern docs, updates architect MEMORY.md
- `/vibeflow:gen-spec` — grounded spec generation with Applicable Patterns section, reads `.vibeflow/` before writing
- `/vibeflow:prompt-pack` — self-contained prompt pack with real pattern code embedded, 8-section structure
- `/vibeflow:audit` — DoD + pattern compliance audit, incremental prompt pack on gaps, updates `decisions.md`
- **Architect agent** — `memory: project`, 2-layer knowledge system (MEMORY.md + `.vibeflow/`), maintains project knowledge across sessions
- **Skill: spec-driven-dev** — auto-loaded in planning contexts, enforces guardrails and methodology
- **`.vibeflow/`** — adaptive knowledge system committed to git, adaptive to any project type
