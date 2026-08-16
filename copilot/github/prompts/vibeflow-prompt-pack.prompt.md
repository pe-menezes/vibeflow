---
name: 'vibeflow-prompt-pack'
description: 'Generates a self-contained prompt pack from a spec with embedded patterns for any coding agent.'
agent: 'vibeflow-architect'
---

# Vibeflow: Prompt Pack

> format-agnostic, repo-local prompt asset

Build a self-contained prompt pack from a spec, for a coding agent that has no
context beyond the prompt itself. Real patterns from `.vibeflow/` go in it.

**Usage:** Provide the spec file path or feature name as input.

---

## Language

Write the whole pack — opening line, objective, DoD, anti-scope, guidance — in
the user's detected language. Code, paths, and technical names stay in English.

## Steps

0. **Validate spec size.** Read the spec: more than 7 DoD checks, or over the
   budget (the spec's Budget field, else the `Suggested budget` line in
   `.vibeflow/index.md`, else ≤6 files), and you stop without generating the
   pack — tell the user it exceeds limits (N checks / N files) and to run
   the vibeflow-gen-spec prompt again to split it first.
1. Locate the spec: a file path is read directly; a feature description is
   matched against `.vibeflow/specs/`. No spec exists → generate one in the
   gen-spec format, save it, then continue.
2. Read `.vibeflow/conventions.md`, plus the pattern docs the spec lists under
   Applicable Patterns. If it lists none, resolve them: read the
   `## Pattern Registry` block in `index.md` (between
   `<!-- vibeflow:patterns:start/end -->` markers) and cross-reference its tags
   and modules against the spec's scope — top 3–5 matches; with no registry,
   infer which are relevant.
3. Read the codebase files this task touches, plus anything the spec lists
   under References.
4. Generate the pack.

## The pack opens with

> You are only seeing this prompt; there is no context outside it.

## Then, in this order

### 1. Objective and Definition of Done
From the spec. Non-negotiable.

### 2. Anti-scope
What not to do, from the spec.

### 3. Budget
Max files to change — the budget resolved in step 0.

### 4. Project patterns to follow
What decides whether the pack works. Copy the relevant sections of
`.vibeflow/patterns/*.md` and `.vibeflow/conventions.md` in full, with their
real code examples — the receiving agent cannot open files you reference.
Format:

```markdown
## Patterns to Follow

### <Pattern Name>
<description>
<real code example from this project showing the pattern>

### Coding Conventions
<relevant conventions for this task>
```

### 5. References from the spec
Only when the spec lists References. Same self-containment rule as the
patterns: embed the mockup, the test file, or the snippet the implementation
has to match, in full. Too large to embed → give the verified path and say what
the agent should take from it. A reference that is neither embedded nor
reachable by the receiving agent doesn't belong in the pack.

### 6. Where to work
Real file paths from the codebase, with the code snippets that give them
context.

### 7. Directional guidance
Architectural direction and constraints to respect, not step-by-step
instructions. The pack carries this contract, adapted to the task:

> Deliver what the spec asks, at the scope it defines. Make routine judgment
> calls yourself; check in only when different readings would lead to
> materially different work. If the spec seems mistaken, say so in a sentence
> and continue as specified. Finish the whole task, and stop short of changes
> clearly beyond it. Match what you write — code, docs, comments — to what the
> task needs, without filler or boilerplate.

### 8. How to run and test
Required. Detect the runner from `.vibeflow/index.md` or the project's config
files and include the command, plus any the spec lists. None detected → "No
test runner detected. Add manual tests to validate." Format:

```
## How to validate
1. Run tests: <detected command>
2. Verify manually: [description]
```

### 9. Docs to update
Which docs need changes after implementation.

Flag any path you could not verify with `<!-- TODO: verify this path -->`.

Save the prompt pack to `.vibeflow/prompt-packs/<feature-slug>.md` (create the
directory if it doesn't exist).

After saving, suggest: "Prompt pack saved. Hand it off to the coding agent.
After implementation, use the vibeflow-audit prompt with the spec to verify."
