---
name: teach
description: >
  Updates the project knowledge base (.vibeflow/) with corrections, new conventions,
  architectural decisions, or new patterns based on natural language feedback. Edits
  are placed outside auto-generated markers to survive incremental analyze runs. Use
  to keep .vibeflow/ accurate as the project evolves.
argument-hint: "<feedback>"
allowed-tools: Read, Grep, Glob
---
---

## Description and examples

**What it does:** Updates `.vibeflow/` from natural language: corrects a pattern doc, adds a convention, records a decision, or documents a new pattern. Prefer corrections outside the auto-generated markers so they survive the next analyze.

**Examples:**
- `/vibeflow:teach sempre usar camelCase para variáveis de estado` — Adds or updates a convention.
- `/vibeflow:teach o padrão de API mudou, agora validamos com zod` — Updates the relevant pattern or conventions.
- `/vibeflow:teach decidimos usar Redis para cache, não in-memory` — Logs the decision (e.g. in decisions.md or conventions).

---

## Language

Detect the language of the user's input ($ARGUMENTS or conversation).
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Process feedback and update project knowledge: $ARGUMENTS

## Before starting

1. Check if `.vibeflow/` exists.
   - **YES** → read `.vibeflow/index.md` for orientation.
   - **NO** → warn: "`.vibeflow/` does not exist. Run `/vibeflow:analyze`
     first to create the knowledge base." and STOP.

## Classify the feedback

Read $ARGUMENTS and classify into one of these categories:

### (a) Existing pattern correction
The user is saying an existing pattern doc is wrong or outdated.
- Identify which `patterns/*.md` file is affected.
- Read that file.
- Apply the correction OUTSIDE the `<!-- vibeflow:auto -->` markers
  (add a `## Manual Corrections` section at the end if it doesn't exist,
  or append to it).
- This ensures the correction survives incremental analyze runs.

### (b) New convention
The user is adding a coding convention.
- Read `conventions.md`.
- Add the new convention OUTSIDE the `<!-- vibeflow:auto -->` markers
  (add a `## Team Conventions` section at the end if it doesn't exist,
  or append to it).

### (c) Architectural decision
The user is recording an architectural decision.
- Read `decisions.md`.
- Add a new entry at the TOP (newest first), formatted as:

```
### <date> — <title>
**Decision:** <what was decided>
**Context:** <why>
**Discarded alternatives:** <what was not chosen and why>
```

### (d) New pattern
The user is describing a pattern that doesn't have a doc yet.
- Create a new file: `.vibeflow/patterns/<name>.md`
- Use the standard structure with markers:

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

- Update `.vibeflow/index.md` → add the new pattern to "Pattern Docs Available".
- Update architect's MEMORY.md if it exists.

## After updating

Report to the user:
- What category was identified
- Which file(s) were modified
- What was added/changed (brief summary)
- Suggest: "Run `/vibeflow:analyze` at the next opportunity to
  sync auto-generated sections with your corrections."

## Rules

- NEVER modify content inside `<!-- vibeflow:auto:start/end -->` markers.
  User corrections go OUTSIDE markers to survive incremental updates.
- ALWAYS read the target file before modifying it.
- If the feedback is ambiguous, ask ONE clarifying question before acting.
- If `.vibeflow/` doesn't exist, STOP. Don't create it manually.

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
