---
name: audit
description: >
  Audits recent work against its Definition of Done and project patterns. Runs
  the test suite, compares code against the spec, and reports PASS / PARTIAL / FAIL.
  Also runs the Critical Gate — a safety scan of the diff for destructive or
  dangerous operations. Generates an incremental prompt pack for any gaps found.
  Use after implementation to verify quality before shipping.
argument-hint: "<spec file or feature>"
allowed-tools: Read, Grep, Glob, Bash
---
---

## Description and examples

**What it does:** Finds the spec (in `.vibeflow/specs/` or by path), checks each DoD item and pattern compliance, runs the project's test suite, and reports PASS / PARTIAL / FAIL. If tests fail, the result is FAIL regardless of DoD.

**Examples:**
- `/vibeflow:audit .vibeflow/specs/login-flow.md` — Audit implementation against the login-flow spec.
- `/vibeflow:audit login-flow` — Same; the agent looks up the spec by feature name.

---

## Language

Detect the language of the user's input ($ARGUMENTS or conversation).
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Audit the implementation for: $ARGUMENTS

## Steps:

1. Find the spec — check `.vibeflow/specs/` or use the provided file path.
2. Extract the Definition of Done from the spec.
3. Read `.vibeflow/` docs:
   - `.vibeflow/conventions.md`
   - Pattern docs referenced in the spec's "Applicable Patterns" section (manual override)
   - If spec doesn't list patterns: **use Pattern Resolution.** Read the
     `## Pattern Registry` YAML block from `index.md` (between
     `<!-- vibeflow:patterns:start/end -->` markers). Cross-reference the
     registry's tags and modules against the spec's scope. Load the top 3-5
     matching patterns. If no registry exists, infer which ones are relevant.
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
6. **Critical Gate — destructive-op safety scan.**
   A deterministic safety net for dangerous changes the DoD never mentions —
   security regressions and destructive operations that are side effects, not
   features. This is NOT a style check.

   a. **Compute the real diff** (added vs removed lines — required, because the
      highest-value rules detect *removed* protections):
      - Uncommitted work: `git diff HEAD`
      - Committed on a branch: `git diff <base>...HEAD` (base = `main`/`master`)
   b. **Match each changed line against the Rules Catalog below.** A rule fires
      only when the diff line's direction matches its `scope` (a=added, r=removed,
      b=both) AND the file matches the rule's target types.
   c. **Honor overrides.** Skip a finding if the spec, the PR body, or a comment
      near the line contains `vibeflow:allow <RULE_ID>: <reason>`. CRITICAL/HIGH
      require a non-empty justification; WARNING/INFO may be overridden without one.
   d. **Map findings to the verdict:**
      | Unresolved finding | Effect |
      |---|---|
      | CRITICAL / HIGH | **FAIL** — listed first in the incremental prompt pack |
      | WARNING | caps the verdict at **PARTIAL**; listed, does not block |
      | INFO | informational note only |
      | none | proceed normally |

   **Rules Catalog (~40 rules, 6 domains).**

   _Database_ — files: `*.sql`, `**/migrations/*`
   | ID | Sev | Scope | Trigger |
   |---|---|---|---|
   | DS101 | CRITICAL | a | `DROP DATABASE` |
   | DS102 | CRITICAL | a | `DROP TABLE` |
   | DS103 | CRITICAL | a | `TRUNCATE [TABLE]` |
   | DS104 | HIGH | a | `DROP COLUMN` |
   | DS105 | HIGH | a | `ALTER TABLE … DROP` |
   | DS106 | HIGH | a | `DELETE FROM <table>` with no `WHERE` |
   | DS108 | WARNING | a | `RENAME TABLE` / `ALTER TABLE … RENAME` |
   | DS110 | INFO | a | `ALTER TABLE … MODIFY` (column type change → data loss) |

   _Security_ — files: source (`*.py,*.js,*.ts,*.rb,*.go,*.java`); SEC104 also config/env
   | ID | Sev | Scope | Trigger |
   |---|---|---|---|
   | SEC101 | CRITICAL | r | auth middleware/guard removed (`authenticate`, `@login_required`, `isAuthenticated`, `requireAuth`) |
   | SEC102 | CRITICAL | r | CSRF protection removed |
   | SEC103 | HIGH | r | rate limiting / throttle removed |
   | SEC104 | CRITICAL | a | hardcoded secret (`password`/`secret`/`api_key`/`token` = literal ≥8 chars) |
   | SEC105 | HIGH | a | TLS/SSL disabled (`ssl`/`tls` = false/off/0) |
   | SEC106 | HIGH | a | cert verification off (`verify=false`, `InsecureSkipVerify=true`, `NODE_TLS_REJECT_UNAUTHORIZED=0`) |
   | SEC107 | WARNING | r | sanitization/encoding removed (XSS risk) |
   | SEC108 | WARNING | a | dynamic exec (`eval`/`exec`/`system`/`popen`/`subprocess.call`/`child_process.exec`) |

   _Infrastructure (IaC)_ — files: `*.tf`, `*.hcl`
   | ID | Sev | Scope | Trigger |
   |---|---|---|---|
   | IAC101 | CRITICAL | a | `force_destroy = true` / `destroy = true` |
   | IAC102 | CRITICAL | a | `prevent_destroy = false` |
   | IAC103 | HIGH | b | IAM change (`iam_policy`/`iam_role`/`iam_user`/`aws_iam`) |
   | IAC104 | HIGH | r | security group / firewall rule / network ACL removed |
   | IAC105 | WARNING | a | `cidr_blocks = ["0.0.0.0/0"]` (public access) |
   | IAC106 | WARNING | a | `publicly_accessible`/`public_access = true` |

   _Kubernetes_ — files: `*.yml`, `*.yaml`
   | ID | Sev | Scope | Trigger |
   |---|---|---|---|
   | K8S101 | HIGH | a | `privileged: true` |
   | K8S102 | HIGH | a | `hostPath:` |
   | K8S103 | HIGH | a | `runAsUser: 0` |
   | K8S104 | HIGH | a | `runAsNonRoot: false` |
   | K8S105 | WARNING | a | dangerous capability (`SYS_ADMIN`/`NET_ADMIN`/`ALL`) |
   | K8S106 | WARNING | a | `hostNetwork: true` |

   _Config_ — files: `*.yml,*.yaml,*.json,*.toml`, Dockerfiles, code
   | ID | Sev | Scope | Trigger |
   |---|---|---|---|
   | CFG101 | HIGH | a | CORS wildcard `*` (`access-control-allow-origin: *`) |
   | CFG102 | WARNING | a | debug mode on (`debug = true`) |
   | CFG103 | WARNING | a | log level `debug`/`trace` (prod data exposure) |
   | CFG104 | WARNING | a | sensitive port exposed (22/3389/5432/3306/6379/27017/9200/11211) |
   | CFG105 | INFO | r | timeout config removed (hung connections) |

   _Data_ — files: source; DAT102 also config
   | ID | Sev | Scope | Trigger |
   |---|---|---|---|
   | DAT101 | CRITICAL | a | mass delete (`delete_all`/`destroy_all`/`removeAll`/`bulk_delete`/`purge`) |
   | DAT102 | HIGH | a | PII exposure (`ssn`/`cpf`/`cnpj`/`passport_number`/`credit_card`/`card_number`) |
   | DAT103 | HIGH | r | encryption/hashing removed (`encrypt`/`bcrypt`/`argon2`/`sha256`/`aes`/`rsa`) |
   | DAT104 | WARNING | a | logging sensitive data (`console.log`/`logger.*` of password/token/secret/key) |
   | DAT105 | WARNING | r | masking/redaction removed (`mask`/`redact`/`anonymize`) |

   When a finding is intentional and documented in the spec, treat it as an override.

7. Audit TWO things:

### A. DoD Compliance
For each DoD check: **PASS** or **FAIL** with evidence.

### B. Pattern Compliance
For each applicable pattern from `.vibeflow/`:
- Does the implementation follow the pattern? Evidence.
- Are conventions respected? (naming, file org, error handling, etc.)
- Any deviations? Are they justified or mistakes?

## Output format:

```
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

### Critical Gate
- 🔴 CRITICAL [DS102] db/migrate/003.sql:12 — DROP TABLE in migration (blocks)
- 🟠 HIGH [SEC101] api/auth.ts:1 — auth middleware removed (blocks)
- 🟡 WARNING [CFG102] config/app.yml:4 — debug mode enabled
- ✅ ALLOWED [DS104] db/migrate/004.sql:7 — DROP COLUMN — override: "documented in spec"
(or "Clean — no destructive operations detected.")

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

## Critical Gate FAIL = Audit FAIL

Any unresolved CRITICAL or HIGH Critical Gate finding forces the verdict to
**FAIL**, exactly like a failing test. An unresolved WARNING caps the verdict at
**PARTIAL**. A finding is "resolved" only by a valid `vibeflow:allow` override —
and CRITICAL/HIGH overrides require a written justification.

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
  Fix the gaps and run `/vibeflow:audit` again."

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
