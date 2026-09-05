---
name: teach
description: >
  Updates the project knowledge base (.vibeflow/) with corrections, new conventions,
  architectural decisions, or new patterns based on natural language feedback. Also
  imports patterns from external repos through the --from option. Edits are placed outside
  auto-generated markers to survive incremental analyze runs. Use to keep .vibeflow/
  accurate as the project evolves.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

## Description and examples

**What it does:** Updates `.vibeflow/` from natural language: corrects a pattern doc, adds a convention, records a decision, or documents a new pattern. Also imports patterns and conventions from an external reference repo via `--from`. Prefer corrections outside the auto-generated markers so they survive the next analyze.

**Examples:**
- `teach sempre usar camelCase para variáveis de estado` — Adds or updates a convention.
- `teach o padrão de API mudou, agora validamos com zod` — Updates the relevant pattern or conventions.
- `teach decidimos usar Redis para cache, não in-memory` — Logs the decision (e.g. in decisions.md or conventions).
- `teach --from https://github.com/org/platform-patterns` — Imports patterns from an external repo.
- `teach --from ./my-patterns --name platform` — Imports from a local path with a custom alias.

---

## Language

Detect the language of the user's current request or conversation.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Process the user's current feedback and update project knowledge.

## The one rule that governs every edit

When editing an existing generated region, everything you write goes
**outside** the `<!-- vibeflow:auto:start/end -->` markers — that is what makes
a correction survive the next incremental analyze. Read the target file before
editing it, and never rewrite what is inside the markers; analyze owns that
region. One explicit exception: a new pattern doc created in category (d) is
born with its own markers and its initial content inside them, so analyze owns
that region from the start.

## Before starting

`.vibeflow/` has to exist: read `.vibeflow/index.md` directly by path for
orientation. If it isn't there, stop with "`.vibeflow/` does not exist. Run
`analyze` first to create the knowledge base." — don't create it by hand.

Then branch on the input: `--from` in the user's current request goes to **Import from external
repo**; anything else goes to **Classify the feedback**.

---

## Import from external repo

Imports patterns and conventions from an external reference repo — shared
architecture docs, coding guidelines.

### Step 1: Parse arguments

Take the `<url|path>` after `--from`. The repo name is `--name <alias>` when
given, otherwise derived: the URL's last path segment without `.git`
(`https://github.com/org/platform-patterns.git` → `platform-patterns`), or the
directory name for a local path (`./my-patterns` → `my-patterns`).

### Step 2: Get the repo

A URL (contains `://` or starts with `git@`) is cloned shallow into a temp
directory — `git clone --depth 1 <url> $TMPDIR/vibeflow-teach-$(date +%s)` —
`$REPO_PATH` is set to that directory, and the clone is marked for cleanup. A
local path is verified to exist and be a directory, and `$REPO_PATH` is set to
its resolved absolute path; nothing to clean up.

### Step 3: Detect knowledge sources

Scan `$REPO_PATH` for these sources, in order:

| Source | Glob pattern |
|--------|-------------|
| Claude Code skills | `.claude/skills/*/SKILL.md` |
| CLAUDE.md | `CLAUDE.md` |
| Knowledge docs | `knowledge/**/*.md` |
| Documentation | `docs/**/*.md` |
| Cursor rules | `.cursorrules` |
| Cursor rule files | `.cursor/rules/*.mdc` |
| AGENTS.md | `AGENTS.md` |

For each one found, take a **title** (the first `#` heading, else the filename),
a **summary** (the `description` from YAML frontmatter, else the first 3-5 lines
of real content), and a classification: architecture, module structure, or code
organization → `pattern`; coding rules, naming, formatting, or process →
`convention`.

No sources found → report "No knowledge sources found in `<repo>`." and stop,
after cleanup if you cloned.

### Step 4: Interactive review

Present what you found:

```
## Found N knowledge sources in <repo-name>

### Patterns
1. [SKILL] kmp-architecture — KMP module structure, layers, DI, navigation
2. [SKILL] kmp-best-practices — XCFramework, build, logging, lint guidelines
3. [DOC] docs/api-conventions.md — REST API naming and versioning rules

### Conventions
4. [CLAUDE.md] Coding standards — Import ordering, error handling patterns
5. [CURSOR] .cursorrules — Cursor-specific coding rules

Select which to import (comma-separated numbers, "all", or "none"):
```

Wait for the selection. "none" → report "No patterns imported." and stop, after
cleanup.

### Step 5: Import the selection

**Pattern items** go to `.vibeflow/patterns/external-<repo-name>/<source-name>.md`
(create the directory if needed), in this format:

```markdown
---
tags: [external, <repo-name>]
modules: []
applies_to: []
confidence: imported
---
# Pattern: <title>

> Imported from: <repo-name> (<url or path>) on YYYY-MM-DD

<full content of the source file>
```

Before saving each one, check for a name collision against the local
`.vibeflow/patterns/*.md` (the root directory, not inside `external-*/`). On a
collision, show the user both versions — name plus description or opening lines
— and ask whether to keep the local one or replace it with the external. Keeping
local skips the import for that pattern; choosing external deletes the local file
and saves the external version under `external-<repo-name>/`. A file already
imported before is overwritten, with a "Previously imported, updating." warning.

**Convention items** are appended to `.vibeflow/conventions.md`, outside the
markers, replacing the section if it already exists:

```markdown
## External Conventions: <repo-name>

> Imported from: <repo-name> (<url or path>) on YYYY-MM-DD

<extracted convention content>
```

### Step 6: Update index.md

Add the imported directory to the "Pattern Docs Available" section:

```
- `patterns/external-<repo-name>/` — Patterns imported from <repo-name> (YYYY-MM-DD)
```

### Step 7: Cleanup

A clone gets removed with `rm -rf "$REPO_PATH"` — never `rm -rf` without an
operand — even when an earlier step failed; treat it as a finally block, not a
happy-path step.

### Step 8: Report

How many sources were found and how many imported, which files were created or
updated, and where the imported patterns live. Then suggest: "Review the imported
patterns in `.vibeflow/patterns/external-<repo-name>/`. They are ready to be used
by `gen-spec` and `implement`."

---

## Classify the feedback

Read the user's current request and place it in one of four categories. Ambiguous feedback is
worth one clarifying question before you edit anything.

### (a) An existing pattern doc is wrong or outdated

Identify the affected `patterns/*.md`, read it, and apply the correction in a
`## Manual Corrections` section at the end — created if absent, appended to if
present.

### (b) A new convention

Add it to `conventions.md` in a `## Team Conventions` section at the end —
created if absent, appended to if present.

### (c) An architectural decision

Add an entry at the top of `decisions.md` (newest first):

```
### <date> — <title>
**Decision:** <what was decided>
**Context:** <why>
**Discarded alternatives:** <what was not chosen and why>
```

### (d) A pattern with no doc yet

Check for a name collision first. One in `patterns/` (local) → ask whether to
update the existing doc or create a separate one; updating makes it category (a).
One in `patterns/external-*/` (imported) → warn that `<name>.md` came from
`<repo-name>` and ask whether to create a local override or skip; skipping stops
here.

With no collision, create `.vibeflow/patterns/<name>.md`:

```
# Pattern: <Name>

<!-- vibeflow:auto:start -->
## What
<from user feedback>

## Where
<inferred from feedback, or "To be confirmed by analyze">

## The Pattern
<from user feedback — real code if provided, otherwise description>

## Rules
<from user feedback>
<!-- vibeflow:auto:end -->

## Anti-patterns
<from user feedback if mentioned, otherwise empty>
```

Then add it to "Pattern Docs Available" in `.vibeflow/index.md`, and to the
architect's MEMORY.md if that exists.

## After updating

Report which category you identified, which files changed, and a brief summary
of what was added. Then suggest: "Run `analyze` at the next opportunity
to sync auto-generated sections with your corrections."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
