# Briefing templates

One briefing per round, in a file: `.vibeflow/briefings/<feature>-<part>-<role>[-<n>].md`, with the role `executor`, `fix`, `auditor` or `reauditor` in the name and the round number for fix and re-audit rounds. Before the dispatch it passes `scripts/check-briefing.mjs <file>`, which reads the required sections from the templates below, so a section renamed here is renamed for the check too. An auditor briefing also passes `--pair <executor briefing>`: every criterion the auditor will check is in the executor's "Done when".

A briefing points at rules ("loop principle 7", from `principles.md`) and at the project knowledge in `.vibeflow/`; it writes only what belongs to the round. Placeholders are in angle brackets.

## Executor

```markdown
# <feature> · part <n> · executor

## Asked
<what the part delivers, in three to six lines>

## Done when
* <binary criterion; every criterion the auditor will check is on this list>

## Read first
* project knowledge: `.vibeflow/index.md` and the patterns it lists (the map is there; do not re-explore the tree)
* spec: `.vibeflow/specs/<spec file>`
* rules: loop principles 1, 3, 4 and 6
* role: `roles/executor.md` in the loop kit at `<kit folder>` (the Claude Code agent `vibeflow:executor` already carries it)

## Facts
* <fact> (measured HH:MM by `<command>`)
* <lead from a note, a log or another session> (to check: <source>; measure it before use or leave it out)

## Perimeter
* may change: <paths or globs>
* does not change: <paths>, each one decided with `who-reads.mjs`
* generated: only through the generator (`<command>`), never by hand

## Verification contract
* worktree `<path>`, branch `<name>`, test database <port, or none> (credentials come from the worktree's environment, not from this file)
* red before green: <the test that fails on today's code, and why>
* while working: only the affected tests (`<command>`); at the end, once, the full suite and the type checker
* if running tests is denied midway: write without running, say so in the progress file, and the orchestrator runs them at delivery
* off limits: raising a baseline, `skip`, loosening an assertion, a test that compares the real clock, git writes, calling a reviewer of your own

## Ceiling
* context above 400k tokens: stop, write the progress file, return BLOCKED
* a new path found midway becomes an item under "Outside the part" in the progress file, not code

## Progress and delivery
* progress in `.vibeflow/progress/<feature>-<part>.md` at every milestone: what is done, what is missing, each proof command with its result; the last line is `State: final` when the round ends
* reply in five lines: state (DONE, DONE WITH CAVEATS, NEEDS CONTEXT or BLOCKED), files changed, test score, caveats, progress file path
```

## Fix

```markdown
# <feature> · part <n> · fix <round>

## Findings to fix
* <finding id>: fix it this way: <decision>; or leave it, because <reason>
* a probe pinned to form rather than behavior: record it in the progress file, and the re-audit decides

## Read first
* audit report: `.vibeflow/audits/<feature>-<part>-audit.md`; from fix 2 on, also the previous re-audit report, `.vibeflow/audits/<feature>-<part>-reaudit-<round - 1>.md`, where the open findings are
* the part's progress file and `.vibeflow/index.md`
* rules: loop principles 1, 6 and 7
* role: `roles/executor.md` in the loop kit at `<kit folder>` (the Claude Code agent `vibeflow:executor` already carries it)

## Perimeter
* the files of the findings above, nothing else

## Verification contract
* the part's worktree and branch
* each fix comes with a test that fails before it and passes after it; an assumption about real data is measured on real data in this round

## Ceiling
* round <round> of 2; context above 400k tokens: stop and return BLOCKED

## Progress and delivery
* a "Fix <round>" section appended to `.vibeflow/progress/<feature>-<part>.md`, ending with its own line `State: final · fix <round>`; an earlier round's marker is never edited; the executor's five delivery lines
```

## Auditor

```markdown
# <feature> · part <n> · auditor

## What to audit
<the part, its spec and what the executor declared, in three lines>

## Criteria
* <criterion, word for word as in the executor's "Done when">

## Read first
* `.vibeflow/index.md`, the spec, the executor's progress file
* rules: loop principles 5, 6 and 7
* role: `roles/auditor.md` in the loop kit at `<kit folder>` (the Claude Code agent `vibeflow:auditor` already carries it)

## Review package
* `.vibeflow/reviews/<feature>-<part>-round-<n>.md`, written by `review-package.mjs` (commits, status, stat, diff with context, new files)

## Facts
* <fact> (measured HH:MM by `<command>`)

## Risk and sabotage
* risk code of this part: <paths, from the spec's "Risk code:" line, or inferred from the four categories and said so>
* sabotage only there, each undone from a copy checked by hash; each sabotage runs only the tests of its code, and the full suite runs once at the end
* <if the repository has a mutation tool: its report of survivors on the part's lines>

## Probes
* in `<test dir>/audit/<feature>-<part>.test.<ext>`, behavior only, pinned by content, each with the three answers of the pruning rule
* a state probe stays in the report
* <if the part makes an old probe false: permission to rewrite `<file::case>`, by the fact and with equal strength, with before and after in the report>

## Ceiling
* the report is rewritten at every stage with `Stage: <k>/<total> <name>`, so a retry knows what the dead attempt left

## Delivery
* `.vibeflow/audits/<feature>-<part>-audit.md` with the header fields `Independence`, `Round: audit`, `Stage`, `Review package` and `Base`; one finding line per finding (severity, cause, confidence, evidence, probe); the verdict PASS, PARTIAL or FAIL; the line `Stage: final` when done
* fix nothing
```

## Re-auditor

```markdown
# <feature> · part <n> · reauditor <round>

## What to re-audit
* open findings: <finding ids>, and the fix decision for each

## Read first
* the audit report, the fix briefing, the progress file
* rules: loop principles 5 and 7
* role: `roles/auditor.md` in the loop kit at `<kit folder>` (the Claude Code agent `vibeflow:auditor` already carries it)

## Review package
* the fix diff only: `.vibeflow/reviews/<feature>-<part>-round-<n>.md`, written by `review-package.mjs` from the commit of the audited round

## Ceiling
* fresh session; run the suite and the audit's probes and read only the fix diff; a full audit only if the fix left the findings' scope

## Delivery
* `.vibeflow/audits/<feature>-<part>-reaudit-<n>.md` with `Round: reaudit <n>`: each finding closed or still open, with its proof; any new defect in the fix diff; the verdict; the line `Stage: final` when done
```
