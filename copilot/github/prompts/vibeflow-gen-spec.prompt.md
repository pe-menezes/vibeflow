---
name: 'vibeflow-gen-spec'
description: 'Generates a technical spec with DoD, scope, anti-scope, and applicable patterns from .vibeflow/.'
agent: 'vibeflow-architect'
---

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
   - **Pattern Resolution:** Read the `## Pattern Registry` YAML block from
     `index.md` (between `<!-- vibeflow:patterns:start/end -->` markers).
     Cross-reference the registry's tags and modules against the feature
     description/scope to identify relevant patterns. Load only the top 3-5
     matching pattern docs from `.vibeflow/patterns/`. If no Pattern Registry
     exists in index.md, fall back to reading all pattern docs.

### PRD Validation Gate

**Activation:** This gate runs ONLY when the input is a PRD — either a `.md`
file path or a text input longer than 3 lines. If the input is a short
description (≤ 3 lines), skip this gate entirely and proceed to step 2.

After reading the PRD (step 0) and loading `.vibeflow/` context (step 1),
run these 5 sanity checks before generating the spec:

1. **Concrete problem?** — Does the PRD describe a specific, real pain point?
   Or is it generic/vague ("improve the experience")?
2. **Audience defined?** — Is the target user/persona clearly identified?
   Or does it say "everyone" / leave it implicit?
3. **Closable scope?** — Can you envision a v0 with a finite, bounded scope?
   Or is the scope open-ended / too ambitious for one spec?
4. **No conflict with .vibeflow/?** — Cross-reference the PRD's proposed
   solution against `.vibeflow/conventions.md` and loaded patterns. Does it
   conflict with existing architecture, naming conventions, or established
   patterns? Does it duplicate something that already exists?
5. **Technically viable in current stack?** — Based on `.vibeflow/index.md`
   (stack, dependencies, structure), is the proposed solution feasible
   without major stack changes?

**If all 5 checks pass:** proceed silently to spec generation. No delay.

**If any check fails:** STOP and ask the user up to 2 targeted questions
about the failing checks. After the user responds, proceed with spec
generation — do not loop or ask more questions.

Example questions:
- "The PRD mentions X but `.vibeflow/conventions.md` establishes Y. Which
  should the spec follow?"
- "The scope includes A, B, C, D, E — that's likely >7 DoD checks. Can we
  cut to just A and B for v0?"
- "Who is the primary user? The PRD doesn't specify."

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
  At least 1 check MUST be a craftsmanship/quality gate (e.g., "No violations
  of conventions.md Don'ts", "Follows <pattern-name> pattern from .vibeflow/",
  "No new `any` types introduced", "Error handling follows project conventions").
  Functional checks alone are not sufficient.
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

After saving, suggest: "Spec saved to `.vibeflow/specs/<feature-slug>.md`.
Use the vibeflow-implement prompt to implement with guardrails (budget, DoD, patterns).
Or the vibeflow-prompt-pack prompt if you want a self-contained prompt for a separate session/agent."
