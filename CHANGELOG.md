# Changelog

### Unreleased

The Hermes Agent edition: the same shared plugin, read from a root manifest. The version number, the date and the bump of the three manifests are the maintainer's at release time.

**Added**

- **Hermes Agent edition**: `plugins/vibeflow/plugin.json`, an Agent Plugins v1 manifest at the package root, through which Hermes discovers the ten shared skills by position and ignores `agents/`; it accepts `allowed-tools` in a skill's frontmatter without applying it.
- **Installing on Hermes**: `hermes plugins install pe-menezes/vibeflow/plugins/vibeflow`, then `hermes plugins enable vibeflow` and a new session. The install scan reads the kit README's description of the secret detector as a secret, so `--force` installs; a catalog listing removes the prompt. The skills are asked for in natural language, as in Codex: Hermes has no slash commands for them.
- **The loop on Hermes**: the fresh-sessions table of the orchestrator gains a Hermes row: each round is one `delegate_task` task whose `goal` carries the round's title and points at the briefing, and whose `context` names the role file in the kit. The end of a round is the task's result arriving as a new turn, so the orchestrator ends its turn after the dispatch instead of running `watch-round.mjs`, and a result with no final marker in the round's file restarts the round from the file. When the `delegate_task` call itself returns the result (a session with no later-result consumer, such as a one-shot CLI run or cron), the orchestrator reads it there and goes on instead of ending its turn, which would end the session with the loop stopped at its first round.

**Changed**

- **`audit`, `implement` and `stats` name Hermes beside Codex**: the kit path in the three skills is resolved from the skill's folder "in Codex and Hermes", where `${CLAUDE_SKILL_DIR}` is never substituted; the Claude Code case (update Claude Code, not the plugin) is unchanged.
- **`roles/auditor.md` and `agents/auditor.md`**: the plugin's audit workflow is named for Claude Code, Codex and Hermes.

Measured on Hermes v0.21.5 (2026-10-24): the install and enable commands, the ten skills loading, the kit present inside the installed plugin, and the repository's suite. The loop ran on Hermes to build this edition: four parts, ten rounds (four executor, four audit, one fix, one re-audit; the audit that died on an HTTP 429 from the provider and was dispatched again counts once), parts 1 to 3 PASS at round 0 and part 4 PARTIAL at round 0 and PASS after one fix round, two audit probe files written by the auditors and committed. The part 4 executor could not write `AGENTS.md`, a file name Hermes guards with an approval prompt that timed out, so the orchestrator applied the executor's patches as the fix round. Measured on the same version on 2026-10-26: a `delegate_task` call in a `hermes --oneshot` session returns the child's result in the call itself; the cron case was read in Hermes' code, not run. Not measured: `implement --loop` started by a user in the Hermes chat (here the orchestrator was the agent's main session reading `orchestrator.md` directly), and the 400k-token ceiling under context compression.

### v1.16.0 (2026-10-23)

The execution loop arrives, off by default: without `--loop`, `implement` runs its pipeline as before and specs written before 1.16 stay valid. `gen-spec`, `discover`, `analyze`, `audit` and `stats` also change for a run without the loop; each change is listed under Changed. All 3 editions updated.

Requirement: in Claude Code, the loop and the audit's review package need Claude Code 2.1.69 or newer: `implement`, `audit` and `stats` reach the kit through `${CLAUDE_SKILL_DIR}`, which Claude Code substitutes in a skill's body from that version on. On an older version an `audit` run by hand records `Review package: none (kit not installed)` and computes the diff as before, and both `audit` and `stats` say that updating Claude Code, not the plugin, fixes it.

**Added**

- **`implement --loop`**: the session you call becomes the orchestrator; an executor implements each part in a fresh session, an independent audit checks it in another, and at most two fix rounds follow, each re-audited on its own diff, with a third only on your OK.
- **Turning the loop on**: `loop: true` in `.vibeflow/loop/config.md` for a project, `--no-loop` to turn it off for one run, and one OK per feature (or `commit-rounds: true`) to commit each round on the feature branch; the loop never runs on the default branch.
- **Fresh sessions per host**: the `vibeflow:executor` and `vibeflow:auditor` agents in Claude Code, a native subagent or a new task in Codex, and a new chat you open with the orchestrator's one-line instruction in Cursor and Copilot.
- **Company mode, the loop's ending**: once every part passes, the orchestrator checks the probes, runs the suite in the CI's environment when your machine differs from it (for a CI that tests the pull request's merge commit, the merge is made in a clone with the full history and the suite runs in a clone of that merge as shallow as the CI's checkout, because git refuses the merge inside a shallow clone), pushes the branch, opens the pull request with `gh` (draft or ready by your repository's convention, draft when there is none) and waits for its checks with `watch-pr.mjs`; the agent never merges, deploys, applies a migration to a shared environment or reads production.
- **Company mode reads `watch-pr.mjs` by its exit code**: a 64 means the script refused the call (a bad argument, or a Node.js older than 18), so the orchestrator corrects the call and watches again, once; a 69 (`gh` missing or not executable), a 77 (`gh` not logged in, or GitHub refused its credential) or a second 64 leaves the checks not watched, which the ledger and the final report say, with `gh pr checks <number> --watch` for you to follow them.
- **Company mode needs GitHub and `gh`**: opening the pull request needs a remote on GitHub (or GitHub Enterprise) and `gh auth status` ok for its host; the `pr ending` line of `preflight.mjs` says so before the first dispatch, and without it the loop pushes the branch and writes the body to `.vibeflow/reviews/<feature>-pr-body.md` for you to open the pull request or merge request by hand. The orchestrator gives `watch-pr.mjs` the host of the `origin` remote, `--repo <origin host>/<owner/repo>`, in the same form on github.com and on GitHub Enterprise; the host form was checked only against a fake `gh`, not against a real GitHub Enterprise.
- **How `watch-pr.mjs` counts a check**: by three lists written in the script. Green: `SUCCESS`, `NEUTRAL`, `SKIPPED`. Failed: `FAILURE`, `ERROR`, `TIMED_OUT`, `CANCELLED`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, `STALE`. Pending: `PENDING`, `IN_PROGRESS`, `QUEUED`, `EXPECTED`, `WAITING`, `REQUESTED`. A state in none of them (a check finished with no conclusion, a state the script does not know, a check with no state) is never green: once nothing is pending the watch exits 1 and names the check and its state on the `failed:` line. `NEUTRAL` and `SKIPPED` checks are named on the closing line. The open PRs `preflight.mjs` lists use the same lists, and a check outside the green one is attention, never green.
- **`audit --package <path>`**: the audit reads the change from a review package, or builds one with the kit's `review-package.mjs` from the merge-base with the default branch or from `--base <ref>`, so the review and the Critical Gate judge the same diff; with `--package` or `--base` given, an empty package ends the audit in FAIL ("nothing to audit").
- **`audit --reaudit <round-commit>`**: checks one fix round against its own diff (the suite, the audit's probes, each open finding closed or kept, new defects in the fix diff only).
- **`audit --probes`**: writes behavior probes as tests under `<test dir>/audit/` and sabotages risk code (money and totals, credentials and permissions, deleting or overwriting data, date and time boundaries), each sabotage undone from a copy checked by hash. The copy goes to a temporary folder created for that audit outside the project (`mktemp -d` on macOS and Linux, a new folder under the user's `TEMP` folder on Windows), never to `.vibeflow/` or another folder of the project, so no `git add` reaches it; once a file is restored and matches the hash, its copy is deleted, and after the last restore the folder is deleted too, and the report says both were. An interrupted audit whose copy is gone reads the file's version in git (`git show HEAD:<path>`) and writes it back only when its hash matches the one the report recorded; otherwise it leaves the file as it is and tells you which change to undo, from the in-progress line where the report records each sabotage (file and line, the wrong change, the copy and its hash) before applying it, so work left uncommitted is never overwritten.
- **`analyze --measure`**: runs the full-suite command and the affected-tests command once each and records their times and the date; see `analyze` under Changed.
- **`stats`: a `### Loop` section** when `.vibeflow/loop/` holds ledgers (its `.md` files other than `config.md`), with the numbers from `loop-stats.mjs`; without ledgers the report is unchanged and the command still writes nothing to disk.
- **The loop kit** in `plugins/vibeflow/skills/implement/loop/`: the loop principles, four briefing templates, the orchestrator's flow, the PR body template, the executor and auditor roles, and nine dependency-free Node scripts (`preflight`, `who-reads`, `check-briefing`, `perimeter`, `review-package`, `check-probes`, `watch-pr`, `watch-round`, `loop-stats`); the Claude and Codex plugins ship it.
- **The kit's exit codes**: every script answers `--help`, needs Node.js 18 or later and exits 64 below it, and exits 64 when it cannot run, with the departures the kit's `README.md` gives: `review-package.mjs` exits 2 for every error; `preflight.mjs` exits 2, stop, on a path that is not a git repository; `watch-pr.mjs` keeps 64 for bad arguments and exits 69 at its first read when `gh` is missing or cannot be executed, and 77 when it is not logged in or GitHub refuses its credential (`gh` exit 1 with `HTTP 401`), with a line that says what to do: when `gh` is not logged in, to run `gh auth login`; when the credential is refused, to run `gh auth login` (with `--hostname <host>` for a host other than github.com) or, when one is set, to replace the token in the variables `gh` reads for that host before its stored login (`GH_TOKEN` and `GITHUB_TOKEN` on github.com and on a `ghe.com` host, `GH_ENTERPRISE_TOKEN` and `GITHUB_ENTERPRISE_TOKEN` on a GitHub Enterprise Server host); any other failed read (`gh` exit 1 without `HTTP 401`, a 403, network, a 5xx) is retried until the ceiling. `watch-pr.mjs --repo` takes `<owner/repo>` or `<host>/<owner/repo>`, the forms `gh --repo` takes, and passes it to `gh` as given; any other form exits 64. `check-probes.mjs --dir` takes a folder relative to the repository's top level or an absolute one, both resolved through symbolic links, and exits 64 with the reason when it does not exist, is not a folder or is outside the repository.
- **`preflight.mjs` prints no credential**: every URL it prints (the `origin` remote in any form and every `--probe-url`) loses, on its text and before any attempt to parse it, everything between `<scheme>://` and the last `@`, a space included, and, in a URL without a scheme, everything up to the last `@` (the user part of a `user@host:path` remote, or a `user:password@host/path`); a path holding an `@` loses more than the credential.
- **CLI 0.17.0 installs the kit**: `--cursor` into `.cursor/skills/vibeflow-implement/loop/` and `--copilot` into `.github/vibeflow/loop/`, from the files `loop/manifest.json` lists; existing installs get it with `--force`, and the install log starts with `setup-vibeflow <version>`.

**Changed**

These change a command you already use, loop or no loop.

- **`audit`**: `allowed-tools` gains `Edit` and `Write`, which Claude Code pre-approves while the audit runs.
- **`stats`**: `allowed-tools` gains `Bash(node:*)`, which pre-approves `node` commands while it runs, so `loop-stats.mjs` runs without a prompt; any other command can still run after the permission prompt.
- **`audit` description**: now names the review package, the scenarios, the sabotage and `--reaudit`. Cursor picks a skill to run on its own by its description, so `vibeflow-audit` may be invoked for somewhat different requests than in 1.15.
- **`audit` report**: gains a header (`Independence`, `Round`, `Stage`, `Review package`, `Base`) and the sections `### Findings`, `### Sabotage`, `### Probes` and `### Follow-ups`, and is rewritten at every stage with `Verdict: pending` until `Stage: final`.
- **An interrupted `audit`**: leaves its report with `**Verdict: pending**` in place of the previous final report for that feature. `stats` counts such reports apart, as "N audits in progress or interrupted", and leaves them out of every other count.
- **`audit` by hand**: writes its review package to `.vibeflow/reviews/<feature-slug>-round-0.md`, or records `Review package: none (<reason>)` when there is no diff to package, no kit or no Node.js 18+; the Critical Gate reads its diff from that package. With no uncommitted or branch change, it reviews the files the spec names and its Critical Gate section says no diff was scanned.
- **What `audit` by hand judges**: the diff runs from the merge-base with the default branch to the working tree, so a branch's commits and its uncommitted work are judged together; 1.15 judged `git diff HEAD` for uncommitted work and `git diff <base>...HEAD` for a branch. On a branch with audited commits and one local edit, the review and the Critical Gate cover the whole branch again; the report's `Base:` line names where it starts.
- **What the review package holds**: the diff, and every untracked file that `.gitignore` does not exclude, in full. A file diff with a line that looks like a secret or credential (the detector `check-briefing.mjs` stops on) stays out whole and is listed at the top as `WITHHELD`, with its path, its size and a line number to start reading from: the line that matched, or the hunk's first line when the match is in the text git prints after a hunk header. A file diff whose path looks like a secret stays out whole the same way, listed by its size without its path. The same detector reads every other line the package writes (the title, the commits, `git status --short`, the list of changed files with their line counts, the new-file list, the `WITHHELD` and `TRUNCATED` lists and the empty-package message): a commit whose title looks like a secret keeps only its short hash, with a note to read it with `git log -1 <hash>`; any other such line becomes a note in its place; and `HEADER LINES LEFT OUT` at the top counts those lines and gives the git commands that print them. Before writing, the finished package is read line by line, and a line that still looks like a secret exits 2 with nothing written. The package is a working copy rewritten on every audit: keep it out of version control by adding `.vibeflow/reviews/` to `.gitignore` (the Cursor and Copilot installers already ignore `.vibeflow/`).
- **What counts as a change**: nothing under `.vibeflow/`. The loop's artifact folders stay out of the package, and the rest of `.vibeflow/` (specs, PRDs, the knowledge base) appears in it as context when something changed outside it. A change only under `.vibeflow/` is an empty package, so committed work on the default branch plus a new untracked spec takes the committed-work case above.
- **What the Critical Gate reads**: the package holds at most 400 KB of file diffs (`--max-bytes`), and what does not fit is listed at the top as `TRUNCATED`. Before matching its catalog, the gate reads each file the package left out (`TRUNCATED` or `WITHHELD`) with git, and its section says so: `Left out of the package: <n> file(s), read with git`, or `none`. A withheld line is cited by its path, line number and rule, never by its text; a line of a file whose path the package took out is cited by the package section where the note on that path appears and by its line number, never by its path; a commit the package shows without its title is cited by its short hash, never by its title, and a path the package took out by the package section where its note appears, in the report and in its prompt pack.
- **`audit` and `stats` with an unsubstituted `${CLAUDE_SKILL_DIR}`**: a command that still shows the variable, or a kit path that starts at `/../`, reads as Claude Code older than 2.1.69 and says to update Claude Code; in Codex they resolve the kit path from the skill's folder and run the command again.
- **`audit` report language**: the report is still written in your language, but the `Verdict` label with PASS, PARTIAL and FAIL and every `###` heading of the report, including `### DoD Checklist`, `### Critical Gate` and `### Gaps`, stay in English in any language, with the header labels and the finding tokens, because `stats` and the kit's `watch-round.mjs` read them.
- **`audit` findings**: every finding is one line with a severity (`defect`, `risk-gap`, `low`), a cause (`spec`, `implementation`, `proof`, `fix`) and a confidence; an open `defect` or `risk-gap` keeps the verdict below PASS, a `low` finding goes to `### Follow-ups` without blocking, and a `spec`-cause finding enters the incremental prompt pack as a question, not a task.
- **`audit` verdict**: confidence no longer weighs in it. In 1.15 severity and confidence decided what blocked; now an open `defect` or `risk-gap` holds the verdict below PASS whatever its confidence, so the same code can get a different verdict. If PASS gates your merges (a CI step that reads `**Verdict:**`, for instance), expect PARTIAL where 1.15 gave PASS.
- **`audit` review**: also tests scenarios (edge cases, error paths, the inputs the DoD implies) and reads the spec's `Risk code:` line.
- **`audit` by hand**: writes the probe file and sabotages only with `--probes`; without it, the report lists the probe cases it would write as code and records `Sabotage: skipped (standalone audit; --probes runs it)`.
- **`gen-spec`**: where an assumption is not safe to state, writes `[NEEDS CLARIFICATION: <the question>]` in place of a TODO and aims to keep at most 3 open; checks its own draft before saving (binary DoD checks, a test or `Scenarios:` on each functional check where the project has a test runner, the marker count) and can ask up to 2 questions in one round before saving; markers still open after that round stay in the saved spec and are named in the reply, which with more than 3 also recommends `discover` before `implement`; ends `## Risks` with a `Risk code:` list of the paths or functions the change touches in money and totals, credentials and permissions, deleting or overwriting data, and date and time boundaries (`Risk code: none` when there are none).
- **`gen-spec` with no one to answer** (`claude -p`, a pipeline): it can end on its questions with no spec saved. Over ten runs of the same vague request on each version, 1.16 saved the spec in 8 and 1.15 in 10; in the other two, 1.16 asked its questions and said it would save the spec once they were answered.
- **`gen-spec`**: records the questions asked and their answers in `## Clarifications` (at most 5 questions per session), carries a PRD's `## Clarifications` into the spec, and may add `Scenarios:` lines in the EARS form and property checks naming their oracle under a DoD check; the DoD stays 3 to 7 checks.
- **Spec and PRD literals**: in a spec or PRD written in any language, the `## References` and `## Clarifications` headings, the `Scenarios:` and `Risk code:` labels, the `[NEEDS CLARIFICATION: …]` marker and the EARS keywords `WHEN` and `THE SYSTEM SHALL` stay in English, because other commands match them byte for byte.
- **`discover`**: writes the dialogue's decisive questions and answers under `## Clarifications` in the PRD.
- **`analyze`**: `index.md` gains a Tests and Pitfalls block (the full-suite command, the narrowest affected-tests command with its measured time or `unmeasured`, and the pitfalls with their source). An incremental run is now due also when only a test file, the CI configuration or the test runner's configuration changed, or when `index.md` lacks the block; then it refreshes the block and moves `Analyzed:` to today. It records the test commands without running them: only `analyze --measure` runs each one once and records its time and date, and the flag makes the block due even on a project with no other change. Without the flag a recorded time stays, a command never measured is `unmeasured`, and a command that changed loses its old time.
- **`implement`**: gains only the `Loop mode` section; without `--loop` it runs phases 0 to 8 as before, and its description now counts those nine phases.
- **Copilot install**: reinstalling with `--force` adds `.github/vibeflow/` to the Vibeflow block of an existing `.gitignore`.

**Fixed**

- **`analyze` incremental**: counts commits from midnight of the analyzed date (`git log --since="<date> 00:00"`); with a date alone git counted from the current time of day, so that day's earlier commits were skipped.

### v1.15.0 (2026-09-05)

- **Universal Claude + Codex plugin** — `plugins/vibeflow/` is now the single source of truth for the ten Vibeflow skills. The package carries both `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, so the same workflows install natively in Claude Code and Codex without duplicated prompt logic.
- **One repository, two marketplaces** — `pe-menezes/vibeflow` now exposes the Claude catalog at `.claude-plugin/marketplace.json` and the Codex catalog at `.agents/plugins/marketplace.json`, both pointing to the shared plugin directory. The old `claude-code/` source tree was retired.
- **Legacy Claude distribution preserved** — the GitHub Actions workflow still publishes `pe-menezes/vibeflow-claude`, but it now derives that compatibility repository from the universal plugin. Existing Claude installations keep their update path while new installations can use the main repository.
- **Codex-native packaging** — all skills use portable skill frontmatter and remain focused, automatically discoverable workflows. Codex can select them from natural-language requests or users can invoke them explicitly; Claude keeps its namespaced slash commands.
- **Host-safe project memory** — the Claude architect now opts into project-scoped persistent memory, and `analyze` writes `MEMORY.md` only inside the exact memory directory exposed by that host. Codex exposes only the shared skills and keeps project knowledge in `.vibeflow/` without creating a Claude-only artifact. The Codex manifest uses the catalog capability vocabulary, the installation summary includes both required commands, and Cursor's `teach` description stays portable with the shared source.
- **Cross-edition regression coverage** — dependency-free CI now requires the same ten workflows and essential behavior contracts in the shared Claude/Codex plugin, Cursor skills, and Copilot prompt files. It also validates host frontmatter, shared marketplace versions, and the smoke harness's anti-scope precision so contextual directory references such as "no barrel file in `src/services/`" no longer report false violations.
- **CLI 0.16.0 and install surfaces** — `setup-vibeflow --codex` now prints the native Codex marketplace commands, while `--claude` points to the main repository. Root docs, contributor guidance, issue/PR templates, the smoke harness, and the bilingual site now understand the shared plugin layout.

### v1.14.0 (2026-08-16)

- **New command: `hotfix` — bug fixing that leaves a trace** — Production bugs used to make the agent abandon the method: no spec, no doc, no test (dogfooding 2026-07-12: 5 fixes with no trace). Now a dev with an observed defect and reproducible evidence runs `/vibeflow:hotfix` and gets, in one call, a trace doc + the fix + a red→green regression test — or a named HALT that saves the doc and is resumable later. The doc lives at `.vibeflow/hotfixes/<YYYY-MM-DD>-<slug>.md` (one file per bug), written in two beats: `Symptom`, `Checkpoint`, `Preservation`, `origin` before any code edit; `Root cause`, `Fix`, `DoD` (2–4 binary checks), `Regression` (with `oracle_type` / `reproduction` / `verification`), `Deviations`, `status` after. Guardrails: red proof before touching code (a regression test that doesn't fail on the current code → HALT `cannot-reproduce`), a closed 6-condition HALT set, a 3-attempt breaker, and `verified` only with real reproduction + red→green + project suite green + clean Critical Gate — anything less degrades to `partial`, declared. Three entry flows (post-investigation in conversation — transcribed, not re-investigated —, symptom + evidence in the prompt, third-party evidence) plus resuming a `halted(...)` doc. The final report never commits: it instructs committing fix + test + doc together, and when the doc path is gitignored (standard Copilot/Cursor installs ignore `.vibeflow/` entirely) it guides `git add -f` or a `.vibeflow/*` + `!.vibeflow/hotfixes/` carve-out in the Vibeflow block of `.gitignore` — guidance in the report, not an installer change. The Copilot and Cursor persistent layers (`vibeflow.instructions.md`, `vibeflow.mdc`) gain `.vibeflow/hotfixes/` in "Where Things Live" and the command in their lists — and, as a declared ride-along, fix the pre-existing omission of `vibeflow-implement` in those same lists. All 3 editions updated.

- **`quick`: boundary handed to `hotfix`** — `quick`'s description no longer offers "bug fix" as an example, and its "Not for:" list gains the boundary: an observed defect with reproducible evidence → `hotfix`. In Cursor, where auto-invocation decides by descriptions, both sides of the boundary were recalibrated together — `hotfix` triggers on defect + reproducible evidence, `quick` keeps the small planned task. All 3 editions updated.

- **`audit`: `--consolidate-hotfixes` (turn hotfix traces into durable state)** — The new flag scans `.vibeflow/hotfixes/*.md` and, for each doc, re-executes the doc's own `DoD` checks and regression test against the current code — deterministic by construction: only what each doc carries, never a blanket re-audit — classifying `still-holds` (DoD green), `promote` (permanent behavior detected → gen-spec entry stub in the report; the human decides) or `regressed` (→ gap wired into the audit's existing incremental prompt pack). Docs with `reproduction` below `real` or `status: partial` are listed as priority debt, never silenced. Without the flag, the normal audit report gains a single nudge line counting unconsolidated docs — printed only when `.vibeflow/hotfixes/` has docs, so projects without hotfixes see no output change and the smoke-harness report contract stays intact. All 3 editions updated.

- **CLI 0.15.0** — `setup-vibeflow` now installs the hotfix surfaces: `vibeflow-hotfix.prompt.md` on Copilot installs and `vibeflow-hotfix/SKILL.md` on Cursor installs. List entries only, no installer logic changed; the existing `.gitignore` wildcards (`vibeflow-*.prompt.md`, `.cursor/skills/vibeflow-*/`) already cover the new files.

### v1.13.0 (2026-08-15)

- **All 35 prompt surfaces rewritten for the 2026 frontier generation** — Vibeflow's prompts were written in the pre-Claude-5 dialect: caps as emphasis (`MANDATORY`, `NEVER`, `Do NOT`), `⚠️` warnings, the same rule restated across a phase, a summary table and an error table of the same file, per-stack test-runner enumerations the model already knows, and scripted wording for decisions a model makes well. On the current generation each of those costs twice — input tokens plus the thinking tokens to reconcile them — and emphasis written to overcome old-model reluctance now causes over-triggering. Every command, agent, rule and instruction file across the 3 editions was rewritten to state each rule once, in the place it applies, with the reason where one exists. Guardrails stayed literal and byte-checked: budget values, DoD limits (3–7 binary checks), anti-scope as a hard stop, the Critical Gate's ~40-rule catalog, the `<!-- vibeflow:start/end -->` marker contracts, artifact paths and output templates. Measured: **302,409 → 237,024 chars (−21.6%, ~16,300 tokens)** across the 35 files, against a committed target of ≥20%. Delete-list, keep-list, retention test, before/after pairs from this repo and the per-file ledger are in `proposals/unhobbling-style.md`, now normative for new prompts. All 3 editions updated.

- **`gen-spec`: rich references in specs** — When the input points at a test suite, a mockup, code to port, or a reference implementation, the generated spec gains an optional `## References` section recording each one with the role it plays ("the suite that defines the behavior", "the mockup to replicate", "the implementation to port"). `prompt-pack` propagates them, applying the same self-containment rule the embedded patterns already use: content goes into the pack when it fits, otherwise a verified path plus what the agent should take from it. The DoD guidance also gains a condition — where the project has a detectable test runner, at least one check names an executable test, existing or to be written; with no runner, nothing changes. The section is optional and `implement`, `audit` and `quick` are untouched: they validate DoD, Scope and Anti-scope, so specs written before this release stay valid. All 3 editions updated.

- **`audit`: reports every finding, filters at the verdict** — The audit no longer decides for you what was important enough to mention. Every finding is reported, including uncertain and low-severity ones, each with a confidence level and an estimated severity. Filtering happens at the verdict, where severity and confidence decide what blocks (FAIL), what caps the result at PARTIAL, and what is only a note. All 3 editions updated.

- **Docs** — `CONTRIBUTING.md`'s prompt style guidance rewritten for the new dialect and pointed at the style guide; its stale "Copilot is the source of truth" line corrected to Claude Code, matching `CLAUDE.md` and the sync workflow. `README.md` and `MANUAL.md` declare the prompt baseline: written for the 2026 frontier generation, and misbehavior on an older model is a regression worth an issue rather than a local workaround. Edition READMEs unchanged — no command description changed, so their command tables are still accurate.

### v1.12.0 (2026-06-03)

- **`audit`: new Critical Gate (destructive-op safety scan)** — `audit` now diffs the implementation (`git diff`) and scans it against a ~40-rule catalog across 6 domains (Database, Security, IaC, Kubernetes, Config, Data) for destructive or dangerous operations the DoD never mentions — removed auth middleware, `DROP TABLE`, hardcoded secrets, `0.0.0.0/0` CIDRs, mass deletes, etc. Unresolved CRITICAL/HIGH findings force a **FAIL** (mirroring "Test FAIL = Audit FAIL"); WARNING caps the verdict at PARTIAL; INFO is a note. Findings can be suppressed with a `vibeflow:allow <RULE_ID>: <reason>` override (CRITICAL/HIGH require a justification). v1 uses a prompt-embedded catalog; a Node engine in `cli/` is planned for v2. Design doc: `proposals/critical-gate.md`. Ported and sized down from the chama plugin's Critical Gate. All 3 editions updated.

### v1.11.0 (2026-06-03)

- **`implement`: new Phase 6 "Refine" (simplify in-scope)** — After tests pass, the coding agent now reviews and cleans the code it just wrote (reuse, naming, dead code, efficiency) before self-verifying DoD. The refinement is strictly bounded: diff-only, behavior-preserving, within budget and anti-scope, and gated by a green baseline — if the post-refine test run regresses, the changes are reverted. Pipeline goes from 7 to 8 phases. Inspired by the `simplify` step in the chama plugin's compose pipeline, adapted to vibeflow's local, no-commit model. All 3 editions updated. Site highlight updated.

### v1.10.0 (2026-03-23)

- **`analyze`: conventions.md now includes `## Don'ts` section** — Prohibitive rules are mined from anti-patterns, rule sources, and stack-specific pitfalls. Coding agents need to know what NOT to do, not just what to do. Don'ts must be specific and grounded in the actual codebase, not generic best practices.
- **`gen-spec`: DoD requires at least 1 craftsmanship check** — Specs must include at least one quality gate (pattern compliance, convention violations, typing, error handling) alongside functional checks. Prevents purely functional DoDs that miss code quality.
- All 3 editions updated.

### v1.9.0 (2026-03-13)

- **`teach --from`: import patterns from external repos** — New flag `--from <url|path>` on the `teach` command imports patterns and conventions from an external reference repo (e.g., shared architecture docs, coding guidelines). Clones the repo (shallow, ephemeral), detects knowledge sources (skills, CLAUDE.md, docs/, knowledge/, .cursorrules, etc.), presents an interactive review, and saves selected patterns to `.vibeflow/patterns/external-<name>/` with provenance and `confidence: imported`. Supports local paths, `--name` alias, and re-import. All 3 editions updated. Site commands page updated.
- **`gen-spec`: PRD validation gate** — gen-spec now validates PRDs (from `.vibeflow/prds/` or external) before generating the spec. Runs 5 sanity checks (concrete problem, audience, closable scope, .vibeflow/ conflicts, stack viability). If all pass, proceeds silently. If any fail, asks up to 2 targeted questions. Only activates for PRDs (file path or >3 lines), not short descriptions. All 3 editions updated.
- **Pattern conflict detection** — `teach --from` now detects name collisions with existing local patterns and asks which to keep. `teach` (new pattern) checks for conflicts with both local and imported patterns. `analyze` incremental mode skips patterns that have imported versions from `teach --from`. All 3 editions updated.

### v0.12.1 (2026-03-11)

- **Fix: .vibeflow/ detection when gitignored** — `vibeflow-analyze` Phase 0 now explicitly reads `.vibeflow/index.md` by direct path instead of using search/grep, which respect `.gitignore` and fail silently. Added a generic guardrail to Copilot instructions and Cursor rules. Affects `claude-code/skills/analyze/SKILL.md`, `copilot/github/prompts/vibeflow-analyze.prompt.md`, `cursor/skills/vibeflow-analyze/SKILL.md`, `copilot/github/instructions/vibeflow/vibeflow.instructions.md`, `cursor/rules/vibeflow.mdc`.

### v0.12.0 (2026-03-11)

- **CLI: idempotent `--force` for AGENTS.md** — Running `npx setup-vibeflow --force` no longer duplicates the vibeflow block in `AGENTS.md` or `copilot-instructions.md`. The CLI now uses `<!-- vibeflow:start/end -->` delimiters to upsert the block in-place. Legacy installs without delimiters get a safe append + warning instead of silent duplication. Affects `cli/index.js`, `copilot/AGENTS.md`, `copilot/copilot-instructions.md`. Version bumped to 0.12.0.

### v0.11.0 (2026-03-11)

- **`implement` ported to Copilot and Cursor editions** — Previously exclusive to Claude Code based on a false assumption that other editions lacked filesystem access. All 3 agents (Claude Code, Copilot, Cursor) have full filesystem access. `implement` is now available in all editions. CLI updated to install the new files. `prompt-pack` remains available as an alternative for delegating to a separate session/agent.

### v1.8.1 (2026-03-08)

- **Removed `spec-driven-dev` skill** — Legacy methodology skill that was redundant with the individual skills (gen-spec, audit, prompt-pack, etc.) and the architect agent. It appeared as a command but had no actionable use. Removed from all 3 editions, CLI installer, and docs.

### v1.8.0 (2026-03-07)

- **Claude Code: commands/ → skills/ migration** — All 9 commands migrated from legacy `commands/*.md` format to the recommended `skills/*/SKILL.md` format. Each skill now has proper frontmatter: `argument-hint` for autocomplete hints, `allowed-tools` for permission-free tool usage, and descriptions in 3rd person with "Use when..." context. Legacy `commands/` directory removed.
- **Cross-edition description sync** — All command/skill/prompt descriptions aligned across Claude Code, Copilot, and Cursor editions. Descriptions now consistently use 3rd person voice and include when-to-use context.
- **`plugin.json` updated** — Description aligned with site messaging: "Spec-driven development for AI agents. Define what to build, let the agent build it right."
- **`CLAUDE.md` added** — Project-level instructions file with cross-edition sync rules, file mapping table, and documentation checklist. Auto-loaded by Claude Code to prevent sync drift.
- **Site: `/commands` subpage** — New dedicated page documenting all 9 commands with flags, modes, and output details. Landing page Features cards now show mini-tags (flags/highlights) and link to `/commands#anchor`.
- **Site: Contact form** — New contact section with Formspree integration for direct email from the site.
- **Site: Header nav updated** — Added "Commands" link in desktop navigation.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.7.0 (2026-03-07)

- **`analyze-satellite` merged into `analyze --satellite <url>`** — The standalone `analyze-satellite` command is now a flag on the `analyze` command. Same functionality (clone, analyze, filter by usage, merge with provenance), fewer commands to learn. All 3 editions updated.
- **DX: Quick Start + tiered command presentation** — README and MANUAL now lead with a 3-command quick start (`analyze` → `gen-spec` → `implement`) instead of listing all commands flat. Commands table reordered: core pipeline first, optional/utility commands after. Reduces cognitive load for new users without removing any functionality.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.6.0 (2026-03-06)

- **Interactive Analyze (`--interactive`)** — New flag for the analyze command that adds a review checkpoint (Phase 3.5) between pattern discovery and saving. Presents patterns found in a compact summary and asks 3 questions: false positives, missing patterns, and rationale ("why"). User feedback is incorporated into pattern docs before saving: false positives are removed, missing patterns are created with `source: team-reported`, and rationale is saved as a `## Rationale` section (outside auto markers, survives incremental updates). Pattern docs gain a `confidence` frontmatter field: `inferred` (default) or `validated` (human-confirmed). Incremental + interactive only asks about new/changed patterns. Composes with all modes: `--fresh`, `--scope`, incremental.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.5.0 (2026-03-06)

- **Contextual Pattern Resolution** — Two-part feature that makes pattern loading intelligent across the entire pipeline.
  - **Part 1 (Analyze — producer):** `analyze` now generates YAML frontmatter (`tags`, `modules`, `applies_to`) on each pattern doc and a consolidated **Pattern Registry** YAML block in `index.md` (between `<!-- vibeflow:patterns:start/end -->` markers). Incremental mode preserves frontmatter outside auto markers. Scoped mode updates frontmatter on enrichment and regenerates the registry.
  - **Part 2 (Consumer commands):** `gen-spec`, `implement`, `prompt-pack`, and `audit` now resolve patterns automatically via the Pattern Registry — cross-referencing tags/modules against the spec's scope to load the top 3-5 relevant patterns. Manual override in spec's "Applicable Patterns" always wins. Backward compatible: falls back to previous behavior if no registry exists.
- All 3 editions (Claude Code, Cursor, Copilot) updated in sync.

### v1.4.0 (2026-03-06)

- **New command: `/vibeflow:implement`** — Claude Code only. Reads a spec from `.vibeflow/specs/`, loads applicable patterns and conventions, and implements the feature following all spec guardrails (budget, anti-scope, DoD). Runs tests automatically, self-verifies each DoD check with evidence, and suggests `/vibeflow:audit` as the next step. The agent acts as a **Coding Agent** — it follows the spec, it does NOT make architectural decisions. Budget enforced at 2 checkpoints (planning + during implementation). Anti-scope violations = hard stop. Test fix attempts capped at 2 to avoid infinite loops.
- **gen-spec updated** — After saving a spec, gen-spec now suggests `/vibeflow:implement` as the primary next step (with prompt-pack as fallback for separate sessions).

### v1.3.0 (2026-03-06)

- **gen-spec: smart next-step suggestion** — In Claude Code, gen-spec now suggests implementing directly from the spec (since the agent has filesystem access to `.vibeflow/`), with prompt-pack as an optional fallback for separate sessions. Cursor and Copilot editions unchanged (still suggest prompt-pack by default).

### v1.2.0 (2026-03-03)

- **Analyze: `--scope <path>` flag** — Deep-dive into a specific module/directory. Requires a prior general analysis (`.vibeflow/` must exist). Inherits global context (stack, domain, conventions) and samples the target module densely (all files if ≤30, ≥80% if larger). Enriches existing global pattern docs with examples from the scoped module. Creates new pattern docs only for module-specific patterns not covered globally. Registers scoped analyses in `index.md`.
- All 3 editions (copilot, cursor, claude-code) updated in sync.

### v1.1.0 (2026-03-03)

- **Analyze: domain detection + mandatory patterns** — Phase 1 now classifies the project by domain (mobile, web-frontend, api-backend, library, cli) and activates a mandatory pattern checklist per domain. Mobile projects REQUIRE design-system, screen-composition, and navigation patterns; web frontends REQUIRE component-library, route-composition, and state-management; API/backends REQUIRE endpoint-definition, data-access, and auth/middleware.
- **Analyze: progressive sampling scale** — Replaced fixed minimums ("≥2 per module, minimum 8 total") with a 6-level scale based on repo size: 8 → 12 → 20 → 30 → 40 → 50-60 files. Large repos (1000+ files) now get cross-module sampling: same layer sampled across 3-4 features to find the real pattern by repetition.
- **Analyze: mandatory pattern verification** — After sampling, REQUIRED patterns not covered trigger additional targeted sampling (2-3 files per missing pattern). Truly absent patterns are documented as "Not found" instead of silently omitted.
- **Analyze: cross-module pattern rule** — Horizontal pattern docs (UI, data, navigation, design system) must include examples from ≥3 features/modules.
- **Analyze: updated budget** — Max budget raised from 10 to 12 for repos with 2000+ source files. Mid-range adjusted (151-500 → ≤8, 501-2000 → ≤10).
- All 3 editions (copilot, cursor, claude-code) updated in sync.

### v1.0.0 (2026-03-01)

- **Stable release.** All 8 planned improvements implemented and verified.
- **Artifacts centralized in `.vibeflow/`** — PRDs, specs, prompt packs and audits now all live inside `.vibeflow/` (previously they were loose folders at repo root). One folder to commit or gitignore.
- `plugin.json` version aligned with MANUAL and CHANGELOG.
- Verify installation updated to list all 8 commands.
- Contextual budget referenced in skill guardrails (MANUAL).
- General consistency reviewed and corrected.

### v0.5.0 (2026-02-28)

- **New command: `/vibeflow:teach`** — structured feedback to update `.vibeflow/`. Accepts pattern corrections, new conventions, architectural decisions, and new patterns in natural language. Edits docs outside auto markers to survive incremental runs.
- **New command: `/vibeflow:stats`** — audit statistics. Reads all audit reports and compiles: PASS/PARTIAL/FAIL rates, most violated patterns, most failing DoD checks, quality trends.
- **Contextual budget** — `/vibeflow:analyze` now calculates a suggested budget based on project size (2-3% of source files, min 4, max 10) and writes it to `.vibeflow/index.md`. `gen-spec` and `prompt-pack` read this value. Fallback: ≤6 if unavailable.
- **Adaptive discover** — `/vibeflow:discover` now evaluates clarity after the first response. If problem, audience, and scope are already clear, uses fast-track (1-2 rounds instead of 3-5). Opening reformulated to invite upfront detail.
- **MANUAL.md trimmed** — changelog extracted to `CHANGELOG.md`. Sections condensed: commands reference, workflow example, file map. Target ~500 lines.

### v0.4.0 (2026-02-28)

- **New command: `/vibeflow:quick`** — fast-track for small tasks. A single command that generates a prompt pack directly, skipping discover and spec. Runs lightweight scan if `.vibeflow/` doesn't exist. Default budget ≤4 files. Ephemeral spec (not persisted).
- **Architect model → user's choice** — architect agent no longer hardcodes a model. It inherits whatever model the user has configured.
- **Mandatory tests in audit** — `/vibeflow:audit` now detects and runs tests automatically based on the project stack (npm test, pytest, cargo test, etc.). Test failure = automatic FAIL, regardless of DoD. `/vibeflow:prompt-pack` now always includes mandatory test commands section.

### v0.3.0 (2026-02-26)

- `/vibeflow:analyze` — **incremental analysis:**
  - **Phase 0 (new)** — Detect Mode: checks if `.vibeflow/` exists and if `--fresh` flag is present. Routes to fresh or incremental mode. On incremental: reads previous analysis date, runs `git log` to find changed files, identifies affected modules. On "no changes": reports "No changes detected" and exits early. Fallback to fresh if git unavailable.
  - **Phases 1-5 updated with incremental scoping:** Each phase now has an "Incremental mode:" paragraph describing what to preserve and what to re-analyze. Fresh mode unchanged.
  - **Marker system for pattern docs:** Pattern docs and `conventions.md` now use `<!-- vibeflow:auto:start/end -->` markers to delimit auto-generated sections. During incremental updates, only content within markers is regenerated; manual edits outside markers are preserved. Legacy pattern docs without markers are rewritten with markers added.
  - **decisions.md protection:** Never modified by analyze command in any mode (fresh or incremental). Created only on first run if doesn't exist. Reserved for architect and manual curation.
  - **Smart defaults:** `/vibeflow:analyze` (no args) runs incrementally if `.vibeflow/` exists. `--fresh` flag forces complete rebuild.
  - **Usage:** `/vibeflow:analyze [--fresh]`

### v0.2.0 (2026-02-26)

- `/vibeflow:analyze` — **enhanced to 6 phases with deep adaptive analysis and rules integration:**
  - Phase 1 now explicitly detects knowledge sources (`.cursorrules`, `.cursor/rules/*.mdc`, `CLAUDE.md`, `.clinerules`, `.github/copilot-instructions.md`, `/docs/`, `ARCHITECTURE.md`, `ADRs/`)
  - Phase 1.5 (new) — Rules Integration: extracts conventions from rules files, builds module map, validates rules against code, flags conflicts
  - Phase 2 (renamed from "Convention Mining") — adaptive sampling strategy: detects modules by directory/prefix/rules, reads ≥2 files per module, minimum 8 total, documents coverage gaps for large repos
  - Phase 3 (renamed from "Pattern Deep Dive") — expands scope using rules map; if a rule mentions a module not sampled, reads it for pattern docs
  - Phase 4 (renamed from "Compile") — `conventions.md` now incorporates rules-extracted conventions with source attribution; conflicts marked with ⚠️
  - Reporting now includes knowledge sources found, rules integrated, and conflicts detected

### v0.1.2 (2026-02-25)

- New command: `/vibeflow:discover` — interactive dialogue for PRD
- `gen-spec` accepts PRD as input (`/vibeflow:gen-spec prds/<slug>.md`)

### v0.1.1 (2026-02-25)

- Default output language now adapts to user's input language across all commands and agent

### v0.1.0 — Initial release

- `/vibeflow:analyze` — 5-phase adaptive codebase analysis, generates `.vibeflow/` pattern docs, updates architect MEMORY.md
- `/vibeflow:gen-spec` — grounded spec generation with Applicable Patterns section, reads `.vibeflow/` before writing
- `/vibeflow:prompt-pack` — self-contained prompt pack with real pattern code embedded, 8-section structure
- `/vibeflow:audit` — DoD + pattern compliance audit, incremental prompt pack on gaps, updates `decisions.md`
- **Architect agent** — `memory: project`, 2-layer knowledge system (MEMORY.md + `.vibeflow/`), maintains project knowledge across sessions
- **`.vibeflow/`** — adaptive knowledge system committed to git, adaptive to any project type
