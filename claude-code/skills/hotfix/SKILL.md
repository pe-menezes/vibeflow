---
name: hotfix
description: >
  Fixes an observed defect with reproducible evidence in one call: writes a
  short trace doc before touching code, implements the fix, and backs it with
  a regression test written before the fix. Production
  incidents are the motivating case, not a gate. When blocked, it halts by
  name and saves the doc for a later call to resume. Use when a defect has
  concrete evidence and you need the fix with its paper trail now — planned
  small tasks belong to quick, spec'd features to implement.
argument-hint: "<symptom + evidence | path to halted doc>"
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

## Description and examples

**What it does:** In one call, produces a short trace doc in `.vibeflow/hotfixes/` and implements the fix, born with a regression test that failed before it. Exactly two outcomes: done or a named HALT that saves the doc and hands the next step to a human. Done carries the doc, the fix, and the regression test — red→green when the host runs tests; when it cannot, the doc declares `verification: not-run` and the status locks at `partial`. The discriminator against the other commands is evidence — an observed defect you can show, wherever it surfaced.

**Examples:**
- `/vibeflow:hotfix` — after a bug was investigated in this conversation; inherits symptom and hypothesis from the session (`origin: session`).
- `/vibeflow:hotfix login returns 500 for emails with "+"; stack trace below` — symptom + evidence in the prompt, headless/CI included (`origin: prompt`).
- `/vibeflow:hotfix harness caught: audit stamps PASS on an empty diff — log attached` — evidence produced by someone else: a review finding, a harness failure, a user report (`origin: third-party`).
- `/vibeflow:hotfix .vibeflow/hotfixes/2026-08-16-saldo-zero.md` — resume a halted doc from where it stopped (`origin: resumed`).

---

## Language

Detect the language of the user's input ($ARGUMENTS or conversation).
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.
One exception: the trace doc's section names, field names, and vocabulary
values stay literally in English in any output language — resuming and
consolidation match them exactly.

Fix the observed defect: $ARGUMENTS

## The one-call contract

You are a coding agent on a live defect: the evidence decides, you execute
and record. One invocation, exactly two structured outcomes — **done** or a
named **HALT**. No mandatory questions in between: a question you would need
answered becomes the HALT that motivates it, with the doc saved and the
question recorded as the human's next step. Degradation is declared, not
silent — a host that cannot run tests writes `verification: not-run` in the
doc and the status locks at `partial`.

## The trace doc

`.vibeflow/hotfixes/<YYYY-MM-DD>-<slug>.md` — one file per bug; create the
directory if it doesn't exist. Written in two moments: Time 1 before any code
edit, Time 2 after the fix. Two rules make it auditable:

- `Symptom` is immutable once written. It exists before the fix, so the fix
  cannot rationalize it after the fact.
- `Eliminated / Evidence` and `Deviations` are append-only.

```markdown
# Hotfix: <slug>

origin: session | prompt | third-party | resumed
status: verified | partial | halted(<condition>)

## Symptom
<the observed behavior, with the real data — immutable once written>

## Checkpoint
hypothesis: <current explanation — overwrite when evidence changes it>
falsification_test: <the observation that would prove the hypothesis wrong>
blind_spots: <what the hypothesis does not explain, or was not checked>

## Preservation
- <1–3 properties the system SHALL CONTINUE TO satisfy after the fix>

## Eliminated / Evidence
<materializes only when hypothesis 1 fails; append: hypothesis — the evidence that killed it>

## Root cause
<the defect, located>

## Fix
files_changed: <paths>
<what changed and why it closes the cause>

## DoD
- [ ] <2–4 binary checks>

## Regression
WHEN <trigger, with the data> THEN <expected behavior>
test: <path of the test in the project's suite — written at the red proof>
oracle_type: specified | derived | metamorphic | implicit
reproduction: real | synthetic | none
verification: red-green | not-run

## Deviations
<append-only: what diverged from the assessment, and why>
```

The regression test lives in the project's suite; the doc carries the
scenario in prose plus the test's path. Real data enters minimized — keep the
property that triggers the bug, strip identifiers, record the transformation
in the doc. Match the doc's length to the bug: cover the substance, no
filler.

## Time 1 — before touching code

Route by where the evidence comes from:

- `session` — the bug was investigated in this conversation. Transcribe,
  don't re-investigate: `Symptom` carries the data already observed,
  `hypothesis` what the session established. The only new work before the
  fix is the red proof — it is the audit of the informal investigation.
- `prompt` / `third-party` — symptom and evidence arrive in the input
  (headless/CI, a review finding, a harness failure, a user report).
  Investigate inside the call, on a sliding scale: write the `Checkpoint`,
  revise `hypothesis` as evidence lands, and open `Eliminated / Evidence`
  only when hypothesis 1 fails — the happy path stays light.
- `resumed` — the input is a `halted(...)` doc. Set `origin: resumed` and
  continue from where it stopped; `Symptom` stays as written and
  `Eliminated / Evidence` keeps its history.

No observable symptom with evidence → HALT `unclear-symptom`.

**The red proof.** With Time 1 written, add the regression test to the
project's suite and run it: it must fail on the current code, for the reason
the hypothesis names. A test that cannot be made to fail means the
investigation was wrong → HALT `cannot-reproduce`, with the fix code still
untouched. Failing before the fix is what makes the test an oracle — written
after, it can only agree with the fix. The moment it proves red, record its
path in the doc's `test:` field — a HALT past this point then carries where
the red test lives. A host with no way to run the test writes it anyway — it
enters the repo as the oracle for whoever can run it — and declares
`verification: not-run` in the doc, locking the status at `partial`.
`cannot-reproduce` stays reserved for a test that runs and comes back green,
or cannot be constructed at all — not for a test the host was unable to
execute.

## The fix

With the red test in place, fix. Hard limits:

- The root cause turns out to live outside the repo → HALT
  `cause-outside-repo`.
- The fix would need more than 2 code files — test and doc don't count →
  HALT `exceeds-hotfix-budget`.
- The fix would require an operation the audit skill's Rules Catalog flags
  at a blocking severity (the ones its verdict map turns into FAIL), whether
  foreseen in the plan or caught in the final diff scan → HALT
  `critical-gate`. The catalog is reused by reference; none of its rules are
  restated here.
- One call, one bug. A collateral finding is not fixed here — record it in
  `Deviations` as deferred.

A failed attempt — the regression test still red, or a `Preservation`
property broken — kills its hypothesis: append it with the evidence to
`Eliminated / Evidence`, overwrite `hypothesis`, try again. The third failed
attempt → HALT `breaker-tripped`.

## Time 2 — after the fix

Complete the doc: `Root cause`; `Fix` with `files_changed`; `DoD` with 2–4
binary checks; `Regression` around the `test:` path recorded at the red
proof — the WHEN/THEN scenario, `oracle_type`, `reproduction`,
`verification`; `Deviations` for anything that diverged from the
assessment. Then verify:

1. The regression test passes — red→green.
2. The project's detected test suite is green. Pre-existing failures in code
   you didn't touch are reported, not fixed.
3. The Critical Gate is clean: match the fix's diff against the audit
   skill's Rules Catalog.

Set `status`:

- `verified` — all four hold: `reproduction: real`, red→green, detected
  suite green, Critical Gate clean.
- `partial` — anything less, with the reason visible in the doc:
  `reproduction: synthetic | none`, a suite that is not green, or
  `verification: not-run`.
- `halted(<condition>)` — written by the HALT that stopped the call.

## HALT — the closed set

These six conditions are the whole set; a situation outside them is handled
inside the call, not by inventing a new one.

| Condition | Fires when |
|---|---|
| `unclear-symptom` | no observable symptom with evidence can be stated |
| `cannot-reproduce` | no constructible test fails on the current code — a red proof that comes back green included |
| `cause-outside-repo` | the root cause is outside this repo (third-party, infra) |
| `exceeds-hotfix-budget` | the fix would take more than 2 code files beyond test + doc |
| `critical-gate` | the fix requires an operation the audit skill's Rules Catalog flags as blocking |
| `breaker-tripped` | 3 fix attempts failed |

Every HALT saves the doc with `status: halted(<condition>)` and the next
step for the human. The trace survives even when the fix doesn't; the halted
doc is the resumable state. A HALT that fires after the red proof also
leaves the regression test red in the suite — an intentional oracle that
any other run of the suite reads as a plain failure. The report declares
that state and hands the human the decision: keep the test in place but
skipped or quarantined until resume, or revert it.

## Report

The command commits nothing. Close with:

- The outcome — done, or the HALT with its next step and "resume with
  `/vibeflow:hotfix <doc path>`".
- Doc path, `files_changed`, the test path with its red→green result, suite
  and Critical Gate results, `reproduction`, final `status`.
- The commit instruction: commit fix + test + doc together, one unit.
- Run `git check-ignore -q` on the doc path first. Exit 0 — the doc is
  ignored; default installs gitignore `.vibeflow/` entirely — → add to the
  instruction: `git add -f <doc path>`, or the durable carve-out in the
  Vibeflow block of `.gitignore`: switch `.vibeflow/` to `.vibeflow/*` and
  add `!.vibeflow/hotfixes/` (git does not re-include inside an excluded
  directory). Guidance, not a gate. The check erroring (no git repo) →
  instruct the commit without the note.

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
