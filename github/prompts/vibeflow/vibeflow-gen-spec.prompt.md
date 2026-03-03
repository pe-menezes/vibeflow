# Vibeflow: Gen-Spec

> format-agnostic, repo-local prompt asset

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
   - Read the pattern docs from `.vibeflow/patterns/` that are relevant
     to this feature
2. If `.vibeflow/` does NOT exist:
   - Warn the user: "No project analysis found. Run the vibeflow-analyze
     prompt first for better results. Proceeding with direct code reading."
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

Be opinionated. Cut scope aggressively. Challenge vague requirements.
If something is unclear, state your assumption and flag it with a TODO.

Save the spec to: `.vibeflow/specs/<feature-slug>.md`
Create the `.vibeflow/specs/` directory if it doesn't exist.

After saving, suggest: "Spec saved. When ready, use the vibeflow-prompt-pack
prompt with `.vibeflow/specs/<feature-slug>.md` as input to generate a
self-contained prompt pack for the coding agent."
