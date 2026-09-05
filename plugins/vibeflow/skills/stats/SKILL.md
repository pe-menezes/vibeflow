---
name: stats
description: >
  Compiles statistics from audit reports: PASS/PARTIAL/FAIL rates, most violated
  patterns, most failing DoD checks, and quality trends over time. Output is
  chat-only (no file created). Use after running several audits to spot quality
  patterns and improvement areas.
allowed-tools: Read, Grep, Glob
---

## Description and examples

**What it does:** Scans `.vibeflow/audits/`, aggregates verdicts (PASS/PARTIAL/FAIL), which patterns are most often violated, and which DoD checks fail most. Output is in the chat only (no file). Use after you have at least a few audits.

**Examples:**
- `stats` — No arguments; reports summary of all audits in `.vibeflow/audits/`.

---

## Language

Detect the language of the user's conversation context.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

Compile and report statistics from audit reports.

## Steps

1. Read every `.md` file in `.vibeflow/audits/`. If there are none, report
   "No audits found. Run `audit` after implementing a feature."
   and stop.

2. From each audit take the verdict (the `**Verdict:**` line), the `[x]`/`[ ]`
   counts under `### DoD Checklist`, the patterns marked `[ ]` under
   `### Pattern Compliance`, and the items under `### Convention Violations`.
   A file in a different shape contributes what it can, noted as
   "Non-standard format detected in <file>."

3. Report in the chat in ~20-30 lines, in this format — this command writes
   nothing to disk. Skip Trend with fewer than 3 audits; when no pattern was
   violated, write "No pattern violations."

```
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
```

---

## Maintenance

If this command is modified, update `MANUAL.md` to reflect the changes.
