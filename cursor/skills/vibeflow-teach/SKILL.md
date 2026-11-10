---
name: vibeflow-teach
description: "Updates .vibeflow/ with corrections, new conventions, architectural decisions, or new patterns from natural language feedback. Also imports from external repos through the --from option. Use to keep .vibeflow/ accurate as the project evolves."
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
the vibeflow-analyze skill first to create the knowledge base." — don't create it by hand.

Then branch on the input: `--from` in the input goes to **Import from external
repo**; anything else goes to **Classify the feedback**.

---

## Import from external repo

Imports a reference repo's knowledge — architecture and module patterns,
coding conventions, team workflows — as documents that the vibeflow-gen-spec skill can select.
Each imported file becomes one document under
`.vibeflow/patterns/external-<repo-name>/`, indexed by a registry for that
source and by one line in `.vibeflow/index.md`. The import never deletes a
local pattern and never writes to `.vibeflow/conventions.md`; the only write it
can make there is removing the `## External Conventions: <repo-name>` section
an earlier import left, when the person approves it.

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

Count the sources with commands, one per glob, run against `$REPO_PATH` — for
example `find "$REPO_PATH/.claude/rules" \( -type f -o -type l \) -name '*.md'`
for a `**` glob,
`find "$REPO_PATH/.claude/skills" -mindepth 2 -maxdepth 2 \( -type f -o -type l \) -name SKILL.md`
for the skills, and
`find "$REPO_PATH/.cursor/rules" -maxdepth 1 \( -type f -o -type l \) -name '*.mdc'`
for a one-level glob such as `.cursor/rules/*.mdc`. `-type l` counts a file
that is a symbolic link, as the glob does. The count never comes from a
sampled read: the same source once gave 108 items in one run and 84 in another. No "top N", no folder summary, no cut by
size.

| Source | Glob pattern |
|--------|-------------|
| Claude Code skills | `.claude/skills/*/SKILL.md` |
| Claude Code rules | `.claude/rules/**/*.md` |
| Claude Code knowledge | `.claude/knowledge/**/*.md` |
| CLAUDE.md | `CLAUDE.md` |
| Knowledge docs | `knowledge/**/*.md` |
| Documentation | `docs/**/*.md` |
| Cursor rules | `.cursorrules` |
| Cursor rule files | `.cursor/rules/*.mdc` |
| AGENTS.md | `AGENTS.md` |

Print the glob → count table and the total before reading any file:

```
glob → count
.claude/skills/*/SKILL.md     <n>
.claude/rules/**/*.md         <n>
.claude/knowledge/**/*.md     <n>
CLAUDE.md                     <n>
knowledge/**/*.md             <n>
docs/**/*.md                  <n>
.cursorrules                  <n>
.cursor/rules/*.mdc           <n>
AGENTS.md                     <n>
total                         <N>
```

Every counted file is one item; the review in Step 4 has exactly `<N>` lines.
A total of 0 → report "No knowledge sources found in `<repo>`." and stop, after
cleanup if you cloned.

For each file, read it and take a **title** (the first `#` heading, else the
filename), a **summary** (the `description` from its YAML frontmatter, else the
first 3-5 lines of real content), its frontmatter `paths` and `description`
exactly as they came (and, for a `.mdc`, its `alwaysApply`), and a `kind`:

- `pattern` — how code is written in one area: architecture, module, layer,
  API, library, error handling.
- `convention` — a cross-cutting code rule: naming, formatting, style, tests.
- `workflow` — a team process: planning, implementing, PRs, review, release,
  deploy, onboarding, operations.

A mixed document gets the kind of most of its content and the mark `mixed` on
its review line.

Each file gets an `<entry-name>` from its path in the source, deterministically:
drop the `/SKILL.md`, `.md` or `.mdc` suffix, drop the leading dot of every
path segment, replace `/` with `-`, and lowercase it.
`.claude/rules/navigation.md` → `claude-rules-navigation`;
`.claude/skills/api-client/SKILL.md` → `claude-skills-api-client`;
`.claude/knowledge/x.md` → `claude-knowledge-x`; `knowledge/x.md` →
`knowledge-x`; `docs/architecture.md` → `docs-architecture`; `CLAUDE.md` →
`claude`; `.cursorrules` → `cursorrules`; `.cursor/rules/x.mdc` →
`cursor-rules-x`. No name starts with a dot. The same source file always lands
on the same name.

### Step 4: Interactive review

Present every item in three numbered groups, with the group counts and the same
total as Step 3:

```
## Found <N> knowledge sources in <repo-name>: <P> patterns, <C> conventions, <W> workflows

### Patterns (<P>)
[x] 1. [pattern] .claude/rules/navigation.md — Screen routing and deep links · paths: **/navigation/**
[x] 2. [pattern] .claude/skills/api-client/SKILL.md — HTTP client layer and error mapping

### Conventions (<C>)
[x] 3. [convention] .claude/rules/naming.md — File, type and test naming · paths: src/**
[x] 4. [convention] CLAUDE.md — Formatting and test rules (mixed)

### Workflows (<W>)
[ ] 5. [workflow] docs/release.md — Release checklist and versioning
[ ] 6. [workflow] .claude/knowledge/onboarding.md — Local setup for new members
```

Each line carries `[kind]`, the `source_file`, the summary, and the `paths`
when the source has them. `pattern` and `convention` lines come checked,
`workflow` lines unchecked. The person answers with numbers, `all`, `none`, or
`defaults` (the checked lines), and can correct a kind before anything is saved
with `<n>=<kind>` — `7=pattern`. Wait for the answer. `none` → report "No
patterns imported." and stop, after cleanup. A selected `workflow` is saved with
`kind: workflow`.

### Step 5: Write the selection

Before writing anything, take the `<entry-name>` of every selected item. When
two selected items land on the same `<entry-name>` (`.claude/rules/a/b.md` and
`.claude/rules/a-b.md`, or two paths that differ only in case), stop before
writing any file and show both source paths with the name they share; the
person answers with a selection that leaves one of them out, or ends the
import. The import never overwrites one item with another within the same
import.

Read the source commit once: `git -C "$REPO_PATH" rev-parse HEAD` (works on the
shallow clone of Step 2); outside any git repository it is `none`. A local path
inside another git repository has no commit of its own: when
`git -C "$REPO_PATH" rev-parse --show-toplevel` prints a directory other than
`$REPO_PATH`, the recorded `source_commit` is the commit of that repository,
and the report says the commit is the containing repository's. When the folder
already holds documents from an earlier import, note their `source_commit`
before overwriting them.

Each selected item becomes `.vibeflow/patterns/external-<repo-name>/<entry-name>.md`
(create the directory if needed). A file that already exists is overwritten
with the warning "Previously imported, updating." — never a second copy.

```markdown
---
kind: pattern | convention | workflow
tags: [<3 to 7 lowercase subject tags>]
paths: <the source's frontmatter `paths`, as it came (list or string)>
description: <the source's frontmatter `description`, as it came>
alwaysApply: <the .mdc source's frontmatter `alwaysApply`, as it came>
modules: []
applies_to: []
confidence: imported
source: <repo-name>
source_file: <path relative to the source, e.g. .claude/rules/navigation.md>
source_ref: <URL or absolute path given to --from>
source_commit: <full sha from git -C <source> rev-parse HEAD, or none>
imported: YYYY-MM-DD
---
# <Pattern|Convention|Workflow>: <title>

> Imported from <repo-name> (<source_file> @ <7-char sha or none>) on YYYY-MM-DD.

<full content of the source file, without its original frontmatter>
```

- `kind` holds one of the three values; the heading word matches it.
- The `paths` and `description` lines are dropped when the source has none. A
  glob never becomes `modules`.
- A `.mdc` source with an `alwaysApply` field keeps it as it came (`true` or
  `false`); the `alwaysApply` line is dropped for every other source.
- `tags` are subject tags derived from the title, the description and the
  content, the way the vibeflow-analyze skill derives pattern tags: specific domain words
  (`navigation`, `api-client`, `error-handling`), never `external` or the repo
  name on their own.

**Local patterns are kept.** When a local `.vibeflow/patterns/*.md` (the root
directory, not `external-*/`) covers the same subject as an imported document,
both stay, and the report says both will be used: the imported one as the
rule, the local one as the example of how the code does it today.

**`conventions.md` stays untouched.** The import never writes to
`.vibeflow/conventions.md`: a convention is a document with
`kind: convention` like any other. When `conventions.md` still has a
`## External Conventions: <repo-name>` section, it was left by an earlier
import: the report says so and asks whether to remove it; without an answer it
stays.

**Changes since the last import.** On a reimport whose earlier `source_commit`
is recorded and reachable in `$REPO_PATH` (`git -C "$REPO_PATH" cat-file -e
<old>^{commit}`), list the imported files that changed with
`git -C "$REPO_PATH" diff --name-only <old> HEAD -- <source files>`, before
Step 7 removes the clone. On a shallow clone the old commit is not there, and
the report says the two imports can't be compared.

### Step 6: Index the source

Regenerate `.vibeflow/patterns/external-<repo-name>/registry.md` from the
frontmatter of every `.md` in that folder except `registry.md` itself, in name
order — documents kept from earlier imports included:

```
# Imported from <repo-name>

> Source: <source_ref> · commit <7-char sha or none> · imported YYYY-MM-DD · <N> entries (<p> pattern, <c> convention, <w> workflow)

<!-- vibeflow:imported:start -->
entries:
  - file: patterns/external-<repo-name>/<entry-name>.md
    kind: pattern
    tags: [navigation, routing, screens]
    paths: ["**/navigation/**"]
    description: "<as it came>"
  - file: patterns/external-<repo-name>/cursor-rules-style.md
    kind: convention
    tags: [formatting, style, linting]
    alwaysApply: true
<!-- vibeflow:imported:end -->
```

An entry drops `paths` and `description` when its document has none, and
carries `alwaysApply` when its document has it. A document without `kind` was
written by an earlier version of this import under another name, so a reimport
does not replace it: it enters as `kind: pattern` with the tags it has, and the
report lists it.

Then upsert this source's line in `.vibeflow/index.md`, inside the
`## Imported Sources` section, replacing the source's earlier line on a
reimport. When the section is missing, create it with its markers right after
the `## Pattern Registry` section (after `<!-- vibeflow:patterns:end -->`,
before `## Pattern Docs Available`):

```
## Imported Sources

<!-- vibeflow:sources:start -->
- external-<repo-name>: `patterns/external-<repo-name>/registry.md` — <N> entries (<p> pattern, <c> convention, <w> workflow), commit <7-char sha or none>, imported YYYY-MM-DD
<!-- vibeflow:sources:end -->
```

One line per source, never one per document: `index.md` stays within its 80 to
120 lines. An old `patterns/external-<repo-name>/ — Patterns imported from ...`
line under "Pattern Docs Available" is removed; this block replaces it.

### Step 7: Cleanup

A clone gets removed with `rm -rf "$REPO_PATH"` — never `rm -rf` without an
operand — even when an earlier step failed; treat it as a finally block, not a
happy-path step.

### Step 8: Report

- The glob → count table and the total from Step 3.
- How many were selected, by kind.
- The files written, with "Previously imported, updating." where it applied.
- The registry path, `.vibeflow/patterns/external-<repo-name>/registry.md`.
- Local patterns covering the same subject as an imported one, each named
  with the imported document: both will be used, the imported as the rule and
  the local as the example.
- Documents without `kind`, written by an earlier version under another name:
  the report lists them and asks whether to remove them. Without an answer they
  stay, in the registry as `kind: pattern`; a yes removes only the documents
  the person named, inside `patterns/external-<repo-name>/`, and Step 6 runs
  again.
- A leftover `## External Conventions: <repo-name>` section in
  `conventions.md`, with the question about it.
- For a local source inside another git repository, that its `source_commit`
  is the containing repository's commit.
- On a reimport, the source files changed since the earlier commit, or that the
  shallow clone can't compare them.

Close with what the import does downstream: the vibeflow-gen-spec skill selects these entries by
the `paths` and tags in the registry, and `workflow` entries stay stored for
reference and are never selected on their own.

---

## Classify the feedback

Read the feedback and place it in one of four categories. Ambiguous feedback is
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
An imported document in `patterns/external-*/` on the same subject is not a
collision: create the local pattern as the example, and tell the person both
will be used, the imported one as the rule and the local one as the example of
how the code does it today.

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
of what was added. Then suggest: "Run the vibeflow-analyze skill at the next opportunity
to sync auto-generated sections with your corrections."
