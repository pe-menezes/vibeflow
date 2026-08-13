---
name: analyze
description: >
  Deep-analyzes the current codebase to discover stack, architecture, patterns,
  conventions, and pitfalls. Creates curated documentation in .vibeflow/ that
  persists and can be committed to git. Supports incremental updates, scoped
  deep-dives, interactive review, and satellite repo analysis. Use when setting
  up a project, after significant changes, or to deep-dive into a specific module.
argument-hint: "[--fresh] [--scope path] [--interactive] [--satellite url]"
allowed-tools: Read, Grep, Glob, Bash, WebSearch, WebFetch
---

## Description and examples

**What it does:** Scans the codebase and generates (or updates) `.vibeflow/`: index, conventions, and one pattern doc per significant pattern. Use once for project setup, then after big changes or to deep-dive into a module.

**Examples:**
- `/vibeflow:analyze` — First run or incremental (only re-analyzes what changed since last run).
- `/vibeflow:analyze --fresh` — Rebuild everything from scratch; ignore existing `.vibeflow/`.
- `/vibeflow:analyze --scope src/app` — Deep-dive into `src/app` only; requires `.vibeflow/` to already exist. Enriches pattern docs with examples from that module.
- `/vibeflow:analyze --interactive` — Run analysis with interactive review: validate patterns, remove false positives, add tribal knowledge before saving.
- `/vibeflow:analyze --fresh --interactive` — Full rebuild with interactive review.
- `/vibeflow:analyze --satellite https://github.com/org/design-system` — Analyze a dependency repo, keep only patterns your code uses, merge into `.vibeflow/patterns/satellite-<name>/`.

---

## Language

Detect the language of the user's conversation context.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.
Section names in generated `.vibeflow/` files may be in English (they are technical),
but all descriptive text, analyses, observations, and final user reports should be
in the detected language.

## Web Search Policy

Use WebSearch and WebFetch only when local context (`.vibeflow/`, codebase,
git history) is insufficient — an unfamiliar framework or API. Local first.

Perform a deep, adaptive analysis of this codebase. The goal is curated pattern
documentation that every future spec, prompt pack, and audit uses to keep
implementations on the project's real conventions.

## Phase 0: Detect mode

Read `.vibeflow/index.md` directly by its path. Search, grep, and glob respect
`.gitignore`, so they miss the directory and report it as absent.

Then read the flags in $ARGUMENTS (`--fresh`, `--scope <path>`, `--interactive`,
`--satellite <url>`) and check whether git is available here.

**Decision tree:**

- `--satellite <url>` → satellite mode (below); phases 1–5 don't run. Without an
  existing `.vibeflow/index.md`, stop: "Run `/vibeflow:analyze` first to
  establish project context, then use `--satellite` to analyze a dependency repo."
- `--scope <path>` → scoped mode (below); phases 1–5 don't run. Without an
  existing `.vibeflow/index.md`, stop: "Run `analyze` first to establish project
  context, then use `--scope` to deep-dive into specific modules."
- No `.vibeflow/`, or `--fresh` present → full analysis, phases 1–5.
- `.vibeflow/` exists and no `--fresh` → incremental analysis.
- `--interactive` composes with every mode: it adds Phase 3.5 before saving and
  changes nothing else about which phases run.

**Incremental mode.** Read `Analyzed: <date>` from `index.md`, then
`git log --since="<date>" --name-only --pretty=format:""` to find what changed.
Filter out tests, docs, and config that doesn't affect source structure
(`*.test.*`, `*.spec.*`, `docs/`, `README.md`, `.env.*`), then map what's left to
modules — those are the affected structural units. Nothing changed → report "No
changes detected since <date>. .vibeflow/ is up to date." and stop. No git →
warn "Git not available. Falling back to full analysis." and run phases 1–5.
Otherwise report "Incremental mode: X affected modules: [list]" and continue.

Through phases 1–4, incremental means: redo only what the affected modules
touch, reuse what `index.md` already records for everything else, and preserve
every byte outside the `vibeflow:auto` markers. Phases 3 and 4 add file-specific
preservation rules where the generic one isn't enough.

## Phase 1: Discovery (broad scan)

Read the project root — manifests, the top 2–3 directory levels, README, and any
architecture docs — and detect the knowledge sources explicitly:

- `.cursorrules` (project-level rules)
- `.cursor/rules/*.mdc` (domain-specific rules)
- `CLAUDE.md` (project instructions)
- `.clinerules` (Cline AI rules)
- `.github/copilot-instructions.md` (GitHub Copilot rules)
- `/docs/`, `ARCHITECTURE.md`, `ADRs/` (if present)

Skip dependency and build directories. Determine the stack (languages,
frameworks, runtime, DB), the project type (monorepo, single app, library, CLI,
API, mobile), and the major structural units — which vary by project type:
modules, packages, routes, features, crates, services. Report which knowledge
sources you found.

Let the code tell you what it is: no assumed monorepo, framework, or layout.

**Domain classification.** Classify the project as **mobile** (Android, iOS, KMP,
Flutter, React Native), **web-frontend** (React, Vue, Angular, Svelte, Next.js,
Nuxt), **api-backend** (REST, GraphQL, gRPC, microservices), **library**, **cli**,
or **other**. The domain activates a pattern priority list used in Phases 2 and 3:

| Domain | Required patterns | Also look for |
|---|---|---|
| Mobile | design-system/UI-components, screen/feature-composition, navigation | state-management, networking/API-layer, DI, analytics, feature-flags, i18n |
| Web frontend | design-system/component-library, page/route-composition, state-management | API-layer, auth, i18n |
| API/backend | route/endpoint-definition, data-access/repository, auth/middleware | error-handling, DB-migrations, background-jobs |
| Library / CLI / other | none — use the general heuristics | — |

## Phase 1.5: Rules integration

Read every knowledge source found in Phase 1 and extract the concrete
conventions (naming, patterns, business rules, style) and the modules or
subsystems they mention. Build an internal map — not an output file — with each
convention attributed to its source ("via .cursorrules", "via
docs/ARCHITECTURE.md") and the list of modules the rules name. The map guides
sampling in Phase 2 and the deep-dive scope in Phase 3.

Rules are privileged input, not absolute truth: validate them against the code
and flag conflicts as "Conflict: .cursorrules says X, but code does Y". Keep the
sources distinct — `.cursorrules` and `CLAUDE.md` are project-level,
`.cursor/rules/*.mdc` is domain-specific, `/docs/` is reference.

## Phase 2: Convention mining (adaptive sampling)

Detect modules and domains automatically: by directory, by file prefix
(`fin_*.py`, `task_*.js`), and by what the Phase 1.5 rules map mentions.

**Sampling scale** (by estimated total source files):

| Source files | Min files to sample | Per module |
|---|---|---|
| ≤50 | 8 | ≥2 |
| 51–200 | 12 | ≥2 |
| 201–1000 | 20 | ≥2 |
| 1001–5000 | 30 | ≥3 |
| 5001–20000 | 40 | ≥3 |
| 20000+ | 50–60 | ≥3 |

Prioritize the largest files by line count, the most imported, and the ones the
rules mention. Above 100 source files, document what you did not cover in the
"Known Gaps" section of `index.md`.

**Cross-module sampling** (1000+ source files): instead of many files from few
modules, read the same layer across 3–4 features — the main screen composable of
four product features, say. Repetition reveals the real pattern; a single
feature reveals its exceptions.

**Mandatory pattern verification.** After sampling, check the required patterns
from the Phase 1 domain. For each one not yet covered, search for files in that
domain and sample 2–3 more specifically for it. If it is genuinely absent,
document it as "Not found" rather than omitting it silently.

Document, for every sampled file: naming conventions (files, functions,
variables, types, components), file and directory organization, import/export
style, error handling, test patterns (location, naming, framework, coverage),
state management, typing (strict, loose, `any` usage), and logging.

Look for repeated patterns, not one-off occurrences.

## Phase 3: Pattern deep dive

The phase that decides the quality of everything downstream. For each
significant pattern: read 3–5 real usages, extract the pattern as it actually
is, note variations and edge cases, and separate the right way from the
deviations.

**Expand scope with the rules map.** Consider modules from the Phase 1.5 map,
not only what Phase 2 sampled. A module named in the rules but missed by
sampling gets read, then judged on whether it deserves a pattern doc.

**Cross-module rule.** A pattern doc for a horizontal layer (UI composition,
data access, navigation, design-system usage, state management) needs examples
from at least 3 different features — otherwise it documents an outlier.

**Imported pattern protection.** Before creating or updating a pattern doc,
check whether one with the same name exists in `.vibeflow/patterns/external-*/`
(imported via `teach --from`). If it does, skip that pattern entirely — an
external source of truth outranks auto-discovery — and log "Skipping `<name>` —
imported version exists in `external-<repo>/`."

**Incremental preservation.** For docs being updated, keep everything outside
the `<!-- vibeflow:auto:start/end -->` markers, including the YAML frontmatter.
If the doc has frontmatter and the content inside the markers did not change,
leave the frontmatter untouched — the dev may have edited tags via
`/vibeflow:teach`. If the auto content did change, regenerate the frontmatter
from it. Legacy docs with no markers get rewritten with markers and frontmatter
added; new patterns are created with both.

What counts as significant depends on the project: API/route definitions,
component architecture, data access and repositories, navigation, design-system
usage and composition, DI and services, configuration and environment handling,
build and deploy, auth flows, middleware and plugins, CLI commands, event and
message handling.

One markdown file per pattern in `.vibeflow/patterns/`, named descriptively:
`api-routes.md`, `component-architecture.md`, `data-access.md`, `auth-flow.md`,
`cli-commands.md`. Each follows this structure:

```
---
tags: [tag1, tag2, tag3]
modules: [src/path1/, src/path2/]
applies_to: [artifact-type1, artifact-type2]
confidence: inferred
---
# Pattern: <Name>

<!-- vibeflow:auto:start -->
## What
1-2 sentence description of what this pattern is.

## Where
Which parts of the codebase use it.

## The Pattern
Show the REAL pattern with actual code examples from this repo.
Include 2-3 concrete examples so a coding agent can replicate it exactly.

## Rules
- Specific rules this pattern follows
- Naming conventions specific to this pattern
- What to do / what NOT to do

## Examples from this codebase
File: <real path>
<actual code snippet showing the pattern correctly>

File: <real path>
<another example, ideally showing a variation>
<!-- vibeflow:auto:end -->

## Anti-patterns (if found)
Things that exist in the codebase that BREAK this pattern.
Mark them so future work doesn't replicate mistakes.
```

**YAML frontmatter rules:**

- The frontmatter block goes at the very top, before the `# Pattern:` heading and outside the `<!-- vibeflow:auto -->` markers.
- **`tags`** — 3-7 lowercase strings for the domain and concepts the pattern covers, derived from its name, its "What", and the key concepts in "The Pattern". Specific domain tags (`auth`, `middleware`, `api-routes`, `state-management`, `navigation`, `design-system`), never generic ones like `code` or `pattern`.
- **`modules`** — directory paths relative to the repo root, ending in `/`, taken from "Where" and from the file paths under "Examples from this codebase".
- **`applies_to`** — the artifact types the pattern governs, as generic names: `components`, `routes`, `handlers`, `middleware`, `hooks`, `models`, `services`, `screens`, `tests`, `configs`, `migrations`, `commands`, `interceptors`, `guards`, `resolvers`, `controllers`.
- **`confidence`** — `inferred` on creation (found by automated analysis), `validated` once a human confirms it via `--interactive` or `/vibeflow:teach`.

**Marker placement rule:** the markers wrap `## What`, `## Where`,
`## The Pattern`, `## Rules`, and `## Examples from this codebase`.
`## Anti-patterns` stays outside — it's where manual additions and evolution
land. The YAML frontmatter also stays outside, so tag edits made via
`/vibeflow:teach` survive incremental updates.

Include real code snippets from real files — not pseudocode, not "something like
this". Actual code is what makes a pattern doc actionable for a coding agent.

**`## Rationale` section:** when a rationale is provided (via `--interactive`
Phase 3.5 or `/vibeflow:teach`), it goes between `<!-- vibeflow:auto:end -->`
and `## Anti-patterns` — outside the markers, so it survives. Create it only
when there is a rationale; no empty placeholders.

## Phase 3.5: Review and enrich (interactive only)

Runs only with `--interactive`; otherwise go straight to Phase 4. Under
incremental, present only patterns that are new or changed — one already marked
`confidence: validated` and untouched in this run stays validated.

Present the patterns compactly:

```
## Patterns found (N):

1. **<Name>** — <1-line description> (modules: <paths>)
2. **<Name>** — <1-line description> (modules: <paths>)
...
```

Then ask the user three things: which of these are false positives — present in
the code but not conventions the team follows; which conventions the team does
follow that the analysis missed; and, for the most important ones, why the team
adopted them. The third is optional and enriches the docs the most.

**Incorporate the answers:**

- **False positives** — don't create the doc. If the pattern is being phased out rather than accidental, create it with `confidence: deprecated` and explain in `## Anti-patterns`.
- **Missing patterns** — create the doc with `confidence: validated`, note `source: team-reported` in `## What`, and mark examples with `<!-- TODO: find code examples -->`.
- **Rationale** — add the `## Rationale` section, outside the markers, before `## Anti-patterns`.
- **Confirmed patterns** — everything the user confirmed, explicitly or by not flagging it, gets `confidence: validated`.

## Phase 4: Compile

Incremental specifics, on top of the general rule in Phase 0:

- **index.md** — update `Analyzed: <date>` to today; update Structural Units and Key Files only where they changed; preserve any manually added Known Issues.
- **conventions.md** — update only inside the `<!-- vibeflow:auto:start/end -->` markers. A legacy file without markers gets rewritten with them added.
- **decisions.md** — never modified in incremental mode.
- **patterns/** — as stated in Phase 3.

### The `.vibeflow/` structure

```
.vibeflow/
├── index.md              # Overview: stack, structure, list of all pattern docs
├── conventions.md        # Coding conventions (naming, style, organization)
├── patterns/
│   └── <whatever>.md     # One file per discovered pattern (varies by repo)
└── decisions.md          # Empty for now, grows with use
```

### index.md format (~80-120 lines max)

```
# Project: <name>
> Analyzed: <date>
> Stack: <concise summary>
> Type: <project type>
> Suggested budget: ≤ N files per task

## Structure
<brief description of how the project is organized>

## Structural Units
<list the major units — modules, packages, routes, features, etc.>
<1-line description each>

## Pattern Registry

<!-- vibeflow:patterns:start -->
patterns:
  - file: patterns/<name>.md
    tags: [tag1, tag2, tag3]
    modules: [src/path1/, src/path2/]
  - file: patterns/<name>.md
    tags: [tag4, tag5]
    modules: [src/path3/]
<!-- vibeflow:patterns:end -->

## Pattern Docs Available
<list each .vibeflow/patterns/*.md with 1-line description>

## Key Files
<10-15 most critical files with 1-line descriptions>

## Dependencies (critical only)
<critical deps with 1-line rationale>

## Known Issues / Tech Debt
<bullet list if anything was found>
```

**Pattern Registry generation.** After all pattern docs are written, read each
one's YAML frontmatter (`tags`, `modules`) and build the registry block between
the `<!-- vibeflow:patterns:start/end -->` markers, keeping the human-readable
"Pattern Docs Available" list below it with links and 1-line descriptions. The
registry is always regenerated from the frontmatters and never edited by hand —
that is what keeps it in sync.

**Budget calculation.** From the source files counted in Phase 2, suggest ~2-3%,
clamped between 4 and 12:

| Source files | Budget |
|---|---|
| ≤50 | ≤ 4 |
| 51–150 | ≤ 6 |
| 151–500 | ≤ 8 |
| 501–2000 | ≤ 10 |
| 2000+ | ≤ 12 |

Write it as `> Suggested budget: ≤ N files per task` in the index.md header —
gen-spec and prompt-pack read it as their default budget.

### conventions.md format

Dense, specific, actionable: concrete rules with examples, not vague guidelines.
A coding agent should read this and write code that fits in perfectly.

Wrap the auto-generated convention sections in `<!-- vibeflow:auto:start -->` /
`<!-- vibeflow:auto:end -->`, so team updates and discovered edge cases can live
outside the markers and survive incremental runs.

Conventions extracted in Phase 1.5 carry their source: "(via .cursorrules)",
"(via .cursor/rules/design-system.mdc)", "(via docs/ARCHITECTURE.md)". Where a
rule contradicts the code, say so: "Conflict: .cursorrules says X, but the code
does Y".

**Don'ts section.** conventions.md needs a `## Don'ts` section with the explicit
prohibitions found during analysis — as important as the prescriptive rules,
since coding agents need to know what not to do. It goes inside the markers,
after the prescriptive sections. Mine it from the anti-patterns in pattern docs,
explicit prohibitions in the rules sources, code that is clearly a mistake or
legacy, and the known pitfalls of the detected stack (`any` abuse in TypeScript,
hardcoded strings in an i18n project, mutable global state).

Format is a bullet list of concrete prohibitions with a brief rationale:

```
## Don'ts
- Do NOT use `any` in TypeScript — use `unknown` + type narrowing
- Do NOT hardcode user-facing strings — all copy goes through i18n files
- Do NOT import from internal modules of a dependency (e.g., `lib/src/internal`)
- Do NOT add new dependencies without explicit justification in the spec
```

Every don't is traceable to something observed in this codebase's code, rules,
or pattern anti-patterns — not a generic best practice.

### decisions.md

Never modified by analyze, in any mode — it belongs to the architect agent and
manual curation. On a fresh run, create it only if absent:

```
# Decision Log
> Newest first. Updated automatically by the architect agent.
```

## Phase 5: Update MEMORY.md

Save a compact index to your MEMORY.md (architect persistent memory):

```
# Vibeflow Index
> Project: <name> | Stack: <stack> | Analyzed: <date>

## .vibeflow/ docs available
- index.md — project overview and structure
- conventions.md — coding conventions
- patterns/<name>.md — <1-line desc>
- patterns/<name>.md — <1-line desc>
- ... (list all)
- decisions.md — architectural decision log

## Quick Reference
<top 5 most important conventions/rules to remember>

## Instructions
Before generating ANY spec, prompt pack, or audit:
1. Read .vibeflow/index.md for project context
2. Read .vibeflow/conventions.md for coding standards
3. Read the relevant pattern docs from .vibeflow/patterns/
4. Embed applicable patterns in your output

When you learn something new about this project, update:
- .vibeflow/decisions.md for architectural decisions
- .vibeflow/conventions.md if new conventions are discovered
- .vibeflow/patterns/*.md if patterns evolve
- This MEMORY.md index if new docs are added
```

Match the length of the generated docs to what the project needs: cover the
substance, without filler sections, redundant summaries, or boilerplate.

---

## Scoped analysis mode (`--scope <path>`)

A deep dive into one module or directory, complementing the general analysis.
Requires an existing `.vibeflow/index.md`.

### Step 1: Inherit global context

Read from the existing `.vibeflow/`: `index.md` for stack, domain type,
structural units, and budget; `conventions.md` for the global conventions; the
list of pattern docs in `patterns/`. Don't re-detect any of it.

### Step 2: Scoped discovery

Focus exclusively on `<path>`: internal structure, what it imports from other
modules, its own external dependencies, entry points and public APIs, and any
module-specific docs or config.

### Step 3: Dense sampling

Sample densely — the goal is depth, not coverage. A module with ≤30 source files
gets read in full; above that, sample ≥80%, prioritizing entry points, largest
files, most imported files, and files the rules mention. Apply the domain's
mandatory pattern priorities inherited in Step 1, and document the same
convention aspects as Phase 2.

### Step 4: Pattern enrichment

**A matching global pattern doc exists** (say `patterns/screen-composition.md`):
add this module's examples inside the `<!-- vibeflow:auto:start/end -->`
markers, preserving everything outside them (frontmatter included); add the
module as a location under `## Where`; add 1–2 examples under `## Examples from
this codebase`; and add the module's path to the frontmatter's `modules` field
if it isn't there, leaving `tags` and `applies_to` as they are.

**The pattern is specific to this module** — create a new doc in `patterns/`
with the standard structure, frontmatter, and markers, named descriptively and
prefixed with the module name when it's genuinely module-specific
(`payments-reconciliation.md`).

**For conventions.md** — conventions that extend or specialize the global ones
go inside the markers with attribution "(via --scope `<path>`)"; divergences are
flagged as "Module `<path>` diverges: <description>".

### Step 4.5: Review and enrich (interactive only)

With `--interactive`, present only the patterns found or enriched in this scoped
run, following Phase 3.5's format, questions, and incorporation rules.

### Step 5: Update index

Add or update a `## Scoped Analyses` section in `index.md`:

```markdown
## Scoped Analyses
- `<path>` — analyzed on <date>, N files sampled, M patterns enriched/created
```

Then regenerate the `## Pattern Registry` block from all pattern doc
frontmatters, and update `## Pattern Docs Available` if new docs were created.

### Report

Module analyzed and how many of its source files you sampled; which pattern docs
were enriched and which were created; module-specific conventions; divergences
from the global ones. Then suggest: "Run `gen-spec` or `prompt-pack` — the
enriched patterns from `<path>` are now available."

---

## Satellite analysis mode (`--satellite <url>`)

Analyzes a dependency repository (design system, shared lib) from the
perspective of this repo: clone it, run the analysis on it, detect what this
repo actually uses, and merge only those patterns. Requires an existing
`.vibeflow/index.md`.

### Step 1: Parse and clone

Derive `<satellite-name>` from the URL's last path segment, without `.git`,
sanitized to alphanumerics and hyphens. Clone shallow into a unique temp
directory outside the main repo: `git clone --depth 1 <URL> <temp_dir>/satellite`.
A failed clone (SSH key, network, private repo) is reported clearly, the partial
temp dir removed, and the mode stops.

### Step 2: Analyze the clone

With the clone as the effective codebase root, run the same phases as a fresh
analysis and write the output inside the clone, at
`<temp_dir>/satellite/.vibeflow/`. This repo's `.vibeflow/` is not touched yet.
Any failure after the clone still removes the temp directory.

### Step 3: Detect usage in the main repo

Back in this repo, collect what references the satellite: the declared
dependency in the manifest (its package or module name), and the imports of it
across the source — at least JS/TS plus this repo's primary language. That set
of names and symbols is the usage filter.

### Step 4: Filter and merge with provenance

Keep only the satellite pattern docs matching the usage set; when in doubt for a
direct dependency, include it. Write them to
`.vibeflow/patterns/satellite-<satellite-name>/`, each one prefixed with
`> Patterns from satellite repo: <satellite-name> (ingested on YYYY-MM-DD for use by the main repo).`
Only pattern docs cross over — not the satellite's `index.md` or `conventions.md`.

### Step 5: Cleanup and report

Remove the temp directory (`rm -rf <temp_dir>`) whether the merge succeeded or
failed. Report the satellite URL and name, that the clone was removed, how many
pattern docs were merged, and the provenance. Then suggest: "Run
`/vibeflow:gen-spec` or `/vibeflow:prompt-pack` — patterns from
`<satellite-name>` are now available under
`.vibeflow/patterns/satellite-<satellite-name>/`."

Rules: one repo per invocation, the clone is always ephemeral, provenance is
always written, and the filter is by actual use.

---

## After saving, report to the user:

- Stack detected and project type identified
- Number of structural units mapped
- Knowledge sources found and incorporated (how many `.cursorrules`, `CLAUDE.md`, `docs/`)
- Pattern docs created, listed, and the top 3 that matter most for future work
- Conflicts detected between rules and code, if any
- Red flags, inconsistencies, or tech debt found
- That these docs persist and feed every future spec, prompt pack, and audit
- Suggest: "Review .vibeflow/ and commit it — it's your project's living documentation."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
