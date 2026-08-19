---
name: audit
description: >
  Audits recent work against its Definition of Done and project patterns. Runs
  the test suite, compares code against the spec, and reports PASS / PARTIAL / FAIL.
  Also runs the Critical Gate — a safety scan of the diff for destructive or
  dangerous operations. Generates an incremental prompt pack for any gaps found.
  With --consolidate-hotfixes, reclassifies hotfix trace docs against the
  current code. Use after implementation to verify quality before shipping.
argument-hint: "<spec file or feature>"
allowed-tools: Read, Grep, Glob, Bash
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

## Steps

With `--consolidate-hotfixes` in the input, the round's target is
`.vibeflow/hotfixes/` instead of a spec — jump to Consolidation mode below.

1. Find the spec — in `.vibeflow/specs/` or at the given path — and extract
   its Definition of Done.
2. Read `.vibeflow/conventions.md` and the pattern docs the spec lists under
   Applicable Patterns. If it lists none, resolve them: read the
   `## Pattern Registry` block in `index.md` (between
   `<!-- vibeflow:patterns:start/end -->` markers) and cross-reference its
   tags and modules against the spec's scope — top 3–5 matches; with no
   registry, infer which are relevant.
3. Read the codebase files that were supposed to change.
4. Run the tests. Prefer commands listed in the spec; otherwise detect the
   project's runner from the stack (`.vibeflow/index.md`, then test scripts
   in package.json, pyproject.toml, Cargo.toml, go.mod, and equivalents).
   - Tests fail → the verdict is FAIL and auditing stops; the incremental
     prompt pack targets the failures first.
   - No runner found → warn "No test runner detected. Verify that tests
     were run manually." and continue.
5. **Critical Gate — destructive-op safety scan.**
   A deterministic safety net for dangerous changes the DoD never mentions —
   security regressions and destructive operations that are side effects,
   not features. Not a style check.

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

6. Audit two things:

   **A. DoD compliance** — each DoD check is PASS or FAIL, with evidence.

   **B. Pattern compliance** — for each applicable pattern: is it followed
   (evidence), are conventions respected (naming, file organization, error
   handling), and are deviations justified or mistakes?

   Report every finding, including ones you are uncertain about or consider
   low-severity, each with a confidence level and an estimated severity. Do
   not filter for importance at the finding stage — filtering happens at the
   verdict, where severity and confidence decide what blocks, what caps the
   verdict, and what is only noted.

7. When `.vibeflow/hotfixes/` holds hotfix docs, close the report with one
   line — `N hotfix docs not yet consolidated` — and point at
   `/vibeflow:audit --consolidate-hotfixes`. No consolidation state is
   tracked: every doc present counts. Directory absent or empty → no line.

## Output format

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
A focused prompt pack covering only the gaps.
Include the correct patterns the agent must follow (embed them).
Do not repeat work that already passes.
```

## Verdict rules

- Any failing test → FAIL, regardless of DoD or pattern status. Failed
  tests block shipping.
- Any unresolved CRITICAL or HIGH Critical Gate finding → FAIL, exactly
  like a failing test; an unresolved WARNING caps the verdict at PARTIAL.
  Resolved means a valid `vibeflow:allow` override — CRITICAL/HIGH need a
  written justification.
- A DoD check or pattern you cannot verify from available context is FAIL
  with reason "insufficient context to verify" — compliance is never
  assumed.

Save the audit report to `.vibeflow/audits/<feature-slug>-audit.md`
(create the directory if it doesn't exist). Update `.vibeflow/decisions.md`
when the audit surfaced architectural decisions or new pitfalls.

Report the verdict and suggest next steps:
- PASS: "Ready to ship."
- PARTIAL/FAIL: "See the incremental prompt pack in the audit report.
  Fix the gaps and run `/vibeflow:audit` again."

## Consolidation mode — `--consolidate-hotfixes`

Scan `.vibeflow/hotfixes/*.md`. No directory or no docs → report "No hotfix
docs to consolidate." and stop.

Deterministic by construction: for each doc, re-execute only what the doc
itself carries — its 2–4 binary `DoD` checks and the regression test at the
`Regression` section's `test:` path — against the current code, and classify
from those results:

- `regressed` — a `DoD` check or the regression test broke. Each regressed
  doc is a gap: it feeds the incremental prompt pack, the same mechanism the
  normal round uses for failing checks.
- `promote` — everything green plus a signal not every doc carries: a
  `Deviations` entry pointing at structural follow-up (named debt that asks
  for a spec), or evidence in the doc itself that the fix introduced
  permanent new behavior deserving a first-class contract — a `Preservation`
  property describing behavior that did not exist before the fix, for
  example, not the mere presence of the section. The `Regression` test and
  the required sections are in every doc by construction and are not promote
  signals. Auditor judgment weighs those discriminating signals; the output
  is a gen-spec entry stub, not a spec — the human decides.
- `still-holds` — everything green, no promote signals. The fix stands.

Classification silences nothing: docs with `reproduction` below `real` or
`status: partial` enter the priority-debt list even when green; docs with
`status: halted(...)` have no fix to re-execute and enter the same list
with their resume instruction — a filled `test:` path names the red oracle
the HALT left in the suite, and the entry records its current state.
`Deviations` entries — deferred findings included — are consumed into the
report as listed debt.

Per-doc classification, no PASS/PARTIAL/FAIL verdict. Save the report to
`.vibeflow/audits/<YYYY-MM-DD>-hotfix-consolidation.md`:

```
## Hotfix Consolidation

- <file> — still-holds | promote | regressed — <half-line evidence>

### Priority debt
- <file> — <reproduction below real | status: partial | halted(<condition>)> — <next step>

### Deviations / deferred
- <file> — <the entry>

### Promote stubs
- <file> → gen-spec entry stub: <the permanent behavior, in 1–2 lines>

### Incremental Prompt Pack
A focused pack covering only the regressed docs.
```

Sections with nothing to list are omitted.

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
