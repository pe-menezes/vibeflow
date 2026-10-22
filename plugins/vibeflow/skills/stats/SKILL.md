---
name: stats
description: >
  Compiles statistics from audit reports: PASS/PARTIAL/FAIL rates, most violated
  patterns, most failing DoD checks, and quality trends over time. Output is
  chat-only (no file created). Use after running several audits to spot quality
  patterns and improvement areas.
allowed-tools: Read, Grep, Glob, Bash(node:*)
---

## Description and examples

**What it does:** Scans `.vibeflow/audits/`, aggregates verdicts (PASS/PARTIAL/FAIL), which patterns are most often violated, and which DoD checks fail most. When `.vibeflow/loop/` holds loop ledgers, it adds the loop's own numbers: rounds, fix rounds, first-audit PASS, the clock from dispatch to PASS, and findings by severity and cause. Output is in the chat only (no file). Use after you have at least a few audits.

**Examples:**
- `stats` — No arguments; reports summary of all audits in `.vibeflow/audits/`.

---

## Language

Detect the language of the user's conversation context.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Compile and report statistics from audit reports.

## Steps

1. Read every `.md` file in `.vibeflow/audits/`. If there are none and
   `.vibeflow/loop/` holds no ledger (a `.md` file there other than
   `config.md`, step 3), report
   "No audits found. Run `audit` after implementing a feature."
   and stop.

2. From each audit take the verdict (the `**Verdict:**` line), the `[x]`/`[ ]`
   counts under `### DoD Checklist`, the patterns marked `[ ]` under
   `### Pattern Compliance`, and the items under `### Convention Violations`.
   A file in a different shape contributes what it can, noted as
   "Non-standard format detected in <file>."
   A report with `**Verdict: pending**` is an audit in progress or
   interrupted: count it apart, as "N audits in progress or interrupted",
   and leave it out of every other count in this report: Audits analyzed,
   the PASS, PARTIAL and FAIL counts and their percentages, the DoD, pattern
   and convention counts, the Trend, and the finding, `closed-by-probe` and
   `Independence:` counts of step 3.

3. The ledgers are the `.md` files in `.vibeflow/loop/` other than
   `config.md`, which holds the loop's settings and is not a ledger. When
   there is at least one ledger, build the Loop section; with none, leave the
   section out, since the loop is opt-in.
   * Run `node ${CLAUDE_SKILL_DIR}/../implement/loop/scripts/loop-stats.mjs <project root> --json`
     (in Codex, the same path relative to the directory of this SKILL.md).
     Its parts, totals and warnings are the loop numbers: report them as
     they come rather than recounting the rounds tables, because the script
     skips a malformed row instead of guessing it. Exit 64 means it could not
     run; quote its message and leave the numbers out.
   * When the command still shows `${CLAUDE_SKILL_DIR}` literally, or its
     path starts at `/../`, look at the host. In Codex the variable is never
     substituted: resolve the kit path relative to the directory of this
     SKILL.md and run the command again. In Claude Code the variable was not
     substituted (Claude Code older than 2.1.69): say that updating Claude
     Code fixes it, rather than updating the plugin, and report the rest.
   * Otherwise, when the script is missing (`node` answers "Cannot find
     module" for it on a normal absolute path), the loop kit is not
     installed: say that updating the Vibeflow plugin installs it, and
     report the rest.
   * From the audit reports, count the finding lines
     (`- [<id>] <severity> · <cause> · confidence ...`) by severity
     (`defect`, `risk-gap`, `low`) and by cause (`spec`, `implementation`,
     `proof`, `fix`), the findings marked `closed-by-probe`, and the reports
     by their `Independence:` line (`fresh session` against `same session`).
     Reports written before these fields existed stay out of these counts.

4. Report in the chat in ~20-30 lines, plus up to 15 for the Loop section,
   in this format — this command writes nothing to disk. Skip Trend with
   fewer than 3 audits; when no pattern was violated, write "No pattern
   violations." List at most 10 parts in the Loop section, the ones with
   the most fix rounds first.

```
## Vibeflow Stats

**Audits analyzed:** N
<N audits in progress or interrupted, when there are any>

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

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
