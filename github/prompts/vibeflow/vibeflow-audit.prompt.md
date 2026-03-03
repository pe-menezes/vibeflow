# Vibeflow: Audit

> format-agnostic, repo-local prompt asset

Audit recent work against its Definition of Done AND project patterns.
Compares the current state of the code against the spec/DoD and verifies
the implementation follows conventions from `.vibeflow/`.

**Usage:** Provide the spec file path or feature name as input.

---

## Language

Detect the language of the user's input.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Steps:

1. Find the spec — check `.vibeflow/specs/` or use the provided file path.
2. Extract the Definition of Done from the spec.
3. Read `.vibeflow/` docs:
   - `.vibeflow/conventions.md`
   - Pattern docs referenced in the spec's "Applicable Patterns" section
   - If spec doesn't list patterns, infer which ones are relevant
4. Read the codebase files that were supposed to change.
5. **MANDATORY: Detect and run tests.**
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
   - If the spec lists specific test/validation commands: prefer those
     over the defaults above.
   - If a test runner is found: **RUN the tests.**
     - Tests FAIL → **automatic FAIL verdict.** Stop auditing. The
       incremental prompt pack targets the test failures.
     - Tests PASS → continue to step 6.
   - If NO test runner is detected: warn "No test runner detected.
     Verify that tests were run manually." and continue.
6. Audit TWO things:

### A. DoD Compliance
For each DoD check: **PASS** or **FAIL** with evidence.

### B. Pattern Compliance
For each applicable pattern from `.vibeflow/`:
- Does the implementation follow the pattern? Evidence.
- Are conventions respected? (naming, file org, error handling, etc.)
- Any deviations? Are they justified or mistakes?

## Output Format:

```markdown
## Audit Report: <feature>

**Verdict: PASS | PARTIAL | FAIL**

### DoD Checklist
- [x] Check 1 — evidence of compliance
- [ ] Check 2 — what's missing and why it fails

### Pattern Compliance
- [x] <pattern name> — follows correctly. Evidence: <file:line>
- [ ] <pattern name> — DEVIATION: <what's wrong, what it should be>

### Convention Violations (if any)
- <file> — <violation> — <what the convention says>

### Gaps (if PARTIAL or FAIL)
For each failing check:
- What's missing
- What's needed to close it
- Estimated effort (S/M/L)

### Incremental Prompt Pack (if PARTIAL or FAIL)
A focused prompt pack covering ONLY the gaps.
Include the correct patterns the agent must follow (embed them).
Do NOT repeat work that already passes.
```

## Test FAIL = Audit FAIL

**Critical rule:** If any test fails, the audit verdict is AUTOMATICALLY
**FAIL** regardless of DoD or pattern compliance status. Failed tests block
shipping. The incremental prompt pack (if generated) should target the
test failures first.

CRITICAL: If you cannot verify a DoD check or pattern compliance from
available context, mark it as FAIL with reason: "insufficient context
to verify". Never assume compliance.

Save the audit report to: `.vibeflow/audits/<feature-slug>-audit.md`
Create the `.vibeflow/audits/` directory if it doesn't exist.

After auditing, update `.vibeflow/decisions.md` if any architectural
decisions were made or if new pitfalls were discovered.

After saving, report the verdict and suggest next steps:
- **PASS:** "Ready to ship."
- **PARTIAL/FAIL:** "See the incremental prompt pack in the audit report.
  Fix the gaps and run the audit again."
