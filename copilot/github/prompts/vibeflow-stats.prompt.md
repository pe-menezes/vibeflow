---
name: 'vibeflow-stats'
description: 'Compiles audit statistics: pass/fail rates, most violated patterns, and quality trends.'
agent: 'vibeflow-architect'
---

# Vibeflow: Stats

> format-agnostic, repo-local prompt asset

Show statistics from audit reports. Reads all audits and compiles
pass/fail rates, most violated patterns, and common DoD gaps.

**Usage:** Run this prompt with no input. It reads `.vibeflow/audits/`.

---

## Language

Detect the language of the user's conversation context.
Write ALL output in that same language.
Technical terms in English are acceptable regardless of the detected language.

## Steps

1. Read every `.md` file in `.vibeflow/audits/`. If there are none, report
   "No audits found. Run the vibeflow-audit prompt after implementing a feature."
   and stop.

2. From each audit take the verdict (the `**Verdict:**` line), the `[x]`/`[ ]`
   counts under `### DoD Checklist`, the patterns marked `[ ]` under
   `### Pattern Compliance`, and the items under `### Convention Violations`.
   A file in a different shape contributes what it can, noted as
   "Non-standard format detected in <file>."

3. Report in the chat in ~20-30 lines, in this format — this prompt writes
   nothing to disk. Skip Trend with fewer than 3 audits; when no pattern was
   violated, write "No pattern violations."

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
```
