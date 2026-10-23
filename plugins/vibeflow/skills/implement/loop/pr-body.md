# PR body

The body of the pull request that ends a loop in company mode (`orchestrator.md`, "Ending: company mode"). The reviewer reads the proof before the diff, so every section is filled from a file the loop wrote, never from memory: the ledger (`.vibeflow/loop/<feature>.md`), the audit and re-audit reports (`.vibeflow/audits/`) and the progress files (`.vibeflow/progress/`). Each section's comment names its source and is deleted when the section is filled. A section with nothing to list says so in one line (`None.`) instead of disappearing, so the reviewer can tell an empty section from a forgotten one. Findings and `Decision:` lines are copied in their own format, word for word.

```markdown
## Summary

<!-- from: the spec and the ledger's state -->
<one paragraph: what the feature does, the spec it implements, the number of parts>

## Verdict per part

<!-- from: the ledger's rounds table and the last audit or re-audit report of each part -->
| Part | Verdict | Rounds | Last report | Round commit |
|---|---|---|---|---|
| <n> | PASS | <audit, fix 1, reaudit 1> | <path> | <sha> |

## Definition of Done

<!-- from: each part's last audit or re-audit report, its DoD Checklist -->
- [x] <part>.<check>: <the check> — evidence: <test, file:line or command and its result>

## Findings

<!-- from: the Findings sections of every audit and re-audit report, and the ledger's follow-ups -->
**Open**
- [<id>] <severity> · <cause> · confidence <level> — <what> — evidence: <...> — probe: <...> (or "None.")

**Closed**
- [<id>] <severity> · <cause> — <what> — closed by <fix round and commit, or closed-by-probe>

**Follow-ups**
- [<id>] low · <cause> — <what> — in the ledger's follow-ups

## Probes

<!-- from: the Probes sections of the reports, and check-probes.mjs before the PR -->
- <path::case> — contract: <...> — regression: <...> — missed by the implementer's tests because: <...>
- removed before the PR: <path::case> — <pins state | duplicates <test>>

## Sabotage

<!-- from: the Sabotage sections of the reports -->
- <file:line> — <the wrong change> — killed by <test> | survived → <finding id and how it was closed>

## Critical Gate

<!-- from: the Critical Gate section of each part's last report -->
- <part>: Critical Gate clean, or each finding with its ID, severity and how it was resolved

## Commands

<!-- from: Suite, Types and Perimeter: the ledger's `Check:` lines, written by each outside check as it ran; CI-environment suite: the ledger's line from step 2 of the ending; PR checks: watch-pr.mjs's output in `-pr-checks.txt` next to this body in `.vibeflow/reviews/`, added with `gh pr edit` after the watch ends with exit 0, 1, 2 or 3; `not watched: opened by hand`: the ledger's `Ending: by hand` line, written with or without an `origin` remote, and nothing edits the PR afterwards; `not watched: watch-pr.mjs exit` and the code: the ledger's `Ending: checks not watched` line, with the code and the error line it carries -->
| Check | Command | Result |
|---|---|---|
| Suite | <command> | <passed / failed / skipped, counts> |
| Types | <command, or "no type checker"> | <result> |
| Perimeter | <perimeter.mjs command> | <exit and files outside> |
| CI-environment suite | <image, network off, clone depth, command> | <result, or not possible: why, or no CI in this repository> |
| PR checks | watch-pr.mjs | <result, or skipped: no CI, or skipped: the CI does not run on this PR, or not watched: watch-pr.mjs exit <code> (<its error line>), or not watched: opened by hand> |

## Decisions

<!-- from: the ledger's Decision: lines, copied word for word -->
- Decision: <what> — why: <reason> — cost if wrong: <cost>

## Follow-ups

<!-- from: the ledger's follow-ups and the reports' Follow-ups sections -->
- <the follow-up work this feature leaves, one item per line>
```
