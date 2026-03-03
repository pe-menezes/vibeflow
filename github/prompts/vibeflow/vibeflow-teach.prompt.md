# Vibeflow: Teach

> format-agnostic, repo-local prompt asset

Teach the project knowledge base. Update `.vibeflow/` docs with
corrections, new conventions, decisions, or patterns based on
natural language feedback.

**Usage:** Provide your feedback as input.

---

## Language

Detect the language of the user's input.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Before Starting

1. Check if `.vibeflow/` exists.
   - **YES** → read `.vibeflow/index.md` for orientation.
   - **NO** → warn: "`.vibeflow/` does not exist. Run the vibeflow-analyze
     prompt first to create the knowledge base." and STOP.

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
- Suggest: "Run the vibeflow-analyze prompt at the next opportunity to
  sync auto-generated sections with your corrections."

## Rules

- NEVER modify content inside `<!-- vibeflow:auto:start/end -->` markers.
  User corrections go OUTSIDE markers to survive incremental updates.
- ALWAYS read the target file before modifying it.
- If the feedback is ambiguous, ask ONE clarifying question before acting.
- If `.vibeflow/` doesn't exist, STOP. Don't create it manually.
