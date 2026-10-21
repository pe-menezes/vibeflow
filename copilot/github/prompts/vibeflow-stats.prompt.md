---
name: 'vibeflow-stats'
description: 'Compiles audit statistics: pass/fail rates, most violated patterns, and quality trends.'
agent: 'vibeflow-architect'
---

# Vibeflow: Stats

> format-agnostic, repo-local prompt asset

Show statistics from audit reports. Reads all audits and compiles
pass/fail rates, most violated patterns, and common DoD gaps; with loop
ledgers in `.vibeflow/loop/`, also the loop's rounds, fix rounds,
first-audit PASS and clock from dispatch to PASS.

**Usage:** Run this prompt with no input. It reads `.vibeflow/audits/`.

---

## Language

Detect the language of the user's conversation context.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Steps

1. Read every `.md` file in `.vibeflow/audits/`. If there are none and
   `.vibeflow/loop/` holds no ledger (a `.md` file there other than
   `config.md`, step 3), report
   "No audits found. Run the vibeflow-audit prompt after implementing a feature."
   and stop.

2. From each audit take the verdict (the `**Verdict:**` line), the `[x]`/`[ ]`
   counts under `### DoD Checklist`, the patterns marked `[ ]` under
   `### Pattern Compliance`, and the items under `### Convention Violations`.
   A file in a different shape contributes what it can, noted as
   "Non-standard format detected in <file>."

3. The ledgers are the `.md` files in `.vibeflow/loop/` other than
   `config.md`, which holds the loop's settings and is not a ledger. When
   there is at least one ledger, build the Loop section; with none, leave the
   section out, since the loop is opt-in.
   * Run `node .github/vibeflow/loop/scripts/loop-stats.mjs <project root> --json`.
     Its parts, totals and warnings are the loop numbers: report them as
     they come rather than recounting the rounds tables, because the script
     skips a malformed row instead of guessing it. Exit 64 means it could not
     run; quote its message and leave the numbers out.
   * When `.github/vibeflow/loop/` is missing, the loop kit is not installed: say that
     `npx setup-vibeflow@latest --copilot --force` (setup-vibeflow 0.17.0 or
     newer) installs it, and report the rest.
   * From the audit reports, count the finding lines
     (`- [<id>] <severity> · <cause> · confidence ...`) by severity
     (`defect`, `risk-gap`, `low`) and by cause (`spec`, `implementation`,
     `proof`, `fix`), the findings marked `closed-by-probe`, and the reports
     by their `Independence:` line (`fresh session` against `same session`).
     Reports written before these fields existed stay out of these counts.

4. Report in the chat in ~20-30 lines, plus up to 15 for the Loop section,
   in this format — this prompt writes nothing to disk. Skip Trend with
   fewer than 3 audits; when no pattern was violated, write "No pattern
   violations." List at most 10 parts in the Loop section, the ones with
   the most fix rounds first.

```markdown
## Vibeflow Stats

**Audits analyzed:** N

### Verdicts
- PASS: N (X%)
- PARTIAL: N (X%)
- FAIL: N (X%)

### DoD
- Total checks: N
- Pass rate: X%
- Most failing checks:
  1. "<check description>" — failed N times
  2. "<check description>" — failed N times
  3. "<check description>" — failed N times

### Patterns
- Most violated patterns:
  1. <pattern name> — N violations
  2. <pattern name> — N violations
  3. <pattern name> — N violations

### Convention Violations
- Total: N violations across N audits
- Most common: <list top 3 if available>

### Trend
<If ≥3 audits exist, note if quality is improving (more PASS over time),
stable, or degrading. Base on chronological order of audit dates.>

### Loop
- Parts: N from N ledgers
- First-audit PASS: N of N (X%)
- Mean fix rounds: X
- Median clock, dispatch to PASS: XhYYm over N parts
- <feature> · <part>: N rounds, N fix rounds, first audit <verdict>, <clock or "no PASS yet">
- Findings by severity: defect N · risk-gap N · low N
- Findings by cause: spec N · implementation N · proof N · fix N
- Closed by probe: N
- Audits by independence: fresh session N · same session N
- Warnings: <the script's warnings, one per line, or "none">
```
