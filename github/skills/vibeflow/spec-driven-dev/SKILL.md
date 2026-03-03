# Skill: Spec-Driven Development

> format-agnostic, repo-local skill reference

Spec-driven development methodology. Use when planning features, reviewing
architecture, generating specs, creating prompt packs for coding agents,
or auditing implementations. Applies to any discussion about what to build,
how to build it, or reviewing what was built.

> **Language:** Adapt output to the user's input language.
> Technical terms in English are acceptable.

## Core Principle

Never start coding without: an objective in 1 sentence, a Definition of Done
(3-7 binary checks), explicit scope, explicit anti-scope, and how to validate.

## Roles

- **Architect (CTO):** Defines technical direction, cuts scope,
  decides trade-offs, produces specs and prompt packs. Does NOT validate —
  challenges.
- **Coding Agent (Dev):** Implements in the repo. Does NOT see previous
  conversations — only sees the prompt pack it receives.

## Spec Format

Every spec must contain:

1. **Objective** — 1 sentence. What changes for the user.
2. **Context** — Why now. What exists today.
3. **Definition of Done** — 3-7 binary checks (pass/fail).
4. **Scope** — What's in.
5. **Anti-scope** — What's explicitly OUT.
6. **Technical Decisions** — Stack, patterns, trade-offs with justification.
7. **Risks** — Premortem: what can go wrong + mitigation.

## Prompt Pack Format

A prompt pack is a self-contained block designed for a coding agent that has
NO context beyond the prompt itself.

It MUST include:

- "You are only seeing this prompt; there is no context outside it."
- Objective + full Definition of Done
- Anti-scope (what NOT to do)
- Budget (max files to change, constraints)
- Where to work (real file paths) or instructions to locate them
- Implementation guidance (DIRECTIONAL, not prescriptive step-by-step)
- How to run/test
- Which docs to update

IMPORTANT: Prompt packs must be DIRECTIONAL, not prescriptive.
Provide organizational context, architectural direction, and DoD.
Do NOT provide step-by-step implementation — the coding agent has full repo
access and knows better how to implement.

## Audit Format

Audit = compare work done against the original DoD.

Verdict:
- **PASS** — All DoD checks met.
- **PARTIAL** — Some checks met; gaps listed.
- **FAIL** — DoD not met; required actions listed.

If PARTIAL or FAIL, generate an incremental prompt pack covering only the gaps.

## Guardrails

- No DoD = no work.
- Minimum change to close the DoD. Nothing beyond.
- No refactoring "just because". No cleanup outside scope.
- Abstraction only with 2+ real uses.
- New dependency: justify in 1 line.
- Default budget: ≤ 6 files changed per task (or the value from
  `.vibeflow/index.md` `Suggested budget` line, if available).
- If exceeding budget: justify.

## When to Request More Context (before generating a prompt pack)

- Touches DB / domain rules / critical calculations
- Involves >1 route or >1 large component
- Risk of exceeding >6 files
- Bug without evidence (repro/logs/stack)
