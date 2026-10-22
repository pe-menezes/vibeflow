# The loop kit

The portable half of the execution loop, shipped inside the `implement` skill so every host reaches it by a path relative to that skill:

* `principles.md`: the nine loop principles, the admission rule for a new friction and the pruning rule for audit probes.
* `briefings.md`: the four briefing templates (executor, fix, auditor, re-auditor) with the artifact paths.
* `scripts/`: the checks that must run every time, as Node scripts.
* `manifest.json`: the kit's file list, relative to this folder.

The commands that use the kit name the script and the moment; this file says what each script does and what its exit code means.

## Scripts

| Script | Loop step | Does | Exit |
|---|---|---|---|
| `preflight.mjs --repo <dir> [--hours <n>] [--probe-url <url>]... [--power] [--no-network]` | before a long dispatch | git state; network (the `origin` host and every `--probe-url`); CI of open PRs; the `pr ending:` line, how the loop can end the PR; effort level; `--power` adds battery, lid and sleep on macOS (details below) | 0 go · 1 attention · 2 stop |
| `who-reads.mjs <repo> <file>...` | before writing an anti-scope | who reads each file the change touches (tests, scripts, generators), and whether the file is generated | 0 nobody · 1 has readers |
| `check-briefing.mjs <file> [--role <r>] [--pair <executor-briefing>]` | before every dispatch | template sections (read from `briefings.md`), facts without time and source, sentences copied from `principles.md`, secrets, length; `--pair`: every auditor criterion also in the executor's "Done when" | 0 ok · 1 attention · 2 stop |
| `perimeter.mjs <dir> <base> <glob>...` | the orchestrator's outside check | what changed since the base (committed, modified, deleted, untracked and not ignored) outside the allowed globs; says so when nothing changed | 0 inside · 1 outside |
| `review-package.mjs <dir> <base> <out> [--max-bytes <n>]` | audit and re-audit | commits, status, stat, diff with 10 lines of context (committed and not) and new files, in one file; lists at the top what it left out (details below) | 0 written · 1 empty · 2 error |
| `check-probes.mjs <repo> [--base <ref>] [--dir <folder>]` | before the PR; pruning | audit probes that pin state: git against a base, today's version, a state sentence, a line number, the real clock, a document's text | 0 clean · 1 suspects |
| `watch-pr.mjs --repo <owner/repo> --pr <n> [--timeout-min <m>]` | after the PR, in the background | waits for the PR's checks and exits, waking the orchestrator; a PR with no check yet keeps waiting | 0 green · 1 failed · 2 closed · 3 ceiling · 64 bad arguments · 69 gh missing or not executable · 77 gh not logged in |
| `watch-round.mjs --file <progress-or-report> [--stale-min <m>] [--timeout-min <m>]` | while a round runs, in the background | watchdog by effect: ends on a final stage marker the file gains during the watch, or with the silence checklist when the file stays unchanged past the limit (details below) | 0 final · 1 silent · 3 ceiling |

`preflight.mjs` in detail:

* Git: the branch is not the default one; dirty files; stashes.
* Network: the host of the `origin` remote plus every `--probe-url`. It stops only when every `--probe-url` given fails. A failing origin host is attention (an http or https push goes through it, an ssh push does not need it), and so is having nothing to probe. No credential from the origin URL is printed.
* CI of open PRs, through `gh` when it is installed and logged in to the origin host.
* `pr ending:` whether `gh` is logged in to the origin host; if not, attention that the loop ends with the branch pushed and the PR body written, for a pull request or merge request opened by hand.
* `CLAUDE_CODE_EFFORT_LEVEL`, only when it is set. `--no-network` skips the probes and every `gh` call.

`review-package.mjs` in detail:

* `WITHHELD`: a file diff (a new file, or the diff of a tracked one) with a line that looks like a secret or credential stays out whole. The list at the top names its path, its size and the first line that matched (in the base, for a removed line). The detector is the one `check-briefing.mjs` stops on, and the console says how many were withheld.
* `TRUNCATED`: file diffs that do not fit under `--max-bytes` (default 400,000) stay out, listed at the top with their size.
* `.vibeflow/`: a change only under `.vibeflow/` is an empty package, and the message counts the `.vibeflow/` paths that changed. The loop's artifact folders there (`loop/`, `briefings/`, `progress/`, `reviews/`, `audits/`) always stay out, counted at the top; the rest of `.vibeflow/` (specs, PRDs, `index.md`, patterns) comes in as context when something changed outside it.
* Whoever reads the package reads each listed file with git before judging.

`watch-round.mjs` in detail: the end signal is a line `Stage: final` (report) or `State: final` (progress file) that the file gains during the watch; a file the watch sees unchanged past `--stale-min` exits with the silence checklist.

Every script also exits 64 when it cannot run: bad arguments, an unreadable file, a path that is not a git repository, an unknown base. The departures:
* `review-package.mjs` exits 2 for every error, because its 2 already means error.
* `preflight.mjs` exits 64 only for bad arguments; a path that is not a git repository is one of its findings and exits 2, stop.
* `watch-pr.mjs` exits 69 at its first read when `gh` is not installed or cannot be executed, and 77 when it is not logged in, each with a line that says what to do, since waiting cannot fix any of them; any other failed read is retried until the ceiling. Its 64 stays for bad arguments only.
* On a Node.js older than 18, every script exits 64 before anything else, `review-package.mjs` and `preflight.mjs` included, and says on stderr that it needs Node.js 18 or later, with the version it found.

Each one answers `--help` with its full usage.

The end of a round is a new final stage marker plus a session that stopped. A verdict line alone is not the end, because a partial report already carries one. A part's progress file keeps the marker of every round it has seen, so each round appends its own section ending with its own marker (`State: final · fix 1` for the first fix round) and never edits an earlier round's marker. `watch-round.mjs` counts the markers when the watch starts and ends only when the count grows; a file rewritten from scratch counts again from what it holds after the rewrite. Its silence clock starts with the watch and restarts at every change it sees, so a file written long before the watch is not silent at the first read.

## Conventions

* Node 18 or later, and only `node:` imports: the kit installs by copying files, with nothing to resolve.
* Every path is an argument; no script depends on the directory it runs from, and the git commands run at the repository's top level.
* Every git child process gets the environment without any `GIT_*` variable, so a script started from a git hook still reads the repository it was given.
* Output is plain text, one finding per line, with errors on stderr.
* Waiting scripts take their limits as flags in minutes (fractions allowed) and never sleep past their ceiling: each wait is cut to the time left, so they exit at the ceiling, not an interval after it.
