# Orchestrator

`implement --loop` makes the invoking session the orchestrator of one feature: it cuts the work into parts, writes each round's briefing, dispatches every round to a fresh session, checks from outside, and keeps the ledger. It does not implement. Phases 0 to 3 of `implement` have already run: the spec is found and validated, the guardrails and the project context are loaded, and the plan exists. The plan becomes the executor's briefing; a spec split into parts gets one briefing per part, run in order.

Paths below are relative to the kit folder the implement command named (`<kit>`): `principles.md`, `briefings.md`, `roles/executor.md`, `roles/auditor.md` and `scripts/`. Rules are cited as "loop principle N" from `principles.md`, which says why each one holds. Every script runs as `node <kit>/scripts/<name>.mjs` and documents its exit codes in `README.md`; an exit of 64 is an error to fix, never a verdict.

## Fresh sessions per host

Every round (executor, fix, auditor, re-auditor) runs in a fresh session that did not see the earlier rounds (loop principles 3 and 5). The session receives the briefing's path and nothing else.

| Host | Executor and fix rounds | Audit and re-audit rounds |
|---|---|---|
| Claude Code | the `vibeflow:executor` subagent | the `vibeflow:auditor` subagent |
| Codex | its native subagent, or a new task, given the briefing path | the same, running the audit workflow |
| Cursor, Copilot | a new chat the user opens, with a one-line instruction the orchestrator writes: "Read `<briefing path>` and follow it." | the same |

On Claude Code, each subagent's description is `<feature> · <part> · <role> · round <n>` (loop principle 9). A host or session that cannot open a fresh session (no subagent tool, a sandbox that refuses it) falls back to the chat the user opens, and says so in one line with the instruction to paste; nothing else in the command breaks. While the user's chat runs, the orchestrator watches the round's file as below.

## Opening

1. The ledger is `.vibeflow/loop/<feature>.md`: state, the rounds table, `Decision:` lines, follow-ups and handoff notes. Create it at the first opening; a later session reads it first and resumes from it.
2. The branch: the feature runs on a feature branch, never the default branch, because rounds are committed there. On the default branch, stop and ask for a branch name; create it only with the user's answer.
3. Read the full `git status` and `git stash list`. Every dirty file and every stash gets an owner in the ledger (this feature, the user, or unknown); an unknown owner is asked about before the first dispatch, because the round commits take paths and a stranger's file must stay out of them.
4. The OK to commit rounds on that branch is asked once per feature, in one line, and recorded in the ledger as a `Decision:` line. `commit-rounds: true` in the front matter of `.vibeflow/loop/config.md` grants it in advance. What the OK changes is under "Round commits".
5. Before long work, `scripts/preflight.mjs --repo <project root> --hours <expected hours>` (add `--power` on a laptop). Exit 2: stop and say what it found. Exit 1: read each attention line and resolve it or record why it does not block. Exit 0: go.

## Executor briefing

1. Write it from the Executor template in `briefings.md` into `.vibeflow/briefings/<feature>-<part>-executor.md`. "Done when" carries every DoD check of the spec and every criterion the auditor will check, the spec's `Risk code:` items included: a part whose briefing carried them passes the first audit far more often.
2. Facts carry the time and the command that measured them (loop principle 1).
3. The anti-scope: each file the part must not touch is decided with `scripts/who-reads.mjs <project root> <file>...` (loop principle 4). A generated file changes only through its generator.
4. Write the auditor briefing now, from the Auditor template, into `.vibeflow/briefings/<feature>-<part>-auditor.md`, with its criteria word for word from the executor's "Done when".
5. Before dispatch, both pass: `scripts/check-briefing.mjs <executor briefing>` and `scripts/check-briefing.mjs <auditor briefing> --pair <executor briefing>`. Exit 2 stops the dispatch; exit 1 is read and fixed, or the reason it stays is written in the ledger.
6. Record the part's base (`git rev-parse HEAD`) in the ledger, add the executor row to the rounds table, and dispatch.

## Watching a round

The end of a round is read from its file's final marker, never from a verdict alone, because a partial report already carries one. Each round appends its own final line as `briefings.md` defines it: `State: final` for the executor and `State: final · fix <round>` for a fix round in the progress file, `Stage: final` in an audit or re-audit report. Markers stay literal in English whatever the output language, because the script reads them.

Run `scripts/watch-round.mjs --file <progress file or report>` in the background where the host allows it, from the moment of dispatch. Exit 0: the marker arrived; confirm the session stopped, then read the file and the session's five lines. Exit 1, silent: check whether the session is waiting on a permission prompt or a question, then whether it died; a session that stopped without an error is ended and its round restarted from the file, after reading what it left in the worktree (loop principle 3). Exit 3: the ceiling passed; report it and stop the part.

The state on the first of the five lines routes the round. `DONE` or `DONE WITH CAVEATS`: the outside check. `NEEDS CONTEXT`: answer from the repository's files, or ask the human when the files do not say, and reopen the round in a fresh session with the answer added to its briefing. `BLOCKED`: stop the part and take it to the human with the progress file.

## Outside check

After every executor or fix round, and before its audit or re-audit (loop principle 5):

1. Read the full `git status` and `git diff --stat <part base>`.
2. Run the suite and the type checker yourself; the executor's score is a claim until then.
3. `scripts/perimeter.mjs <project root> <part base> <briefing globs> .vibeflow/loop/ .vibeflow/briefings/ .vibeflow/progress/ .vibeflow/reviews/ .vibeflow/audits/`. The loop's own artifact folders are passed because they are untracked files of every round when `.vibeflow/` is tracked. Exit 1 names files outside the perimeter: a glob the briefing missed is recorded as a `Decision:` line; anything else goes into the auditor briefing's facts, and the audit judges it.
4. When the change ships an HTTP boundary, check the running build: start the production build and send real requests (authentication both ways, a wrong method, a malformed query).

A red suite or type check sends the round back to a fresh executor session with the failure: the same briefing plus the failing command and its output, continuing from the progress file and ending its own section with the round's marker again. It is another row of the same round in the rounds table (another `executor` row of round 0, or another `fix` row of that fix round), at most once; a second red check stops the part and asks the human. It is not a fix round and calls no `--reaudit`: the audit always reads a round that passed the outside check, and every fix round follows an audit or re-audit report.

## Round commits

Every round is committed on the feature branch once it passes: the executor's or a fix round's files after the outside check, the audit's probe file before any fix, the re-audit's new probes at the end of its round. So the last commit of a part that passes is the next part's base, and the next part's diff holds only its own work.

1. Confirm the current branch is the feature branch recorded in the ledger, never the default branch; on any other branch, stop and ask.
2. Read the full `git status`. The paths are the round's files inside the perimeter, the probe file, and the loop's artifact files when `.vibeflow/` is tracked; a file owned by someone else stays out.
3. `git add -- <paths>`, then `git commit -- <paths>`: a new file is unknown to git until it is added, and naming the paths keeps every other file out. The message is `<feature> part <n>, <role> round <r>`.
4. A hook that refuses the commit stops the part: report it, never commit with `--no-verify`.
5. Record the commit in the ledger. The last commit before a fix round is that round's round commit, the base its re-audit reads.

Without the OK to commit, nothing is committed: the loop runs one part and stops at its first verdict, leaving the work uncommitted for the human, with the report and the ledger.

## Audit

1. `scripts/review-package.mjs <project root> <part base> .vibeflow/reviews/<feature>-<part>-round-0.md`. Exit 1 is an empty package: the executor changed nothing the audit can read, so read its progress file and stop the part. Exit 2 is an error: fix the base or the path.
2. Dispatch the auditor round in a fresh session with the auditor briefing; the audit runs as `audit --package <review package>`, following `roles/auditor.md`. Add the audit row to the rounds table and watch `.vibeflow/audits/<feature>-<part>-audit.md`.
3. Commit the audit's probes as above. PASS ends the part: record it, then the next part from that commit, or the ending. Below PASS opens the fix loop. A report with `Independence: same session` is weighed as such and said so to the user.

## Fix loop

Below PASS, one round at a time:

1. Route each finding. A `spec`-cause finding goes to the human or to a recorded spec amendment (the spec edited and a `Decision:` line) before any fix. A finding that changes scope or product goes to the human first (loop principle 8). A `low` finding becomes a follow-up in the ledger. The rest (`defect` and `risk-gap` with cause `implementation`, `proof` or `fix`) go to the fix round.
2. Write the fix briefing from the Fix template into `.vibeflow/briefings/<feature>-<part>-fix-<r>.md`, from the report that opened the round: the audit report for fix 1, the re-audit report of the previous round (`.vibeflow/audits/<feature>-<part>-reaudit-<r - 1>.md`), where the open findings are, for fix 2. Per finding: fix it and how, or leave it and why. It passes `scripts/check-briefing.mjs <fix briefing>`. Dispatch the executor in a fresh session, add the fix row, and watch the progress file for `State: final · fix <r>`.
3. The outside check runs on the fix round, as above with the round commit in place of the part base and the fix briefing's perimeter, before the re-audit; a round that passes it is committed.
4. Write the re-auditor briefing from the Re-auditor template into `.vibeflow/briefings/<feature>-<part>-reauditor-<r>.md`; it passes `check-briefing.mjs` like every briefing, before the dispatch. Build the package of the fix diff only with `scripts/review-package.mjs <project root> <round commit> .vibeflow/reviews/<feature>-<part>-round-<r>.md`, and dispatch the re-audit in a fresh session, which runs `audit --reaudit <round commit>`. Add the reaudit row, watch `.vibeflow/audits/<feature>-<part>-reaudit-<r>.md`, and commit its new probes when it ends.
5. PASS ends the part. Below PASS loops to step 1 within the ceiling.

The ceiling (loop principle 8): two fix rounds per part. A third needs the human's OK, asked in one line with the orchestrator's declared default, and leaves the moment it is given. The same finding returning for the same cause stops the part before the ceiling and goes to the human with both reports. A round whose session ended above 400k tokens of context (the executor answers `BLOCKED` at that point) stops the part before the next fix, and the part is cut smaller.

## Rounds table

Under the heading `## Rounds` in the ledger, one row per round, written at dispatch and completed at its end (`stats` reads it):

```markdown
## Rounds

| Part | Role | Round | Started | Ended | Verdict |
|---|---|---|---|---|---|
| 1 | executor | 0 | 2026-10-20 09:00 | 2026-10-20 09:40 | - |
| 1 | audit | 0 | 2026-10-20 09:45 | 2026-10-20 10:20 | PARTIAL |
| 1 | fix | 1 | 2026-10-20 10:25 | 2026-10-20 10:50 | - |
| 1 | reaudit | 1 | 2026-10-20 10:55 | 2026-10-20 11:10 | PASS |
```

Role is `executor`, `audit`, `fix` or `reaudit`; Round is `0` for the executor and its audit and the fix number for a fix and its re-audit; times are `YYYY-MM-DD HH:MM` in local time without a zone; an empty Ended is a round in progress; Verdict is `PASS`, `PARTIAL` or `FAIL` for audit rows and `-` for executor and fix rows.

## Orchestrator discipline

* Scope freezes at dispatch: an addition found midway becomes a follow-up in the ledger or a new part with its own audit, never a change slipped into a fix round (loop principle 4).
* Every decision taken for the human is a line in the ledger: `Decision: <what> — why: <reason> — cost if wrong: <cost>`.
* A product finding inside the scope with a declared default follows the default, recorded as a `Decision:` line, when the human is away; only what leaves the scope or cannot be undone waits for the answer.
* At a part boundary, with the orchestrator's own context above 50%, write the handoff in the ledger (part reached, round, base and round commits, open findings, next step) and stop; the next session resumes from the ledger and git.
* The loop never merges, deploys, migrates a shared environment or reads production.

## Ending: company mode

All parts PASS. The ending is a pull request whose body carries the evidence a human reviewer needs to decide in minutes, because in a company the human review is the gate. It needs the OK to commit rounds: without it the loop stopped at its first verdict and never reaches this section.

1. Probes: `check-probes.mjs` over the project root with `--base <default branch>`; a state probe it names leaves the suite, committed like a round, before the PR opens (loop principle 7).
2. The suite in the CI's environment. Read the CI configuration: runner image, runtime version, test command, and how it checks out the code (a checkout without full history, such as `actions/checkout` with no `fetch-depth`, leaves the tests no git history to read). When the dev machine differs from it, run the suite in the CI's environment before the push: for example a container of the CI image with the network off, over a clone as shallow as the CI's checkout. A red run there blocks the push and is a finding for a fix round of the part it belongs to, within that part's ceiling (loop principle 8). When that run is not possible (no container runtime, an image that cannot run locally), the PR body says so and why. A repository with no CI configuration has nothing to match, and the PR body says it has no CI.
3. Draft or ready, by the repository's convention: its pull request template, its CONTRIBUTING file, or the human's answer recorded as a `Decision:` line. With no convention found, ask the human once and record the answer as a `Decision:` line.
4. The body. Fill `pr-body.md` from the ledger, the audit and re-audit reports in `.vibeflow/audits/` and the progress files in `.vibeflow/progress/`, never from memory: a line the files do not support stays out. Write it to `.vibeflow/reviews/<feature>-pr-body.md`, outside `.vibeflow/loop/`, whose files `stats` reads as ledgers.
5. Push the feature branch with `git push -u origin <feature branch>` and open the PR with `gh pr create --base <default branch> --head <feature branch> --body-file .vibeflow/reviews/<feature>-pr-body.md`, adding `--draft` when the convention says draft.
6. The checks. With CI, run `watch-pr.mjs` with `--repo <owner/repo> --pr <number>` in the background. Exit 0: green. Exit 1: read the failing check's log; a failure the change caused is a finding for a fix round as in step 2, and after its re-audit the branch is pushed and watched again. Exit 2: someone closed or merged the PR; report it. Exit 3: the ceiling passed; report it. A repository with no CI skips `watch-pr.mjs`, because on a PR with no check it waits until its ceiling.
7. Give the user the final report: the PR link, each part's verdict, the checks' result from `watch-pr.mjs` (or that the repository has no CI), the `Decision:` lines and the follow-ups, pointing at the ledger. Then stop.

The pull request is the end of the agent's work. The agent never merges, never deploys, never applies a migration to a shared environment and never reads production. Measurement on real data uses a staging environment or anonymized data delivered by the team.
