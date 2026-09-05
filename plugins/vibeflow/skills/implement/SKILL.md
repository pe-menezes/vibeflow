---
name: implement
description: >
  Implements a feature from its spec following all guardrails: budget, DoD,
  anti-scope, and pattern compliance. Runs an 8-phase pipeline (find spec →
  extract guardrails → load patterns → plan → implement → test → refine →
  self-verify DoD).
  Use after gen-spec when you're ready to code. The agent
  has filesystem access and acts as Coding Agent.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

## Description and examples

**What it does:** Reads a spec from `.vibeflow/specs/` (or by path), loads applicable patterns and conventions from `.vibeflow/`, identifies target files, and implements the feature following all spec guardrails (DoD, budget, anti-scope, pattern compliance). Runs tests and self-verifies each DoD check before finishing. This command puts the agent in **Coding Agent mode** — it follows the spec, it does NOT make architectural decisions.

**Examples:**
- `implement .vibeflow/specs/auto-install.md` — Implement from spec file path.
- `implement auto-install` — Same; agent finds the spec by feature name in `.vibeflow/specs/`.
- `implement .vibeflow/specs/auth-part-2.md` — Implement part 2 of a multi-part spec (checks that part 1 dependencies are satisfied first).

---

## Language

Detect the language of the user's current request or conversation.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Implement from the spec identified in the user's current request.

---

## Role: Coding Agent

You are a coding agent: the spec decides, you execute. Deliver what the spec
asks, at the scope it defines. Make routine judgment calls yourself; check in
only when different readings would lead to materially different work. If the
spec seems mistaken, say so in a sentence and continue as specified. Finish
the whole task, and stop short of changes clearly beyond it.

Architectural decisions belong to the architect. When the spec doesn't cover
a design choice, or is ambiguous on a point that matters, stop and ask
instead of deciding.

## Phase 0: Find and validate the spec

1. Locate it. A file path (contains `/` or ends in `.md`) is read directly.
   A feature name is matched in `.vibeflow/specs/` — exact (`<requested-name>.md`),
   then partial; several matches → list them and ask the user to choose;
   none → list the available specs and suggest `gen-spec`.
2. Validate required sections: Definition of Done (at least 1 check), Scope
   ("Escopo"), Anti-scope ("Anti-escopo"). If any is missing, stop, list
   what's absent, and point to `gen-spec`.
3. Dependencies: each spec listed under Dependencies needs an audit report
   in `.vibeflow/audits/` with verdict PASS. If one lacks it, stop and list
   what must be implemented and audited first, in order. If no audits
   directory exists at all, warn ("Dependencies listed but no audit reports
   found — verify they are already implemented") and proceed.

## Phase 1: Extract guardrails

Pull these from the spec into working context:

- The DoD checks, numbered — the finish line; every check must pass.
- Scope and anti-scope — each anti-scope item is a hard stop.
- The budget: the spec's Budget field, else the `Suggested budget` line in
  `.vibeflow/index.md`, else ≤6 files. It caps every file you create or
  modify; exceeding it means stopping and asking.
- Technical decisions — constraints to follow, not suggestions to evaluate.
- Applicable patterns — loaded in the next phase.

## Phase 2: Load context from .vibeflow/

If `.vibeflow/` doesn't exist, warn that implementation proceeds without
pattern guidance (suggest `analyze`) and skip to Phase 3. Otherwise:

1. Read `.vibeflow/conventions.md` — always.
2. Read the pattern docs the spec lists under Applicable Patterns. If it
   lists none, resolve them: read the `## Pattern Registry` block in
   `index.md` (between `<!-- vibeflow:patterns:start/end -->` markers),
   cross-reference its tags and modules against the spec's scope and target
   paths, and load the top 3–5 matches; with no registry, infer from the
   scope (max 3 docs). Internalize each doc's real examples, rules, and
   anti-patterns — they define how the code is written.
3. Read `.vibeflow/index.md` for structure, key files, and stack.

Load only what this spec needs.

## Phase 3: Plan the implementation

1. Target files: list what you'll create and modify, read the existing ones,
   and count. Over budget → stop and present the options: reduce scope or
   adjust the budget with the architect.
2. Cross-check the file list against the anti-scope; drop anything touching it.
3. Map each DoD check to the changes that satisfy it; a check with no
   concrete mapping is flagged "requires manual verification" for Phase 7.
4. Present the plan:

```
## Implementation Plan

**Spec:** <spec name>
**Budget:** ≤ N files (using M)
**DoD checks:** N

### Files to create
- path/to/new-file.ext — <purpose>

### Files to modify
- path/to/existing.ext — <what changes>

### DoD mapping
1. <DoD check 1> → <which files/changes satisfy it>
2. <DoD check 2> → <which files/changes satisfy it>
...

### Anti-scope confirmed
- <anti-scope item 1> — not touched
- <anti-scope item 2> — not touched
```

A straightforward, well-scoped plan executes without waiting for
confirmation; ambiguity on a point that matters → ask first.

## Phase 4: Implement

Work file by file, dependencies first. While implementing:

- Replicate the loaded patterns and conventions as written — structure,
  naming, import style, error handling. Don't invent parallel patterns.
- Minimum change that closes the DoD: no "while I'm here" improvements, no
  opportunistic refactoring, no features beyond scope.
- A dependency the spec doesn't authorize → stop and ask, with a 1-line
  justification.
- Delegate to parallel agents only for large, genuinely independent tracks
  of work. Do not delegate what a handful of tool calls finishes, and do not
  use agents to verify or double-check your own work. If one agent suffices,
  use one.
- If the plan needs adjusting mid-way, explain why and adjust — still within
  budget and anti-scope.

## Phase 5: Run tests

Prefer test commands listed in the spec. Otherwise detect the project's
runner from the stack (`.vibeflow/index.md`, then test scripts in
package.json, pyproject.toml, Cargo.toml, go.mod, and equivalents). No
runner found → warn "No test runner detected. Verify manually that the
implementation works." and continue to Phase 6.

On failures: fix the ones in code you wrote and re-run — two attempts at
most, then stop, report the remaining failures, and continue to
self-verification noting the audit will likely fail. Pre-existing failures
in code you didn't touch are reported, not fixed.

## Phase 6: Refine (simplify in-scope)

Runs only when Phase 5 passed — never refactor without a green baseline. If
tests failed, were skipped, or no runner exists, continue to Phase 7.

Review only the files of this implementation's diff: consolidate duplication
you introduced, clarify names, remove dead code you added, fix obvious
inefficiencies, align with conventions and patterns. Behavior, public
contracts, budget, and anti-scope stay untouched; no new features or
dependencies.

Re-run the tests after refining. A regression → revert the refine changes,
keep the working implementation, and note "Refine skipped: introduced
regressions." Nothing worth simplifying → state "No refinement needed" and
continue.

## Phase 7: Self-verify DoD

Verify each DoD check against concrete evidence in what you wrote, then
present:

```
## Self-Verification

### DoD Checklist
- [x] Check 1 — evidence: <file:line or description>
- [x] Check 2 — evidence: <file:line or description>
- [ ] Check 3 — NOT MET: <what's missing>

### Budget
Files changed: N / ≤ M budget

### Anti-scope
All anti-scope items respected: YES/NO

### Tests
Result: PASS / FAIL (N failures)

### Pattern Compliance
- <pattern name> — followed: <brief evidence>

### Overall: READY FOR AUDIT / HAS GAPS
```

A check still fixable within budget → fix it and re-verify. One that needs
architectural decisions or more budget → report the gap and leave it.

## Phase 8: Finish

All DoD checks and tests passing →

"Implementation complete. All N DoD checks verified. Budget: M/N files.
Tests: PASS. Run `audit <spec>` to get the formal verification."

With gaps →

"Implementation complete with gaps. DoD: N/M checks passing. Tests:
PASS/FAIL. Gaps: [list]. The audit will likely return PARTIAL or FAIL —
consider fixing the gaps above, then run `audit <spec>`."

Audit is always the next step.

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
