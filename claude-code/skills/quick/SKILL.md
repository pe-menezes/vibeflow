---
name: quick
description: >
  Fast-tracks small tasks into a ready-to-use prompt pack in one command. Skips
  discover, generates an ephemeral spec in memory, and outputs a prompt pack with
  embedded patterns. Use for well-defined tasks that fit in ≤4 files.
argument-hint: "<task description>"
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

## Description and examples

**What it does:** For small, well-defined tasks (e.g. bug fix, tiny feature), skips PRD and full spec: generates a minimal spec in memory and a prompt pack you can hand to the coding agent. Task should fit in ≤4 files.

**Examples:**
- `/vibeflow:quick corrigir formatação de data no dashboard` — One command; you get a prompt pack and can paste it to the agent.
- `/vibeflow:quick adicionar botão de exportar CSV na tela de relatórios` — Same; use when scope is clear and small.

---

## Language

Detect the language of the user's input ($ARGUMENTS or conversation).
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Web Search Policy

Use WebSearch and WebFetch only when local context (`.vibeflow/`, codebase
files, git history) is insufficient. Prefer local knowledge first:
patterns, conventions, and existing code. Typical valid uses: researching
unknown frameworks/libraries found in the codebase, checking official docs
for unfamiliar APIs.

Fast-track prompt pack for: $ARGUMENTS

## When to use

- Quick fixes or small features with clear requirements.
- You want a prompt pack NOW, not a paper trail.
- The task fits in ≤4 files.

## When NOT to use

- The idea is vague → use `/vibeflow:discover` first.
- You need full documentation for the team → use the full pipeline.
- The task is large or architecturally significant → use `/vibeflow:gen-spec`.

## Phase 0: Check context

1. Does `.vibeflow/` exist?
   - **YES** → skip to Phase 2 (use existing knowledge).
   - **NO** → go to Phase 1 (lightweight scan).

## Phase 1: Lightweight scan (only if no `.vibeflow/`)

This is NOT a full analyze. Do NOT generate `.vibeflow/`. Do just enough
to understand the project:

1. Read project config files: `package.json`, `pyproject.toml`, `Cargo.toml`,
   `go.mod`, `build.gradle`, `pom.xml`, or equivalent. Determine the stack.
2. Read top-level directory structure (2 levels deep). Identify structural units.
3. Read 3-4 key files: the main entry point, one route/handler, one model/type
   definition, and one test file (if present).
4. If `.cursorrules`, `CLAUDE.md`, or `.cursor/rules/` exist, read them for
   coding conventions.

Keep all findings in memory — do NOT write files.

At the end, suggest: "For deeper analysis, run `/vibeflow:analyze`."

## Phase 2: Generate ephemeral spec

Using `.vibeflow/` (if available) or Phase 1 context, generate a spec
**in memory only** (do NOT save to file). The spec must contain:

- **Objective** — 1 sentence. What changes for the user.
- **Definition of Done** — 3-5 binary checks (fewer than standard specs).
- **Scope** — What's in. Keep it tight.
- **Anti-scope** — What's explicitly OUT. Be aggressive.
- **Budget** — ≤ 4 files (tighter than standard ≤6). If the task clearly
  needs more than 4, warn (in the user's detected language): "This task
  may be too large for quick. Consider using `/vibeflow:gen-spec`."
- **Applicable Patterns** — Which patterns from `.vibeflow/patterns/`
  apply (if `.vibeflow/` exists).

Do NOT include Technical Decisions or Risks sections (this is fast-track).

## Phase 3: Generate prompt pack

Using the ephemeral spec and `.vibeflow/` knowledge (if available),
generate the prompt pack. Follow the same structure as `/vibeflow:prompt-pack`:

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
and conventions.md, just like `/vibeflow:prompt-pack` does.
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

## After saving, report to the user:

- Path of the generated prompt pack
- Summary of objective and DoD (2-3 lines)
- Budget used (≤ 4 files)
- If `.vibeflow/` didn't exist: remind to run `/vibeflow:analyze`
  for richer results next time
- Suggest: "After implementing, run `/vibeflow:audit` to verify."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
