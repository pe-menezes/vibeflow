# Changelog

### v1.15.0 (2026-09-05)

- **Universal Claude + Codex plugin** — `plugins/vibeflow/` is now the single source of truth for the ten Vibeflow skills. The package carries both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, so the same workflows install natively in Claude Code and Codex without duplicated prompt logic.
- **One repository, two marketplaces** — `pe-menezes/vibeflow` now exposes the Claude catalog at `.claude-plugin/marketplace.json` and the Codex catalog at `.agents/plugins/marketplace.json`, both pointing to the shared plugin directory. The old `claude-code/` source tree was retired.
- **Legacy Claude distribution preserved** — the GitHub Actions workflow still publishes `pe-menezes/vibeflow-claude`, but it now derives that compatibility repository from the universal plugin. Existing Claude installations keep their update path while new installations can use the main repository.
- **Codex-native packaging** — all skills use portable skill frontmatter and remain focused, automatically discoverable workflows. Codex can select them from natural-language requests or users can invoke them explicitly; Claude keeps its namespaced slash commands.
- **Host-safe project memory** — the Claude architect now opts into project-scoped persistent memory, and `analyze` writes `MEMORY.md` only inside the exact memory directory exposed by that host. Codex exposes only the shared skills and keeps project knowledge in `.vibeflow/` without creating a Claude-only artifact. The Codex manifest uses the catalog capability vocabulary, the installation summary includes both required commands, and Cursor's `teach` description stays portable with the shared source.
- **Cross-edition regression coverage** — dependency-free CI now requires the same ten workflows and essential behavior contracts in the shared Claude/Codex plugin, Cursor skills, and Copilot prompt files. It also validates host frontmatter, shared marketplace versions, and the smoke harness's anti-scope precision so contextual directory references such as "no barrel file in `src/services/`" no longer report false violations.
- **CLI 0.16.0 and install surfaces** — `setup-vibeflow --codex` now prints the native Codex marketplace commands, while `--claude` points to the main repository. Root docs, contributor guidance, issue/PR templates, the smoke harness, and the bilingual site now understand the shared plugin layout.

### v1.14.0 (2026-08-16)

- **New command: `hotfix` — bug fixing that leaves a trace** — Production bugs used to make the agent abandon the method: no spec, no doc, no test (dogfooding 2026-07-12: 5 fixes with no trace). Now a dev with an observed defect and reproducible evidence runs `/vibeflow:hotfix` and gets, in one call, a trace doc + the fix + a red→green regression test — or a named HALT that saves the doc and is resumable later. The doc lives at `.vibeflow/hotfixes/<YYYY-MM-DD>-<slug>.md` (one file per bug), written in two beats: `Symptom`, `Checkpoint`, `Preservation`, `origin` before any code edit; `Root cause`, `Fix`, `DoD` (2–4 binary checks), `Regression` (with `oracle_type` / `reproduction` / `verification`), `Deviations`, `status` after. Guardrails: red proof before touching code (a regression test that doesn't fail on the current code → HALT `cannot-reproduce`), a closed 6-condition HALT set, a 3-attempt breaker, and `verified` only with real reproduction + red→green + project suite green + clean Critical Gate — anything less degrades to `partial`, declared. Three entry flows (post-investigation in conversation — transcribed, not re-investigated —, symptom + evidence in the prompt, third-party evidence) plus resuming a `halted(...)` doc. The final report never commits: it instructs committing fix + test + doc together, and when the doc path is gitignored (standard Copilot/Cursor installs ignore `.vibeflow/` entirely) it guides `git add -f` or a `.vibeflow/*` + `!.vibeflow/hotfixes/` carve-out in the Vibeflow block of `.gitignore` — guidance in the report, not an installer change. The Copilot and Cursor persistent layers (`vibeflow.instructions.md`, `vibeflow.mdc`) gain `.vibeflow/hotfixes/` in "Where Things Live" and the command in their lists — and, as a declared ride-along, fix the pre-existing omission of `vibeflow-implement` in those same lists. All 3 editions updated.

- **`quick`: boundary handed to `hotfix`** — `quick`'s description no longer offers "bug fix" as an example, and its "Not for:" list gains the boundary: an observed defect with reproducible evidence → `hotfix`. In Cursor, where auto-invocation decides by descriptions, both sides of the boundary were recalibrated together — `hotfix` triggers on defect + reproducible evidence, `quick` keeps the small planned task. All 3 editions updated.

- **`audit`: `--consolidate-hotfixes` (turn hotfix traces into durable state)** — The new flag scans `.vibeflow/hotfixes/*.md` and, for each doc, re-executes the doc's own `DoD` checks and regression test against the current code — deterministic by construction: only what each doc carries, never a blanket re-audit — classifying `still-holds` (DoD green), `promote` (permanent behavior detected → gen-spec entry stub in the report; the human decides) or `regressed` (→ gap wired into the audit's existing incremental prompt pack). Docs with `reproduction` below `real` or `status: partial` are listed as priority debt, never silenced. Without the flag, the normal audit report gains a single nudge line counting unconsolidated docs — printed only when `.vibeflow/hotfixes/` has docs, so projects without hotfixes see no output change and the smoke-harness report contract stays intact. All 3 editions updated.

- **CLI 0.15.0** — `setup-vibeflow` now installs the hotfix surfaces: `vibeflow-hotfix.prompt.md` on Copilot installs and `vibeflow-hotfix/SKILL.md` on Cursor installs. List entries only, no installer logic changed; the existing `.gitignore` wildcards (`vibeflow-*.prompt.md`, `.cursor/skills/vibeflow-*/`) already cover the new files.

### v1.13.0 (2026-08-15)

- **All 35 prompt surfaces rewritten for the 2026 frontier generation** — Vibeflow's prompts were written in the pre-Claude-5 dialect: caps as emphasis (`MANDATORY`, `NEVER`, `Do NOT`), `⚠️` warnings, the same rule restated across a phase, a summary table and an error table of the same file, per-stack test-runner enumerations the model already knows, and scripted wording for decisions a model makes well. On the current generation each of those costs twice — input tokens plus the thinking tokens to reconcile them — and emphasis written to overcome old-model reluctance now causes over-triggering. Every command, agent, rule and instruction file across the 3 editions was rewritten to state each rule once, in the place it applies, with the reason where one exists. Guardrails stayed literal and byte-checked: budget values, DoD limits (3–7 binary checks), anti-scope as a hard stop, the Critical Gate's ~40-rule catalog, the `<!-- vibeflow:start/end -->` marker contracts, artifact paths and output templates. Measured: **302,409 → 237,024 chars (−21.6%, ~16,300 tokens)** across the 35 files, against a committed target of ≥20%. Delete-list, keep-list, retention test, before/after pairs from this repo and the per-file ledger are in `proposals/unhobbling-style.md`, now normative for new prompts. All 3 editions updated.

- **`gen-spec`: rich references in specs** — When the input points at a test suite, a mockup, code to port, or a reference implementation, the generated spec gains an optional `## References` section recording each one with the role it plays ("the suite that defines the behavior", "the mockup to replicate", "the implementation to port"). `prompt-pack` propagates them, applying the same self-containment rule the embedded patterns already use: content goes into the pack when it fits, otherwise a verified path plus what the agent should take from it. The DoD guidance also gains a condition — where the project has a detectable test runner, at least one check names an executable test, existing or to be written; with no runner, nothing changes. The section is optional and `implement`, `audit` and `quick` are untouched: they validate DoD, Scope and Anti-scope, so specs written before this release stay valid. All 3 editions updated.

- **`audit`: reports every finding, filters at the verdict** — The audit no longer decides for you what was important enough to mention. Every finding is reported, including uncertain and low-severity ones, each with a confidence level and an estimated severity. Filtering happens at the verdict, where severity and confidence decide what blocks (FAIL), what caps the result at PARTIAL, and what is only a note. All 3 editions updated.

- **Docs** — `CONTRIBUTING.md`'s prompt style guidance rewritten for the new dialect and pointed at the style guide; its stale "Copilot is the source of truth" line corrected to Claude Code, matching `CLAUDE.md` and the sync workflow. `README.md` and `MANUAL.md` declare the prompt baseline: written for the 2026 frontier generation, and misbehavior on an older model is a regression worth an issue rather than a local workaround. Edition READMEs unchanged — no command description changed, so their command tables are still accurate.

### v1.12.0 (2026-06-03)

- **`audit`: new Critical Gate (destructive-op safety scan)** — `audit` now diffs the implementation (`git diff`) and scans it against a ~40-rule catalog across 6 domains (Database, Security, IaC, Kubernetes, Config, Data) for destructive or dangerous operations the DoD never mentions — removed auth middleware, `DROP TABLE`, hardcoded secrets, `0.0.0.0/0` CIDRs, mass deletes, etc. Unresolved CRITICAL/HIGH findings force a **FAIL** (mirroring "Test FAIL = Audit FAIL"); WARNING caps the verdict at PARTIAL; INFO is a note. Findings can be suppressed with a `vibeflow:allow <RULE_ID>: <reason>` override (CRITICAL/HIGH require a justification). v1 uses a prompt-embedded catalog; a Node engine in `cli/` is planned for v2. Design doc: `proposals/critical-gate.md`. Ported and sized down from the chama plugin's Critical Gate. All 3 editions updated.

### v1.11.0 (2026-06-03)

- **`implement`: new Phase 6 "Refine" (simplify in-scope)** — After tests pass, the coding agent now reviews and cleans the code it just wrote (reuse, naming, dead code, efficiency) before self-verifying DoD. The refinement is strictly bounded: diff-only, behavior-preserving, within budget and anti-scope, and gated by a green baseline — if the post-refine test run regresses, the changes are reverted. Pipeline goes from 7 to 8 phases. Inspired by the `simplify` step in the chama plugin's compose pipeline, adapted to vibeflow's local, no-commit model. All 3 editions updated. Site highlight updated.

### v1.10.0 (2026-03-23)

- **`analyze`: conventions.md now includes `## Don'ts` section** — Prohibitive rules are mined from anti-patterns, rule sources, and stack-specific pitfalls. Coding agents need to know what NOT to do, not just what to do. Don'ts must be specific and grounded in the actual codebase, not generic best practices.
- **`gen-spec`: DoD requires at least 1 craftsmanship check** — Specs must include at least one quality gate (pattern compliance, convention violations, typing, error handling) alongside functional checks. Prevents purely functional DoDs that miss code quality.
- All 3 editions updated.

### v1.9.0 (2026-03-13)

- **`teach --from`: import patterns from external repos** — New flag `--from <url|path>` on the `teach` command imports patterns and conventions from an external reference repo (e.g., shared architecture docs, coding guidelines). Clones the repo (shallow, ephemeral), detects knowledge sources (skills, CLAUDE.md, docs/, knowledge/, .cursorrules, etc.), presents an interactive review, and saves selected patterns to `.vibeflow/patterns/external-<name>/` with provenance and `confidence: imported`. Supports local paths, `--name` alias, and re-import. All 3 editions updated. Site commands page updated.
- **`gen-spec`: PRD validation gate** — gen-spec now validates PRDs (from `.vibeflow/prds/` or external) before generating the spec. Runs 5 sanity checks (concrete problem, audience, closable scope, .vibeflow/ conflicts, stack viability). If all pass, proceeds silently. If any fail, asks up to 2 targeted questions. Only activates for PRDs (file path or >3 lines), not short descriptions. All 3 editions updated.
- **Pattern conflict detection** — `teach --from` now detects name collisions with existing local patterns and asks which to keep. `teach` (new pattern) checks for conflicts with both local and imported patterns. `analyze` incremental mode skips patterns that have imported versions from `teach --from`. All 3 editions updated.

### v0.12.1 (2026-03-11)

- **Fix: .vibeflow/ detection when gitignored** — `vibeflow-analyze` Phase 0 now explicitly reads `.vibeflow/index.md` by direct path instead of using search/grep, which respect `.gitignore` and fail silently. Added a generic guardrail to Copilot instructions and Cursor rules. Affects `claude-code/skills/analyze/SKILL.md`, `copilot/github/prompts/vibeflow-analyze.prompt.md`, `cursor/skills/vibeflow-analyze/SKILL.md`, `copilot/github/instructions/vibeflow/vibeflow.instructions.md`, `cursor/rules/vibeflow.mdc`.

### v0.12.0 (2026-03-11)

- **CLI: idempotent `--force` for AGENTS.md** — Running `npx setup-vibeflow --force` no longer duplicates the vibeflow block in `AGENTS.md` or `copilot-instructions.md`. The CLI now uses `<!-- vibeflow:start/end -->` delimiters to upsert the block in-place. Legacy installs without delimiters get a safe append + warning instead of silent duplication. Affects `cli/index.js`, `copilot/AGENTS.md`, `copilot/copilot-instructions.md`. Version bumped to 0.12.0.

### v0.11.0 (2026-03-11)

- **`implement` ported to Copilot and Cursor editions** — Previously exclusive to Claude Code based on a false assumption that other editions lacked filesystem access. All 3 agents (Claude Code, Copilot, Cursor) have full filesystem access. `implement` is now available in all editions. CLI updated to install the new files. `prompt-pack` remains available as an alternative for delegating to a separate session/agent.

### v1.8.1 (2026-03-08)

- **Removed `spec-driven-dev` skill** — Legacy methodology skill that was redundant with the individual skills (gen-spec, audit, prompt-pack, etc.) and the architect agent. It appeared as a command but had no actionable use. Removed from all 3 editions, CLI installer, and docs.

### v1.8.0 (2026-03-07)

- **Claude Code: commands/ → skills/ migration** — All 9 commands migrated from legacy `commands/*.md` format to the recommended `skills/*/SKILL.md` format. Each skill now has proper frontmatter: `argument-hint` for autocomplete hints, `allowed-tools` for permission-free tool usage, and descriptions in 3rd person with "Use when..." context. Legacy `commands/` directory removed.
- **Cross-edition description sync** — All command/skill/prompt descriptions aligned across Claude Code, Copilot, and Cursor editions. Descriptions now consistently use 3rd person voice and include when-to-use context.
- **`plugin.json` updated** — Description aligned with site messaging: "Spec-driven development for AI agents. Define what to build, let the agent build it right."
- **`CLAUDE.md` added** — Project-level instructions file with cross-edition sync rules, file mapping table, and documentation checklist. Auto-loaded by Claude Code to prevent sync drift.
- **Site: `/commands` subpage** — New dedicated page documenting all 9 commands with flags, modes, and output details. Landing page Features cards now show mini-tags (flags/highlights) and link to `/commands#anchor`.
- **Site: Contact form** — New contact section with Formspree integration for direct email from the site.
- **Site: Header nav updated** — Added "Commands" link in desktop navigation.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.7.0 (2026-03-07)

- **`analyze-satellite` merged into `analyze --satellite <url>`** — The standalone `analyze-satellite` command is now a flag on the `analyze` command. Same functionality (clone, analyze, filter by usage, merge with provenance), fewer commands to learn. All 3 editions updated.
- **DX: Quick Start + tiered command presentation** — README and MANUAL now lead with a 3-command quick start (`analyze` → `gen-spec` → `implement`) instead of listing all commands flat. Commands table reordered: core pipeline first, optional/utility commands after. Reduces cognitive load for new users without removing any functionality.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.6.0 (2026-03-06)

- **Interactive Analyze (`--interactive`)** — New flag for the analyze command that adds a review checkpoint (Phase 3.5) between pattern discovery and saving. Presents patterns found in a compact summary and asks 3 questions: false positives, missing patterns, and rationale ("why"). User feedback is incorporated into pattern docs before saving: false positives are removed, missing patterns are created with `source: team-reported`, and rationale is saved as a `## Rationale` section (outside auto markers, survives incremental updates). Pattern docs gain a `confidence` frontmatter field: `inferred` (default) or `validated` (human-confirmed). Incremental + interactive only asks about new/changed patterns. Composes with all modes: `--fresh`, `--scope`, incremental.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.5.0 (2026-03-06)

- **Contextual Pattern Resolution** — Two-part feature that makes pattern loading intelligent across the entire pipeline.
  - **Part 1 (Analyze — producer):** `analyze` now generates YAML frontmatter (`tags`, `modules`, `applies_to`) on each pattern doc and a consolidated **Pattern Registry** YAML block in `index.md` (between `<!-- vibeflow:patterns:start/end -->` markers). Incremental mode preserves frontmatter outside auto markers. Scoped mode updates frontmatter on enrichment and regenerates the registry.
  - **Part 2 (Consumer commands):** `gen-spec`, `implement`, `prompt-pack`, and `audit` now resolve patterns automatically via the Pattern Registry — cross-referencing tags/modules against the spec's scope to load the top 3-5 relevant patterns. Manual override in spec's "Applicable Patterns" always wins. Backward compatible: falls back to previous behavior if no registry exists.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.4.0 (2026-03-06)

- **New command: `/vibeflow:implement`** — Claude Code only. Reads a spec from `.vibeflow/specs/`, loads applicable patterns and conventions, and implements the feature following all spec guardrails (budget, anti-scope, DoD). Runs tests automatically, self-verifies each DoD check with evidence, and suggests `/vibeflow:audit` as the next step. The agent acts as a **Coding Agent** — it follows the spec, it does NOT make architectural decisions. Budget enforced at 2 checkpoints (planning + during implementation). Anti-scope violations = hard stop. Test fix attempts capped at 2 to avoid infinite loops.
- **gen-spec updated** — After saving a spec, gen-spec now suggests `/vibeflow:implement` as the primary next step (with prompt-pack as fallback for separate sessions).

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
- **`.vibeflow/`** — adaptive knowledge system committed to git, adaptive to any project type
