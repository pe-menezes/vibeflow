---
name: prompt-pack
description: >
  Generates a self-contained prompt pack from a spec. Embeds real code patterns
  from .vibeflow/ so any coding agent (Claude Code, Cursor, Copilot) follows the
  project's conventions without needing repo context. Use when handing off
  implementation to a separate session or agent.
argument-hint: "<spec file or feature>"
allowed-tools: Read, Grep, Glob
---
---

## Description and examples

**What it does:** Reads a spec from `.vibeflow/specs/` (or path), builds a single prompt that includes objective, DoD, anti-scope, and real code patterns. Saves to `.vibeflow/prompt-packs/<slug>.md`. Give that file to the coding agent so it implements without needing the rest of the repo context.

**Examples:**
- `/vibeflow:prompt-pack .vibeflow/specs/login-flow.md` — Generate prompt pack from the login-flow spec.
- `/vibeflow:prompt-pack login-flow` — Same; agent finds the spec by name.

---

## Language

The prompt pack MUST be written in the user's detected language. The opening line should be language-adaptive:
Write the opening line in the user's detected language. The concept is: "You are only seeing this prompt; there is no context outside it."

All textual content (objective, DoD, anti-scope, guidance) should be in the detected language.
Code, paths and technical names remain in English.

Generate a self-contained prompt pack for: $ARGUMENTS

## Steps:

0. **Validate spec size.** Read the spec and check:
   - If it has **>7 DoD checks**, OR
   - If it exceeds the **budget** (from `.vibeflow/index.md` or default ≤ 6 files)

   If EITHER condition is true, **stop**. Do NOT generate the prompt pack.
   Instead, inform the user: "This spec exceeds limits (N DoD checks / N files).
   Run /vibeflow:gen-spec again to split it into smaller specs before generating
   a prompt pack."

1. If $ARGUMENTS is a file path, read that spec file.
2. If it's a feature description, look for a matching spec in `.vibeflow/specs/`.
3. If no spec exists, generate one first (following gen-spec format), save it,
   then continue.
4. Read `.vibeflow/` docs:
   - `.vibeflow/conventions.md` (always)
   - Pattern docs listed in the spec's "Applicable Patterns" section (manual override)
   - If the spec doesn't list patterns: **use Pattern Resolution.** Read the
     `## Pattern Registry` YAML block from `index.md` (between
     `<!-- vibeflow:patterns:start/end -->` markers). Cross-reference the
     registry's tags and modules against the spec's scope. Load the top 3-5
     matching patterns. If no registry exists, infer which ones are relevant.
5. Read the actual codebase files relevant to this task.
6. Generate the prompt pack.

## The Prompt Pack MUST Start With:

> You are only seeing this prompt; there is no context outside it.

(Write this opening line in the user's detected language.)

## Then include, in this order:

### 1. Objective and Definition of Done
Copied from the spec. Non-negotiable.

### 2. Anti-scope
What NOT to do. Copied from spec.

### 3. Budget
Max files to change. Read the budget from the spec. If the spec doesn't
specify a budget, check `.vibeflow/index.md` for the `Suggested budget`
line. If neither is available, default to ≤ 6.

### 4. Project Patterns to Follow
THIS IS CRITICAL. Embed the actual patterns the agent must follow.
Copy the relevant sections from `.vibeflow/patterns/*.md` and
`.vibeflow/conventions.md` directly into the prompt pack.

Include REAL code examples from the pattern docs — not references to
external files the agent won't see. The prompt pack is self-contained.

Format as:

```
## Patterns to Follow

### <Pattern Name>
<description>
<real code example from this project showing the pattern>

### Coding Conventions
<relevant conventions for this task>
```

### 5. Where to Work
Real file paths from the codebase (verify they exist).
Relevant code snippets for context.

### 6. Directional Guidance
Architectural direction, constraints to respect.
NOT step-by-step prescriptive instructions.

### 7. How to Run/Test (MANDATORY)
Commands to validate the implementation. This section is REQUIRED.

- Read `.vibeflow/index.md` or project config files (package.json,
  pyproject.toml, Cargo.toml, etc.) to detect the test runner.
- Always include the detected test command (e.g., `npm test`, `pytest`,
  `cargo test`, `go test ./...`).
- If the spec lists specific test commands, include those too.
- If no test runner is detected, write: "No test runner detected.
  Add manual tests to validate."
- Format example:
  ```
  ## How to validate
  1. Run tests: `npm test`
  2. Verify manually: [description]
  ```

### 8. Docs to Update
Which docs need changes after implementation.

If you cannot verify a file path exists, flag it with:
`<!-- TODO: verify this path -->`

Save the prompt pack to: `.vibeflow/prompt-packs/<feature-slug>.md`
Create the `.vibeflow/prompt-packs/` directory if it doesn't exist.

After saving, suggest: "Prompt pack saved. Hand it off to the coding agent.
After implementation, run `/vibeflow:audit` with the spec to verify."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
