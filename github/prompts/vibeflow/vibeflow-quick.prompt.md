# Vibeflow: Quick

> format-agnostic, repo-local prompt asset

Fast-track: generate a prompt pack for small tasks in one command.
Skips discover, generates ephemeral spec, outputs ready-to-use prompt pack.

**Usage:** Provide the task description as input.

---

## Language

Detect the language of the user's input.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## When to Use

- Quick fixes or small features with clear requirements.
- You want a prompt pack NOW, not a paper trail.
- The task fits in ≤4 files.

## When NOT to Use

- The idea is vague → use the vibeflow-discover prompt first.
- You need full documentation for the team → use the full pipeline.
- The task is large or architecturally significant → use vibeflow-gen-spec.

## Phase 0: Check Context

1. Does `.vibeflow/` exist?
   - **YES** → skip to Phase 2 (use existing knowledge).
   - **NO** → go to Phase 1 (lightweight scan).

## Phase 1: Lightweight Scan (only if no `.vibeflow/`)

This is NOT a full analyze. Do NOT generate `.vibeflow/`. Do just enough
to understand the project:

1. Read project config files: `package.json`, `pyproject.toml`, `Cargo.toml`,
   `go.mod`, `build.gradle`, `pom.xml`, or equivalent. Determine the stack.
2. Read top-level directory structure (2 levels deep). Identify structural units.
3. Read 3-4 key files: the main entry point, one route/handler, one model/type
   definition, and one test file (if present).
4. If `.cursorrules`, `CLAUDE.md`, `.github/copilot-instructions.md`, or
   `.cursor/rules/` exist, read them for coding conventions.

Keep all findings in memory — do NOT write files.

At the end, suggest: "For deeper analysis, run the vibeflow-analyze prompt."

## Phase 2: Generate Ephemeral Spec

Using `.vibeflow/` (if available) or Phase 1 context, generate a spec
**in memory only** (do NOT save to file). The spec must contain:

- **Objective** — 1 sentence. What changes for the user.
- **Definition of Done** — 3-5 binary checks (fewer than standard specs).
- **Scope** — What's in. Keep it tight.
- **Anti-scope** — What's explicitly OUT. Be aggressive.
- **Budget** — ≤ 4 files (tighter than standard ≤6). If the task clearly
  needs more than 4, warn: "This task may be too large for quick.
  Consider using the vibeflow-gen-spec prompt."
- **Applicable Patterns** — Which patterns from `.vibeflow/patterns/`
  apply (if `.vibeflow/` exists).

Do NOT include Technical Decisions or Risks sections (this is fast-track).

## Phase 3: Generate Prompt Pack

Using the ephemeral spec and `.vibeflow/` knowledge (if available),
generate the prompt pack.

The prompt pack MUST start with:
> You are only seeing this prompt; there is no context outside it.

(Write this opening line in the user's detected language.)

Then include, in this order:

### 1. Objective and Definition of Done
From the ephemeral spec.

### 2. Anti-scope
What NOT to do.

### 3. Budget
≤ 4 files (default for quick).

### 4. Patterns to Follow
If `.vibeflow/` exists: embed real code examples from pattern docs
and conventions.md, just like the vibeflow-prompt-pack prompt does.
If `.vibeflow/` does NOT exist: include the conventions and patterns
you observed during the Phase 1 lightweight scan.

### 5. Where to Work
Real file paths. Verify they exist. Include relevant code snippets.

### 6. Directional Guidance
Architectural direction. NOT step-by-step.

### 7. How to Run/Test (MANDATORY)
Detect test runner from stack. Always include test commands.
If no test runner detected: "No test runner detected.
Add manual tests to validate."

Save the prompt pack to: `.vibeflow/prompt-packs/<feature-slug>.md`
Create `.vibeflow/prompt-packs/` if it doesn't exist.

After saving, suggest: "Prompt pack saved. After implementation,
use the vibeflow-audit prompt to verify."
