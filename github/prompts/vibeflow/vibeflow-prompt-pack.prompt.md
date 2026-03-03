# Vibeflow: Prompt Pack

> format-agnostic, repo-local prompt asset

Generate a self-contained prompt pack from a spec. The prompt pack
is designed for a coding agent (Copilot, Cursor, Claude Code, etc.) that
has NO context beyond the prompt itself. Embeds real patterns from
`.vibeflow/` so the agent follows the project's conventions.

**Usage:** Provide the spec file path or feature name as input.

---

## Language

The prompt pack MUST be written in the user's detected language.
The opening line should be language-adaptive:
Write the opening line in the user's detected language. The concept is:
"You are only seeing this prompt; there is no context outside it."

All textual content (objective, DoD, anti-scope, guidance) should be in
the detected language. Code, paths and technical names remain in English.

## Steps:

1. If the input is a file path, read that spec file.
2. If it's a feature description, look for a matching spec in `.vibeflow/specs/`.
3. If no spec exists, generate one first (following gen-spec format), save it,
   then continue.
4. Read `.vibeflow/` docs:
   - `.vibeflow/conventions.md` (always)
   - Pattern docs listed in the spec's "Applicable Patterns" section
   - If the spec doesn't list patterns, infer which ones are relevant
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

```markdown
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
After implementation, use the vibeflow-audit prompt with the spec to verify."
