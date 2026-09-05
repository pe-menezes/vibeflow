---
name: quick
description: >
  Fast-tracks small tasks into a ready-to-use prompt pack in one command. Skips
  discover, generates an ephemeral spec in memory, and outputs a prompt pack with
  embedded patterns. Use for well-defined tasks that fit in ≤4 files.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
---

## Description and examples

**What it does:** For small, well-defined tasks (e.g. tiny feature, small planned change), skips PRD and full spec: generates a minimal spec in memory and a prompt pack you can hand to the coding agent. Task should fit in ≤4 files.

**Examples:**
- `quick corrigir formatação de data no dashboard` — One command; you get a prompt pack and can paste it to the agent.
- `quick adicionar botão de exportar CSV na tela de relatórios` — Same; use when scope is clear and small.

---

## Language

Detect the language of the user's current request or conversation.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Web Search Policy

Use WebSearch and WebFetch only when local context (`.vibeflow/`, codebase,
git history) is insufficient — an unfamiliar framework or API. Local first.

Fast-track the prompt pack requested by the user.

## When to use

Small planned tasks and features with clear requirements, fitting in ≤4
files, when you want a prompt pack now rather than a paper trail. Not for:

- An observed defect with reproducible evidence → use `hotfix`.
- The idea is vague → use `discover` first.
- You need full documentation for the team → use the full pipeline.
- The task is large or architecturally significant → use `gen-spec`.

## Phase 0: Check context

`.vibeflow/` exists → skip to Phase 2 and use it. Otherwise → Phase 1.

## Phase 1: Lightweight scan (only without `.vibeflow/`)

Enough to understand the project, and no more — this doesn't generate
`.vibeflow/` and writes nothing to disk:

1. The project's config files, for the stack.
2. The top 2 directory levels, for the structural units.
3. Three or four key files: the entry point, one route or handler, one
   model or type definition, one test (if present).
4. `.cursorrules`, `CLAUDE.md`, or `.cursor/rules/`, if present, for conventions.

Findings stay in memory. At the end, suggest: "For deeper analysis, run
`analyze`."

## Phase 2: Generate the ephemeral spec

From `.vibeflow/` or the Phase 1 context, build a spec **in memory only** —
never saved to a file — containing:

- **Objective** — 1 sentence. What changes for the user.
- **Definition of Done** — 3-5 binary checks (fewer than a standard spec).
- **Scope** — What's in. Keep it tight.
- **Anti-scope** — What's explicitly out. Be aggressive.
- **Budget** — ≤4 files, tighter than the standard ≤6. A task that clearly
  needs more gets a warning in the user's language: "This task may be too
  large for quick. Consider using `gen-spec`."
- **Applicable Patterns** — from `.vibeflow/patterns/`, when it exists.

No Technical Decisions and no Risks sections — this is the fast track.

## Phase 3: Generate the prompt pack

Same structure `prompt-pack` produces, from the ephemeral spec and
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
- If `.vibeflow/` didn't exist: remind them `analyze` makes the next
  run richer
- Suggest: "After implementing, run `audit` to verify."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
