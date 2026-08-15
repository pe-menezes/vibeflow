---
name: vibeflow-quick
description: "Fast-tracks small tasks into a prompt pack in one command. Skips discover, generates an ephemeral spec in memory. Use for well-defined tasks that fit in ≤4 files."
---

# Vibeflow: Quick

Fast-track: generate a prompt pack for small tasks in one command.
Skips discover, generates ephemeral spec, outputs ready-to-use prompt pack.

**Usage:** Provide the task description as input.

---

## Language

Detect the language of the user's input.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## When to use

Quick fixes and small features with clear requirements, fitting in ≤4 files,
when you want a prompt pack now rather than a paper trail. Not for:

- The idea is vague → use the vibeflow-discover skill first.
- You need full documentation for the team → use the full pipeline.
- The task is large or architecturally significant → use the vibeflow-gen-spec skill.

## Phase 0: Check context

`.vibeflow/` exists → skip to Phase 2 and use it. Otherwise → Phase 1.

## Phase 1: Lightweight scan (only without `.vibeflow/`)

Enough to understand the project, and no more — this doesn't generate
`.vibeflow/` and writes nothing to disk:

1. The project's config files, for the stack.
2. The top 2 directory levels, for the structural units.
3. Three or four key files: the entry point, one route or handler, one
   model or type definition, one test.
4. `.cursorrules`, `CLAUDE.md`, or `.cursor/rules/`, if present, for conventions.

Findings stay in memory. At the end, suggest: "For deeper analysis, run
the vibeflow-analyze skill."

## Phase 2: Generate the ephemeral spec

From `.vibeflow/` or the Phase 1 context, build a spec **in memory only** —
never saved to a file — containing:

- **Objective** — 1 sentence. What changes for the user.
- **Definition of Done** — 3-5 binary checks (fewer than a standard spec).
- **Scope** — What's in. Keep it tight.
- **Anti-scope** — What's explicitly out. Be aggressive.
- **Budget** — ≤4 files, tighter than the standard ≤6. A task that clearly
  needs more gets a warning in the user's language: "This task may be too
  large for quick. Consider using the vibeflow-gen-spec skill."
- **Applicable Patterns** — from `.vibeflow/patterns/`, when it exists.

No Technical Decisions and no Risks sections — this is the fast track.

## Phase 3: Generate the prompt pack

Same structure the vibeflow-prompt-pack skill produces, from the ephemeral spec and
whatever knowledge you have. It opens with the line

> You are only seeing this prompt; there is no context outside it.

then, in order:

1. **Objective and Definition of Done** — from the ephemeral spec.
2. **Anti-scope** — what not to do.
3. **Budget** — the ≤4 files from Phase 2.
4. **Patterns to follow** — with `.vibeflow/`, embed real code examples from the
   pattern docs and conventions.md; without it, what the Phase 1 scan observed.
5. **Where to work** — real file paths, verified, with the relevant snippets.
6. **Directional guidance** — architectural direction, not step-by-step.
7. **How to run and test** — required. Detect the runner and include the
   command; none detected → "No test runner detected. Add manual tests to
   validate."

Save it to `.vibeflow/prompt-packs/<feature-slug>.md` (create the directory if
it doesn't exist).

## After saving, report to the user:

- Path of the generated prompt pack
- Objective and DoD in 2-3 lines
- If `.vibeflow/` didn't exist: remind them the vibeflow-analyze skill makes the next
  run richer
- Suggest: "After implementing, run the vibeflow-audit skill to verify."

