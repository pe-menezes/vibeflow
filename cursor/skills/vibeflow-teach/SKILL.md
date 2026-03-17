---
name: vibeflow-teach
description: "Updates .vibeflow/ with corrections, new conventions, architectural decisions, or new patterns from natural language feedback. Also imports from external repos via --from <url|path>. Use to keep .vibeflow/ accurate as the project evolves."
---

# Vibeflow: Teach

Teach the project knowledge base. Update `.vibeflow/` docs with
corrections, new conventions, decisions, or patterns based on
natural language feedback. Also imports patterns from external
reference repos via `--from <url|path>`.

**Usage:** Provide your feedback as input, or use `--from <url|path>` to import from an external repo.

---

## Language

Detect the language of the user's input.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Before Starting

1. Check if `.vibeflow/` exists.
   - **YES** → read `.vibeflow/index.md` for orientation.
   - **NO** → warn: "`.vibeflow/` does not exist. Run the vibeflow-analyze
     skill first to create the knowledge base." and STOP.

2. **Check for `--from` flag.**
   If input contains `--from`, go to **## Import from external repo**.
   Otherwise, continue to **## Classify the Feedback**.

---

## Import from external repo

This flow imports patterns and conventions from an external reference repo
(e.g., shared architecture docs, coding guidelines).

### Step 1: Parse arguments

- Extract the `<url|path>` after `--from`.
- If `--name <alias>` is present, use `<alias>` as the repo name.
- Otherwise, auto-detect the name:
  - URL: use the last path segment without `.git` (e.g., `https://github.com/org/platform-patterns.git` → `platform-patterns`)
  - Local path: use the directory name (e.g., `./my-patterns` → `my-patterns`)

### Step 2: Get the repo

- **URL (contains `://` or starts with `git@`):**
  1. Clone to a temp directory: `git clone --depth 1 <url> $TMPDIR/vibeflow-teach-$(date +%s)`
  2. Set `$REPO_PATH` to the clone directory.
  3. Mark for cleanup at the end.

- **Local path:**
  1. Verify the path exists and is a directory.
  2. Set `$REPO_PATH` to the resolved absolute path.
  3. No cleanup needed.

### Step 3: Detect knowledge sources

Scan `$REPO_PATH` for these knowledge sources (in order):

| Source | Glob pattern |
|--------|-------------|
| Claude Code skills | `.claude/skills/*/SKILL.md` |
| CLAUDE.md | `CLAUDE.md` |
| Knowledge docs | `knowledge/**/*.md` |
| Documentation | `docs/**/*.md` |
| Cursor rules | `.cursorrules` |
| Cursor rule files | `.cursor/rules/*.mdc` |
| AGENTS.md | `AGENTS.md` |

For each source found:
1. Read the file.
2. Extract a **title** (first `#` heading, or filename if no heading).
3. Extract a **summary** (first 3-5 lines of meaningful content, or the
   `description` from YAML frontmatter if present).
4. Classify as `pattern` or `convention` based on content:
   - If it describes architecture, module structure, code organization → `pattern`
   - If it describes coding rules, naming, formatting, process → `convention`

If NO sources are found: report "No knowledge sources found in `<repo>`."
and STOP (after cleanup if cloned).

### Step 4: Interactive review

Present the findings to the user:

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

Wait for the user's selection. If the user selects "none": report
"No patterns imported." and STOP (after cleanup).

### Step 5: Import selected patterns

For each selected item:

#### 5a. Pattern items → save to `patterns/external-<nome>/`

Create directory `.vibeflow/patterns/external-<repo-name>/` if it doesn't exist.

**Conflict detection:** Before saving each pattern, check if a file with the
same name already exists in `.vibeflow/patterns/` (the root patterns directory,
not inside `external-*/`). Compare `<source-name>.md` against filenames in
`.vibeflow/patterns/*.md`.

If a conflict is found:
1. Show the user both patterns (name + description/first few lines of each).
2. Ask: "A local pattern `<name>.md` already exists. Keep local or replace
   with the external version?"
3. **User chooses external:** Delete the local file from `.vibeflow/patterns/`
   and proceed to save the external version in `external-<repo-name>/`.
4. **User chooses local:** Skip this pattern — do not save the external version.

If no conflict: proceed normally.

For each selected pattern (not skipped), create a file:
`.vibeflow/patterns/external-<repo-name>/<source-name>.md`

Format:
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

If the file already exists (re-import):
- Warn: "Previously imported, updating."
- Overwrite with the new content.

#### 5b. Convention items → append to `conventions.md`

Read `.vibeflow/conventions.md`. Add a section OUTSIDE the
`<!-- vibeflow:auto:start/end -->` markers:

```markdown
## External Conventions: <repo-name>

> Imported from: <repo-name> (<url or path>) on YYYY-MM-DD

<extracted convention content>
```

If an `## External Conventions: <repo-name>` section already exists,
replace it with the updated content.

### Step 6: Update index.md

Add the new pattern directory to the "Pattern Docs Available" section
in `.vibeflow/index.md`:

```
- `patterns/external-<repo-name>/` — Patterns imported from <repo-name> (YYYY-MM-DD)
```

### Step 7: Cleanup

If a clone was created (URL source):
- Run `rm -rf $REPO_PATH` to remove the temporary clone.
- This MUST happen even if previous steps failed (use try/finally logic).

### Step 8: Report

Report to the user:
- How many sources were found and how many were imported
- Which files were created/updated
- Where to find the imported patterns
- Suggest: "Review the imported patterns in `.vibeflow/patterns/external-<repo-name>/`.
  They are ready to be used by `gen-spec` and `implement`."

---

## Classify the Feedback

Read the user's input and classify into one of these categories:

### (a) Existing pattern correction
The user is saying an existing pattern doc is wrong or outdated.
- Identify which `patterns/*.md` file is affected.
- Read that file.
- Apply the correction OUTSIDE the `<!-- vibeflow:auto:start/end -->` markers
  (add a `## Manual Corrections` section at the end if it doesn't exist,
  or append to it).
- This ensures the correction survives incremental analyze runs.

### (b) New convention
The user is adding a coding convention.
- Read `conventions.md`.
- Add the new convention OUTSIDE the `<!-- vibeflow:auto:start/end -->` markers
  (add a `## Team Conventions` section at the end if it doesn't exist,
  or append to it).

### (c) Architectural decision
The user is recording an architectural decision.
- Read `decisions.md`.
- Add a new entry at the TOP (newest first), formatted as:

```markdown
### <date> — <title>
**Decision:** <what was decided>
**Context:** <why>
**Discarded alternatives:** <what was not chosen and why>
```

### (d) New pattern
The user is describing a pattern that doesn't have a doc yet.
- Create a new file: `.vibeflow/patterns/<name>.md`
- Use the standard structure with markers:

```markdown
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

- Update `.vibeflow/index.md` → add the new pattern to "Pattern Docs Available".

## After Updating

Report to the user:
- What category was identified
- Which file(s) were modified
- What was added/changed (brief summary)
- Suggest: "Run the vibeflow-analyze skill at the next opportunity to
  sync auto-generated sections with your corrections."

## Rules

- NEVER modify content inside `<!-- vibeflow:auto:start/end -->` markers.
  User corrections go OUTSIDE markers to survive incremental updates.
- ALWAYS read the target file before modifying it.
- If the feedback is ambiguous, ask ONE clarifying question before acting.
- If `.vibeflow/` doesn't exist, STOP. Don't create it manually.
