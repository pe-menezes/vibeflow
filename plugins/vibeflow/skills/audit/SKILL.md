---
name: audit
description: >
  Audits recent work against its Definition of Done and project patterns, from
  a review package of the diff. Runs the test suite, compares code against the
  spec, tests scenarios, sabotages risk code, and reports PASS / PARTIAL / FAIL
  with a severity and a cause on every finding. Also runs the Critical Gate — a
  safety scan of the diff for destructive or dangerous operations. Generates an
  incremental prompt pack for any gaps found. With --reaudit, checks a fix
  round against its own diff; with --consolidate-hotfixes, reclassifies hotfix
  trace docs against the current code. Use after implementation to verify
  quality before shipping.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

## Description and examples

**What it does:** Finds the spec (in `.vibeflow/specs/` or by path), reads the change from a review package, checks each DoD item and pattern compliance, runs the project's test suite, tests scenarios and sabotages risk code (by hand, with `--probes`), and reports PASS / PARTIAL / FAIL. If tests fail, the result is FAIL regardless of DoD. It works best in a session that did not implement the work.

**Examples:**
- `audit .vibeflow/specs/login-flow.md` — Audit implementation against the login-flow spec.
- `audit login-flow` — Same; the agent looks up the spec by feature name.
- `audit login-flow --package .vibeflow/reviews/login-flow-round-0.md` — Audit from a review package already written.
- `audit login-flow --reaudit <round-commit>` — Re-audit the fix made after the round commit.
- `audit login-flow --probes` — By hand, also write the probe file and run the sabotage.

---

## Language

Detect the language of the user's current request or conversation.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.
The report's machine-read labels stay literally in English in any output
language, because `watch-round.mjs`, `stats` and the smoke harness match them:
the header labels and their fixed values (`Independence`, `Round`, `Stage`,
`final`, `Review package`, `Base`, `Verdict` with `pending`, PASS, PARTIAL and
FAIL), the `###` headings of the report, and the severity, cause and
`closed-by-probe` tokens of a finding line.

Audit the implementation identified in the user's current request.

## Independence and the loop kit

Record `Independence: fresh session` when this session did not do the work (a
subagent or a new session dispatched to audit), and `Independence: same
session` when it runs where the work was done or the host has no fresh session
to offer. `Independence: same session` is recorded instead of refusing, and the
audit runs the same way; the reader weighs it, because a session that did not
see the work finds what the implementer missed.

The loop kit lives at `${CLAUDE_SKILL_DIR}/../implement/loop/` (in Codex and
Hermes, the same path relative to the directory of this SKILL.md). This command
uses two of its scripts, `review-package.mjs` and `check-probes.mjs`. When the
folder is missing, the kit is not installed: updating the Vibeflow plugin
installs it, and each step below says how the audit runs without it.

## Steps

With `--consolidate-hotfixes` in the input, the round's target is
`.vibeflow/hotfixes/` instead of a spec — jump to Consolidation mode below.
With `--reaudit <round-commit>`, follow Re-audit mode below.
A standalone audit (no loop briefing) writes the probe file and sabotages only
with `--probes`, so an audit run by hand writes only under `.vibeflow/`; a loop
part (briefing present) runs both as written (steps 6 and 7).

The audit runs in seven stages, named in the steps. Save the report to
`.vibeflow/audits/<feature-slug>-audit.md` (in a loop part, the path its
briefing names, `<feature>-<part>-audit.md`; create the directory if needed).
Write it at the first stage and rewrite the report at the end of every stage
with `Stage: <k>/7 <name>` and `**Verdict: pending**` until the last write, so
a partial report never reads as a finished one and a retry knows what a dead
attempt left. The last write sets `Stage: final` and the verdict; when the
audit stops early, that stop is the last write. When a report that a dead
attempt left is already at that path, restore every sabotage it records as in
progress (step 6) before anything else, from its copy, comparing the hash.
When the copy is gone (a restart empties the temporary folder), read the
file's version in git with `git show HEAD:<path>` and compare its hash with
the hash the report recorded before writing anything: only when they match,
write that version over the file. When the hash does not match, leave the
file as it is, stop, and tell the user which file is still sabotaged and
which change to undo, as its in-progress line in the report names them.
Once a file is restored and its hash checked, from the copy or from git,
delete its copy; once every sabotage the dead attempt left in progress is
restored, delete its temporary folder, as step 6 does after its last
restore.

1. **Review package** (`1/7 package`). The audit reads the change from one
   file, so the Critical Gate and the review judge the same diff. Build or
   read it before the report's first write, so the report is never part of
   the change.
   - `--package <path>` given: read that file; `Base:` is the base it names.
   - Otherwise build it into `.vibeflow/reviews/<feature-slug>-round-0.md`
     (in a loop part, the path its briefing names), after checking
     `node --version`, because the kit needs Node.js 18 or newer:
     `node ${CLAUDE_SKILL_DIR}/../implement/loop/scripts/review-package.mjs <project root> <base> <out>`,
     with the base `--base <ref>` when given, otherwise the merge-base with
     the default branch (`main`/`master`), or `HEAD` for uncommitted work on
     the default branch. The script leaves the loop's own artifact folders
     under `.vibeflow/` (`loop/`, `briefings/`, `progress/`, `reviews/`,
     `audits/`) out of the package and counts them at its top: they never
     count as a change. Neither does the rest of `.vibeflow/` (specs, PRDs,
     the knowledge base), which the package shows as context when something
     changed outside it. A change only under `.vibeflow/` is an EMPTY
     PACKAGE, so work committed on the default branch plus a new spec left
     untracked takes the committed-work case below. Exit 1 reads as empty
     only when the file it wrote carries the EMPTY PACKAGE marker; exit 2, or
     any other failure (exit 1 without the marker, 127 when `node` is
     missing), is an error, not a verdict: quote it as an error and fix the
     base, the path or the install, except for the unsubstituted variable of
     the next case.
   - A command that still shows `${CLAUDE_SKILL_DIR}` literally, or a kit
     path that starts at `/../`, means the variable was not substituted.
     In Codex and Hermes the variable is never substituted: resolve the kit
     path relative to the directory of this SKILL.md and run the command again.
     In Claude Code before 2.1.69, or a host that does not know the variable,
     the kit counts as not installed, not as an error to fix. Record
     `Review package: none (kit not installed)` with the hint to update
     Claude Code to 2.1.69 or newer, and go on as the next case says. With
     the path resolved, `node` answering "Cannot find module" for the kit's
     script means the kit folder is missing: record the same
     `Review package: none (kit not installed)`, with the install hint above.
     Any other exit 1 without the marker stays an error.
   - Kit not installed, or `node --version` shows no Node 18 or newer:
     compute the diff as before — `git diff HEAD` for uncommitted work,
     `git diff <base>...HEAD` for a branch, leaving the same artifact folders
     out and reading a change only under `.vibeflow/` as no change — and
     record `Review package: none (kit not installed)` with the
     install hint above, or `Review package: none (Node.js 18+ not found)`
     with what to install (Node.js 18 or newer, from nodejs.org or the
     host's package manager).
   - A standalone audit (no loop part, no `--package`, no `--base`) whose
     default diff is empty because the work is already committed on the
     default branch runs over the code as before: it records
     `Review package: none (no uncommitted or branch change; --base <ref> audits committed work)`,
     reviews the files the spec names, and its Critical Gate section says
     that no diff was scanned.
   - An empty package — the script exits 1 and the file says EMPTY PACKAGE,
     or the given package or the computed diff shows no change — in every
     other case, where a change is expected (a loop part, a given
     `--package`, a given `--base <ref>`, a re-audit), ends the audit with
     `**Verdict: FAIL**` and the reason "nothing to audit", never PASS: an
     audit over no change has proven nothing.
2. **Spec** (`2/7 spec`). Find the spec — in `.vibeflow/specs/` or at the
   given path — and extract its Definition of Done and the `Risk code:` line
   under `## Risks`. Read `.vibeflow/conventions.md` and the pattern docs the
   spec lists under Applicable Patterns. If it lists none, resolve them: read
   the `## Pattern Registry` block in `index.md` (between
   `<!-- vibeflow:patterns:start/end -->` markers) and cross-reference its
   tags and modules against the spec's scope — top 3–5 matches; with no
   registry, infer which are relevant. Read the files the package changes and
   the ones the spec says should change.
3. **Tests** (`3/7 tests`). Run the tests. Prefer commands listed in the spec;
   otherwise detect the project's runner from the stack (`.vibeflow/index.md`,
   then test scripts in package.json, pyproject.toml, Cargo.toml, go.mod, and
   equivalents).
   - Tests fail → the verdict is FAIL and auditing stops; the incremental
     prompt pack targets the failures first.
   - No runner found → warn "No test runner detected. Verify that tests
     were run manually." and continue.
4. **Critical Gate — destructive-op safety scan** (`4/7 critical-gate`).
   A deterministic safety net for dangerous changes the DoD never mentions —
   security regressions and destructive operations that are side effects,
   not features. Not a style check.

   a. **Read the diff from the review package** (step 1) — added and removed
      lines are both required, because the highest-value rules detect
      *removed* protections. When the package carries a `TRUNCATED` or
      `WITHHELD` list at its top, it left those file diffs out (over its size
      cap, or with a line that looks like a secret): read each listed file
      with git before matching the catalog — `git diff <base> -- <path>`
      (`<base>` is the package's base) for a tracked file, the file itself
      for an untracked one (the package's `## New files` names those) — and
      match its lines as if they were in the package. The `### Critical Gate`
      section then carries the line
      `Left out of the package: <n> file(s), read with git`, or
      `Left out of the package: none` when the package has no such list.
      A line from a file listed under `WITHHELD` is cited, in the report and
      in its prompt pack, by its path, its line number and the rule it
      matched, never by its text: the report lives in `.vibeflow/audits/`, a
      folder the project may commit. The same goes for what the package took
      out of its header: a commit it shows without a subject is cited by its
      short hash, never by its subject, and a path it took out is cited by
      the package section where the note in its place appears, never by its
      name. A line of a file whose path the package took out is cited by the
      package section where the note on that path appears and by its line
      number, never by its path.
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

5. **Review** (`5/7 review`). Audit three things:

   **A. DoD compliance** — each DoD check is PASS or FAIL, with evidence.

   **B. Pattern compliance** — for each applicable pattern: is it followed
   (evidence), are conventions respected (naming, file organization, error
   handling), and are deviations justified or mistakes?

   **C. Scenarios** — read the code and test scenarios: the edge cases, error
   paths and inputs the DoD implies. Each tested scenario becomes a probe case
   (step 7), whether it held or found a defect. Real defects come from reading
   code and testing scenarios; mutation mostly finds weak tests of correct
   code.

   Report every finding, including ones you are uncertain about or consider
   low-severity, each as a finding line (Findings below). Do not filter for
   importance at the finding stage — filtering happens at the verdict, where
   severity and cause decide what blocks and what becomes a follow-up.

6. **Sabotage, only in risk code** (`6/7 sabotage`). A standalone audit
   without `--probes` records `Sabotage: skipped (standalone audit; --probes runs it)`
   under `### Sabotage` and skips the stage. Risk code is money and
   totals, credentials and permissions, deleting or overwriting data, date and
   time boundaries. Sabotage the paths on the spec's `Risk code:` line; with
   no `Risk code:` line, classify the changed code under the four categories
   yourself and say so in the report. A `Risk code: none` line is accepted but
   checked: when the diff touches code in the four categories, report a
   `spec`-cause finding for the missed risk code and sabotage there anyway.
   Where the project has a mutation tool (Stryker, mutmut, cargo-mutants), it
   runs first on the changed lines, and hand sabotage covers what it cannot
   express (SQL inside a string, a constant from another file, a domain rule).
   - Each sabotage is a small wrong change that a sound suite should catch,
     undone from a copy verified by hash: copy the file, record its hash,
     restore from the copy and compare. The copy goes to a temporary folder
     created for this audit outside the project (`mktemp -d` on macOS and
     Linux, a new folder under the user's `TEMP` folder on Windows), never to
     `.vibeflow/` or any other folder of the project, so no `git add` reaches
     it. `git checkout`, `git restore`, `git stash` and `git reset` are
     forbidden while work is uncommitted, because they throw away the
     implementer's work.
   - Before applying a sabotage, write it into the report under
     `### Sabotage` as in progress: the file and line, the wrong change, the
     path of its copy in that temporary folder, and the copy's hash. Once the
     restored file matches the hash, mark it restored and delete its copy;
     after the last restore, delete the temporary folder, and the report says
     both were deleted.
     With `--probes`, a standalone audit
     sabotages only files without uncommitted changes and lists the others as
     not sabotaged, with the reason: for those, an interrupted sabotage would
     leave nothing in git to fall back on.
   - Each sabotage runs only the tests of that code; the full suite runs once
     at the end, after the last restore.
   - A survivor is a proof gap: a `risk-gap` finding, unless your probe closes
     it. List every sabotage and every survivor under `### Sabotage`; with no
     risk code in the diff, say so and skip the stage.

7. **Probes** (`7/7 probes`). Behavior probes go to
   `<test dir>/audit/<feature>-<part>.test.<ext>` (a standalone audit uses its
   feature slug for `<feature>-<part>`), following the project's test
   conventions, pinned by content: each asserts a behavior through the code's
   interface. A probe that reproduces an open finding carries the test
   framework's expected-failure marker naming the finding (`todo` in
   node:test, `xfail` in pytest, `test.failing` in Jest), so an audit never
   turns the project's suite red; the fix that closes the finding removes the
   marker. In the report, each probe answers the contract it protects, the
   plausible regression that breaks it and why the implementer's tests miss
   it; a probe without the three answers stays in the report. A state probe —
   one that pins the repository instead of a behavior: a diff against the
   base, today's version, a doc sentence, a line number, the real clock —
   stays in the report as a check you ran, never in the test directory. A
   standalone audit without `--probes` writes no probe file and skips the check
   below: it lists under `### Probes` the probe cases it would write, as code.
   - Run the probe file, then
     `node ${CLAUDE_SKILL_DIR}/../implement/loop/scripts/check-probes.mjs <project root> --base <base> --dir <probe dir>`
     before the final stage, with `<probe dir>` the folder the probe file
     went to; the report states how many probe files it read, from its
     summary line. Its exit 1 means suspects only when that summary lists
     them; any other exit is an error, quoted as such. Each suspect leaves
     the test directory or is rewritten to pin behavior. Without the kit,
     check the probe file against the state list above by reading it.
   - When earlier audit probes exist for the same module, list the old audit
     probes that duplicate implementer tests or pin state under `### Probes`,
     recommended for removal, each with the reason.

8. When `.vibeflow/hotfixes/` holds hotfix docs, close the report with one
   line — `N hotfix docs not yet consolidated` — and point at
   `audit --consolidate-hotfixes`. No consolidation state is
   tracked: every doc present counts. Directory absent or empty → no line.

## Findings

Every finding is one line:

`- [<id>] <severity> · <cause> · confidence <high|medium|low> — <what> — evidence: <file:line or failing test> — probe: <path::case | report only>`

- Severity: `defect` (wrong behavior), `risk-gap` (code right, proof missing,
  in risk code), `low` (anything else).
- Cause: `spec` (the spec did not foresee it or foresaw it wrong),
  `implementation` (the spec asked, the code did not do it), `proof` (code
  right, test missing or weak), `fix` (introduced by an earlier fix round of
  the same part).
- Covered gap: a proof gap that the auditor's own probe already closes, with
  the probe entering the suite with its three pruning answers, is reported as
  `closed-by-probe` and does not hold the verdict by itself.
- A line from a file listed under `WITHHELD` is cited, in the report and in
  its prompt pack, by its path, its line number and the rule it matched, never
  by its text: the report lives in `.vibeflow/audits/`, a folder the project
  may commit. The same goes for what the package took out of its header: a
  commit it shows without a subject is cited by its short hash, never by its
  subject, and a path it took out is cited by the package section where the
  note in its place appears, never by its name. A line of a file whose path
  the package took out is cited by the package section where the note on that
  path appears and by its line number, never by its path.

## Output format

```
## Audit Report: <feature>

Independence: fresh session | same session
Round: audit | reaudit <n>
Stage: <k>/<total> <name> | final
Review package: <path> | none (<reason>)
Base: <sha>

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
Left out of the package: <n> file(s), read with git | none
- 🔴 CRITICAL [DS102] db/migrate/003.sql:12 — DROP TABLE in migration (blocks)
- 🟠 HIGH [SEC101] api/auth.ts:1 — auth middleware removed (blocks)
- 🟡 WARNING [CFG102] config/app.yml:4 — debug mode enabled
- ✅ ALLOWED [DS104] db/migrate/004.sql:7 — DROP COLUMN — override: "documented in spec"
(or "Clean — no destructive operations detected.", or "No diff scanned — <why>." when step 1 ran over the code)

### Findings
- [F1] defect · implementation · confidence high — total ignores the discount — evidence: src/cart.ts:42 — probe: tests/audit/cart-p1.test.ts::discount enters the total
(or "No findings.")

### Sabotage
- <file:line> — <the wrong change> — killed by <test> | survived → <finding id>
- <file:line> — in progress — <the wrong change> — copy: <temporary folder>/<copy> — sha256 <hash> (until restored)
Copies: deleted, with their temporary folder
- <file> — not sabotaged — <reason>
Sabotage: skipped (standalone audit; --probes runs it)
(or "No risk code in the diff.", with how it was classified)

### Probes
- <path::case> — contract: <...> — regression: <...> — missed by the implementer's tests because: <...>
- would write (standalone, no `--probes`): <path::case>, then the test as a code block and its three answers
- state check (report only): <what was checked> — <result>
- old probe recommended for removal: <path::case> — <duplicates <test> | pins state>

### Follow-ups
- <low finding id> — <the follow-up item>

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

Match the length of the report to what the audit found: sections with nothing
to list say so in one line.

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
- An open `defect` or `risk-gap` keeps the verdict below PASS. A `low`
  finding goes to `### Follow-ups` and does not block.
- A `spec`-cause finding goes to the human or to a recorded spec amendment,
  never straight to a fix: the incremental prompt pack carries it as a
  question, not a task.

Update `.vibeflow/decisions.md` when the audit surfaced architectural
decisions or new pitfalls.

Report the verdict and suggest next steps:
- PASS: "Ready to ship."
- PARTIAL/FAIL: "See the incremental prompt pack in the audit report.
  Fix the gaps and run `audit` again."

## Re-audit mode — `--reaudit <round-commit>`

A re-audit checks one fix round against the audit it answers and reads the fix
diff only: re-doing the whole audit costs more than the audit did and judges
code the fix never touched. Here `<n>` is the fix round (the briefing's number;
standalone, one more than the re-audit reports already there).

1. Read the audit report, its open findings and, when there is one, the fix
   round's section of the progress file.
2. Build the package from the round commit, so it holds the fix diff only:
   `node ${CLAUDE_SKILL_DIR}/../implement/loop/scripts/review-package.mjs <project root> <round-commit> <out>`,
   into `.vibeflow/reviews/<feature>-<part>-round-<n>.md`. Without the kit or
   Node.js 18+, `git diff <round-commit>` stands in for it. The empty-package rule of
   step 1 applies.
3. Run the suite and the audit's probes; a failing test is FAIL, as in a full
   audit. The Critical Gate runs on the fix diff.
4. The re-audit closes or keeps each open finding with its proof (the test,
   the sabotage that now dies, the line), and looks for new defects in the fix
   diff only, with cause `fix` when the fix introduced them. It appends its
   new probes to the audit's probe file. A standalone re-audit follows the
   `--probes` rule of a standalone audit.
5. Do a full audit only when the fix left the findings' scope, saying why
   (it changed code no finding pointed at).

Save the report as `<feature>-<part>-reaudit-<n>.md` in `.vibeflow/audits/`
(a standalone audit: `<feature-slug>-reaudit-<n>.md`), with `Round: reaudit <n>`,
the same header, the stage rule with four stages (`1/4 package`, `2/4 tests`,
`3/4 findings`, `4/4 new defects`) and the same verdict rules.

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
