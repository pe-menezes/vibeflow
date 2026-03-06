---
description: >
  Implement a feature from its spec. Reads the spec's DoD, scope, anti-scope,
  budget, and applicable patterns from .vibeflow/, then implements following
  all guardrails. Runs tests and self-verifies DoD before suggesting audit.
  Claude Code only — the agent has filesystem access and acts as Coding Agent.
  Usage: /vibeflow:implement <spec file or feature name>
---

## Description and examples

**What it does:** Reads a spec from `.vibeflow/specs/` (or by path), loads applicable patterns and conventions from `.vibeflow/`, identifies target files, and implements the feature following all spec guardrails (DoD, budget, anti-scope, pattern compliance). Runs tests and self-verifies each DoD check before finishing. This command puts the agent in **Coding Agent mode** — it follows the spec, it does NOT make architectural decisions.

**Examples:**
- `/vibeflow:implement .vibeflow/specs/auto-install.md` — Implement from spec file path.
- `/vibeflow:implement auto-install` — Same; agent finds the spec by feature name in `.vibeflow/specs/`.
- `/vibeflow:implement .vibeflow/specs/auth-part-2.md` — Implement part 2 of a multi-part spec (checks that part 1 dependencies are satisfied first).

---

## Language

Detect the language of the user's input ($ARGUMENTS or conversation).
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Implement from spec: $ARGUMENTS

---

## Role: Coding Agent

You are a **Coding Agent**. You receive a spec and implement it. You do NOT:
- Make architectural decisions (those are in the spec)
- Question the spec's technical decisions
- Refactor code outside the spec's scope
- Add features not in the spec's scope
- Change patterns that the spec doesn't mention

If the spec is unclear or seems wrong, STOP and ask the user rather than
making assumptions. The architect owns decisions; you own execution.

---

## Phase 0: Find and validate the spec

1. **Locate the spec.**
   - If $ARGUMENTS is a file path (contains `/` or ends in `.md`), read that file.
   - If $ARGUMENTS is a feature name, search for a matching file in `.vibeflow/specs/`:
     - Try exact match: `.vibeflow/specs/$ARGUMENTS.md`
     - Try partial match: files containing $ARGUMENTS in the filename
     - If multiple matches: list them and ask the user to choose
   - If NO spec is found: STOP with: "No spec found for '$ARGUMENTS'.
     Available specs in `.vibeflow/specs/`:" followed by the listing.
     Suggest: "Run `/vibeflow:gen-spec` to create one."

2. **Validate the spec has required sections.**
   The spec MUST contain at minimum:
   - **Definition of Done** (or "DoD") — at least 1 check
   - **Scope** (or "Escopo")
   - **Anti-scope** (or "Anti-escopo")

   If any required section is missing: STOP with: "Spec is incomplete —
   missing: [list]. Run `/vibeflow:gen-spec` to produce a complete spec."

3. **Check for multi-part dependencies.**
   If the spec has a **Dependencies** section listing other specs:
   - For each dependency, check if an audit report exists in `.vibeflow/audits/`
     with verdict PASS.
   - If a dependency has no PASS audit: STOP with: "This spec depends on
     `<dependency>` which has not been implemented and audited yet.
     Implement and audit the dependencies first, in order:
     [list dependencies]."
   - If no `.vibeflow/audits/` directory exists: warn but continue with:
     "Dependencies listed but no audit reports found. Proceeding — verify
     that dependencies are already implemented."

---

## Phase 1: Extract guardrails from spec

Read the spec and extract these fields into your working context:

### 1.1 Definition of Done
Extract every DoD check as a numbered list. These are your implementation
checklist — every check MUST pass by the time you finish.

### 1.2 Scope
What you MUST implement. Stay within this boundary.

### 1.3 Anti-scope
What you MUST NOT do. Treat each item as a hard stop.
If you find yourself about to touch something in anti-scope: STOP immediately.

### 1.4 Budget
Extract the budget (max files to change) from the spec. Check in this order:
- Explicit `Budget` field in the spec
- `Suggested budget` line in `.vibeflow/index.md`
- Default: ≤ 6 files

Track every file you create or modify against this budget.

### 1.5 Technical Decisions
Extract all decisions from the spec. These are constraints you follow,
not suggestions you evaluate.

### 1.6 Applicable Patterns
Extract the list of patterns the spec references. You will load these next.

---

## Phase 2: Load context from .vibeflow/

1. **Check `.vibeflow/` exists.**
   - If it does NOT exist: warn "No `.vibeflow/` found. Implementation will
     proceed without pattern guidance. For better results, run `/vibeflow:analyze`
     first." Then skip to Phase 3.

2. **Read `.vibeflow/conventions.md`** — always. These are the coding standards
   you must follow.

3. **Read applicable pattern docs** from `.vibeflow/patterns/`.
   - If the spec lists patterns in "Applicable Patterns": read ONLY those.
   - If the spec doesn't list patterns: infer which are relevant based on
     the scope description. Read at most 3 pattern docs.
   - For each pattern doc, internalize:
     - The real code examples (this is how you must write code)
     - The rules (naming, structure, error handling)
     - The anti-patterns (what NOT to do)

4. **Read `.vibeflow/index.md`** — for project structure, key files, and
   stack context.

Do NOT read all of `.vibeflow/`. Load only what this spec needs.

---

## Phase 3: Plan the implementation

Before writing any code, plan:

### 3.1 Identify target files
Based on the spec's scope, technical decisions, and pattern docs:
- List every file you expect to CREATE (new files)
- List every file you expect to MODIFY (existing files)
- Verify that existing files actually exist (read them)
- Count total files: creates + modifies

**Budget check:** If the count exceeds the budget, STOP with:
"Implementation plan requires N files but budget is ≤ M. Options:
1. Reduce scope (ask the architect to update the spec)
2. Increase budget (ask the architect to adjust)
I will not proceed over budget."

### 3.2 Verify anti-scope
Cross-check your file list and plan against the anti-scope.
If any planned change touches anti-scope territory: remove it from the plan.

### 3.3 Map DoD to implementation steps
For each DoD check, identify what code changes satisfy it.
If a DoD check cannot be mapped to a concrete change: flag it
as "requires manual verification" — you will revisit in Phase 6.

### 3.4 Present the plan
Before implementing, show the user:

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

Proceed to implementation after presenting the plan. If the plan seems
straightforward and well-scoped, do NOT wait for user confirmation — execute.
If the plan has uncertainties or the spec is ambiguous on any point,
ask the user before proceeding.

---

## Phase 4: Implement

Execute the plan. Follow these rules strictly:

### Implementation rules

1. **Follow patterns exactly.** If a pattern doc shows how components,
   routes, handlers, or tests are structured in this project — replicate
   that structure. Do not invent new patterns.

2. **Follow conventions.** Naming, file organization, import style,
   error handling — all from `.vibeflow/conventions.md`.

3. **Minimum change.** Implement what closes the DoD. Nothing beyond.
   No "while I'm here" improvements. No opportunistic refactoring.

4. **Anti-scope is sacred.** If you catch yourself about to modify
   something in anti-scope, stop and revert that change.

5. **Budget is a hard limit.** Track files as you go. If you are about
   to exceed the budget: STOP, report which files you have changed so far,
   and ask the user whether to continue or adjust.

6. **Technical decisions are constraints.** If the spec says "use X library",
   use X. If it says "single file", do not split into modules. Do not
   second-guess the architect.

7. **New dependencies require justification.** If the spec does not
   explicitly authorize a dependency and you find you need one: STOP
   and ask. Include a 1-line justification.

8. **No architectural decisions.** If you encounter a design choice that
   is not covered by the spec: STOP and ask. Do not decide on your own.

### During implementation

- Implement file by file, in a logical order (dependencies first)
- After each file, mentally verify it against the relevant DoD checks
- If you realize the plan needs adjustment, explain why and adjust
  (but do not exceed budget or violate anti-scope)

---

## Phase 5: Run tests

After all code changes are complete:

### 5.1 Detect and run tests

- Read `.vibeflow/index.md` to identify the project stack.
- Based on stack, detect test runners:
  - Node.js / npm: `npm test`
  - Python / pip: `pytest` or `python -m pytest`
  - Rust / cargo: `cargo test`
  - Go: `go test ./...`
  - Ruby / bundler: `rake test` or `bundle exec rspec`
  - Java / Maven: `mvn test`
  - Java / Gradle: `gradle test`
  - If unclear: look for test scripts in package.json, pyproject.toml,
    Cargo.toml, go.mod, Rakefile, build.gradle, pom.xml
- If the spec lists specific test/validation commands: prefer those.
- If NO test runner is detected: warn "No test runner detected.
  Verify manually that the implementation works." and continue to Phase 6.

### 5.2 Handle test results

- **Tests PASS** → continue to Phase 6.
- **Tests FAIL** → attempt to fix:
  1. Read the failure output carefully.
  2. If the failure is in code you wrote: fix it.
  3. If the failure is in code you did NOT write (pre-existing failure):
     report it and continue — do not fix unrelated tests.
  4. Re-run tests after fixing.
  5. If tests still fail after **2 fix attempts**: STOP. Report:
     "Tests are failing after 2 fix attempts. Remaining failures:
     [list]. Proceeding to self-verification but this implementation
     will likely FAIL audit."
     Do NOT enter an infinite fix loop.

---

## Phase 6: Self-verify DoD

Before finishing, verify EACH Definition of Done check yourself:

For each DoD check:
1. Find concrete evidence in the code you wrote
2. Mark as PASS (with evidence) or FAIL (with what's missing)

Present the self-verification:

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

**If any DoD check is NOT MET:**
- If it's something you can still fix without exceeding budget: fix it
  and re-verify.
- If it requires architectural decisions or exceeds budget: report the gap
  and do not attempt to fix.

---

## Phase 7: Finish

After self-verification, report the final status to the user:

### If all DoD checks PASS and tests PASS:

"Implementation complete. All N DoD checks verified.
Budget: M/N files. Tests: PASS.

Run `/vibeflow:audit <spec>` to get the formal verification."

### If there are gaps (some DoD checks FAIL or tests FAIL):

"Implementation complete with gaps.
- DoD: N/M checks passing
- Tests: PASS/FAIL
- Gaps: [list specific gaps]

The audit will likely return PARTIAL or FAIL. Consider fixing the gaps
above, then run `/vibeflow:audit <spec>`."

### Always suggest audit as the next step.

---

## Guardrails Summary

These rules are ALWAYS active during implementation:

| Rule | Detail |
|------|--------|
| Budget hard limit | Do NOT exceed the file budget. Stop and ask if needed. |
| Anti-scope is sacred | Never touch what's explicitly out of scope. |
| DoD is the checklist | Every check must pass. Nothing beyond. |
| Follow patterns | Replicate real patterns from `.vibeflow/patterns/`. |
| Follow conventions | All code follows `.vibeflow/conventions.md`. |
| No architectural decisions | If undecided by spec, ask — don't decide. |
| No scope creep | No "while I'm here" improvements or refactoring. |
| New deps need justification | Stop and ask if a new dependency is needed. |
| Tests must pass | Run tests. Fix failures in your code (max 2 attempts). |
| 2-attempt limit on test fixes | Do not loop forever fixing tests. |

---

## Error Handling

| Situation | Action |
|-----------|--------|
| No spec found | STOP. List available specs. Suggest gen-spec. |
| Spec missing required sections | STOP. List what's missing. Suggest gen-spec. |
| Dependencies not audited | STOP. List what needs to be done first. |
| `.vibeflow/` missing | Warn. Proceed without pattern guidance. |
| Budget exceeded during planning | STOP. Report count. Ask user to adjust. |
| Budget exceeded during implementation | STOP. Report what's done. Ask user. |
| Anti-scope violation detected | STOP. Revert the offending change. |
| Architectural decision needed | STOP. Ask the user or suggest gen-spec update. |
| Tests fail after 2 fix attempts | Report failures. Continue to self-verify. |
| Ambiguous spec | STOP. Ask ONE clarifying question. |

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
