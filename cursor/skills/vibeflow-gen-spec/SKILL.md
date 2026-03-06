---
name: vibeflow-gen-spec
description: "Generate a grounded technical spec with Definition of Done from a feature description or PRD. Use when the user wants to create a spec, define a DoD, or translate a PRD into technical requirements."
---

# Vibeflow: Gen-Spec

Generate a spec for a feature or task. Includes objective, DoD,
scope, anti-scope, technical decisions, and risks. Grounded in
the project's real patterns from `.vibeflow/`.

**Usage:** Provide the feature description or path to a PRD file as input.

---

## Language

Detect the language of the user's input.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Before Writing the Spec:

0. If the input is a path to a `.md` file inside `.vibeflow/prds/`,
   read the PRD. Use the PRD as the basis for the spec — the problem,
   audience, solution, scope, and anti-scope are already defined. Focus
   on translating to technical decisions, binary DoD, and applicable patterns.

1. Check if `.vibeflow/` exists. If it does:
   - Read `.vibeflow/index.md` for project context
   - Check for `Suggested budget: ≤ N` line in index.md — use that as the
     budget for this spec. If not present, default to ≤ 6 files.
   - Read `.vibeflow/conventions.md` for coding standards
   - **Pattern Resolution:** Read the `## Pattern Registry` YAML block from
     `index.md` (between `<!-- vibeflow:patterns:start/end -->` markers).
     Cross-reference the registry's tags and modules against the feature
     description/scope to identify relevant patterns. Load only the top 3-5
     matching pattern docs from `.vibeflow/patterns/`. If no Pattern Registry
     exists in index.md, fall back to reading all pattern docs.
2. If `.vibeflow/` does NOT exist:
   - Warn the user: "No project analysis found. Run the vibeflow-analyze
     skill first for better results. Proceeding with direct code reading."
   - Read relevant files directly from the codebase
3. Identify what exists today related to this feature
4. Identify which existing patterns apply

## Then Produce the Spec:

- **Objective** — 1 sentence. What changes for the user.
- **Context** — What exists today and why this matters now.
- **Definition of Done** — 3-7 binary checks (pass/fail, no ambiguity).
- **Scope** — What's in.
- **Anti-scope** — What's explicitly OUT. Be aggressive.
- **Technical Decisions** — With trade-offs and justification.
- **Applicable Patterns** — List which patterns from `.vibeflow/patterns/`
  must be followed. If the feature introduces a NEW pattern, note it.
- **Risks** — Premortem: what can go wrong + mitigation.
- **Dependencies** (optional) — List of specs that must be implemented
  before this one. Use when this spec is part of a multi-part split.
  Format: `- .vibeflow/specs/<feature>-part-N.md`

Be opinionated. Cut scope aggressively. Challenge vague requirements.
If something is unclear, state your assumption and flag it with a TODO.

## Spec Splitting

After drafting the spec, check if it exceeds limits:

- **>7 DoD checks**, OR
- **> budget of files** (from `.vibeflow/index.md` or default ≤ 6)

If EITHER condition is true, **do not save the spec**. Instead:

1. Inform the user: "This spec exceeds limits (N DoD checks / N files).
   I will split it into smaller specs."
2. Break it into N self-contained specs, each with:
   - Its own Objective, DoD (3-7 checks), Scope, and Anti-scope
   - A `Dependencies` field listing which specs must come before it
3. Use the naming convention: `<feature>-part-1.md`, `<feature>-part-2.md`, etc.
4. Each part must be independently implementable and auditable.
5. Save all parts and present a summary with the execution order.

Do NOT produce a single large spec and leave splitting to someone else.
The architect owns the split decision.

Save the spec to: `.vibeflow/specs/<feature-slug>.md`
Create the `.vibeflow/specs/` directory if it doesn't exist.

After saving, suggest: "Spec saved. When ready, use the vibeflow-prompt-pack
skill with `.vibeflow/specs/<feature-slug>.md` as input to generate a
self-contained prompt pack for the coding agent."
