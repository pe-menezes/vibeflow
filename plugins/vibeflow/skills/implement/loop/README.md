# The loop kit

The portable half of the execution loop, shipped inside the `implement` skill so every host reaches it by a path relative to that skill:

* `principles.md`: the nine loop principles, the admission rule for a new friction and the pruning rule for audit probes.
* `briefings.md`: the four briefing templates (executor, fix, auditor, re-auditor) with the artifact paths.
* `orchestrator.md`: the flow `implement --loop` follows once phases 0 to 3 have run: opening, briefings, fresh sessions per host, the outside check, the audit, the fix loop with its ceiling, the ledger, and the company-mode ending with the pull request.
* `pr-body.md`: the template of the pull request body that ends the loop in company mode, with the file each section is filled from.
* `roles/auditor.md`: the auditor's session discipline, which points at the audit workflow for the procedure; the Claude Code agent `agents/auditor.md` carries the same body.
* `roles/executor.md`: the executor's session discipline for executor and fix rounds; the Claude Code agent `agents/executor.md` carries the same body.
* `scripts/`: the checks that must run every time, as Node scripts.

The commands that use the kit name the script and the moment; this file says what each script does and what its exit code means.

## Scripts

| Script | Loop step | Does | Exit |
|---|---|---|---|
| `preflight.mjs --repo <dir> [--hours <n>] [--power] [--no-network]` | before a long dispatch | git state (branch not default, dirty files, stashes), network, CI of open PRs through `gh` when installed, `CLAUDE_CODE_EFFORT_LEVEL` when set; `--power` adds battery, lid and sleep on macOS | 0 go · 1 attention · 2 stop |
| `who-reads.mjs <repo> <file>...` | before writing an anti-scope | who reads each file the change touches (tests, scripts, generators), and whether the file is generated | 0 nobody · 1 has readers |
| `check-briefing.mjs <file> [--role <r>] [--pair <executor-briefing>]` | before every dispatch | template sections (read from `briefings.md`), facts without time and source, sentences copied from `principles.md`, secrets, length; `--pair`: every auditor criterion also in the executor's "Done when" | 0 ok · 1 attention · 2 stop |
| `perimeter.mjs <dir> <base> <glob>...` | the orchestrator's outside check | what changed since the base (committed, modified, deleted, untracked and not ignored) outside the allowed globs; says so when nothing changed | 0 inside · 1 outside |
| `review-package.mjs <dir> <base> <out> [--max-bytes <n>]` | audit and re-audit | commits, status, stat, diff with 10 lines of context (committed and not) and new files, in one file; names what the size cap left out; leaves the loop's artifact folders under `.vibeflow/` (`loop/`, `briefings/`, `progress/`, `reviews/`, `audits/`) out and counts them, so a package of only those is empty | 0 written · 1 empty · 2 error |
| `check-probes.mjs <repo> [--base <ref>] [--dir <folder>]` | before the PR; pruning | audit probes that pin state: git against a base, today's version, a state sentence, a line number, the real clock, a document's text | 0 clean · 1 suspects |
| `watch-pr.mjs --repo <owner/repo> --pr <n> [--timeout-min <m>]` | after the PR, in the background | waits for the PR's checks and exits, waking the orchestrator; a PR with no check yet keeps waiting | 0 green · 1 failed · 2 closed · 3 ceiling |
| `watch-round.mjs --file <progress-or-report> [--stale-min <m>] [--timeout-min <m>]` | while a round runs, in the background | watchdog by effect: the end signal is a line `Stage: final` (report) or `State: final` (progress file) that the file gains during the watch; a file the watch sees unchanged past the limit exits with the silence checklist | 0 final · 1 silent · 3 ceiling |

Every script also exits 64 when it cannot run (bad arguments, an unreadable file, a path that is not a git repository, an unknown base), with two exceptions. `review-package.mjs` exits 2 for every error, because its 2 already means error. `preflight.mjs` exits 64 only for bad arguments; a path that is not a git repository is one of its findings and exits 2, stop. On a Node.js older than 18, every script exits 64 before anything else, those two included, and says on stderr that it needs Node.js 18 or later, with the version it found. Each one answers `--help` with its full usage.

The end of a round is a new final stage marker plus a session that stopped. A verdict line alone is not the end, because a partial report already carries one. A part's progress file keeps the marker of every round it has seen, so each round appends its own section ending with its own marker (`State: final · fix 1` for the first fix round) and never edits an earlier round's marker. `watch-round.mjs` counts the markers when the watch starts and ends only when the count grows; a file rewritten from scratch counts again from what it holds after the rewrite. Its silence clock starts with the watch and restarts at every change it sees, so a file written long before the watch is not silent at the first read.

## Conventions

* Node 18 or later, and only `node:` imports: the kit installs by copying files, with nothing to resolve.
* Every path is an argument; no script depends on the directory it runs from, and the git commands run at the repository's top level.
* Every git child process gets the environment without any `GIT_*` variable, so a script started from a git hook still reads the repository it was given.
* Output is plain text, one finding per line, with errors on stderr.
* Waiting scripts take their limits as flags in minutes (fractions allowed) and never sleep past their ceiling: each wait is cut to the time left, so they exit at the ceiling, not an interval after it.
