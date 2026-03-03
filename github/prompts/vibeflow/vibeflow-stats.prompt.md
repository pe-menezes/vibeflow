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

1. Check if `.vibeflow/audits/` directory exists and contains `.md` files.
   - If no audits found: report "No audits found. Run the
     vibeflow-audit prompt after implementing a feature." and STOP.

2. Read ALL `.md` files in `.vibeflow/audits/`.

3. For each audit file, extract:
   - **Verdict**: PASS, PARTIAL, or FAIL (from the `**Verdict:**` line)
   - **DoD checks**: count of passed `[x]` and failed `[ ]` checkboxes
     in the `### DoD Checklist` section
   - **Pattern violations**: items marked `[ ]` in the `### Pattern Compliance`
     section, with the pattern name
   - **Convention violations**: items listed in `### Convention Violations`
     section (if present)

4. Compile the statistics and report directly in the chat (do NOT save
   to file). Use this format:

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

5. If there are fewer than 3 audits, skip the "Trend" section.
   If there are no pattern violations, write "No pattern violations."

## Rules

- This prompt is READ-ONLY. It does NOT modify any files.
- Output goes directly to the chat, not to a file.
- Keep the report concise (~20-30 lines).
- If audit files have non-standard format, extract what you can and
  note: "Non-standard format detected in <file>."
