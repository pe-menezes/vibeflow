# Loop principles

The execution loop runs each part of a feature through separate sessions: an orchestrator that cuts the parts, writes the briefings and checks from outside; an executor that implements in a fresh session; an auditor that did not see the work; at most two fix rounds, each followed by a re-audit. These nine principles are the reasons behind that shape. Briefings point at them by number ("loop principle 7") instead of restating them. The two rules at the end say how a new friction enters this file and how audit probes leave the suite.

The checks that must always run are scripts in `scripts/` (see `README.md`); the briefing templates are in `briefings.md`.

## Principles

1. **Only what was measured now is a fact.**
   * A fact in a briefing carries the time and the command that measured it (`measured 22:06 by npm test`). A note, a log, a ledger line or another session's message is a lead and enters as "to check"; a correction found on the way goes back to its source.
   * Quota, permission to run tests and what the environment can do hold for the turn in which they were measured. The briefing asks for the measurement instead of repeating an old one.
   * A phase that depends on another service answering is proven with a real request against the running process before the step that cannot be undone.
   * An assumption about real data (a payload, a transcript, a service's state) is measured on real data within the round, by structure only; a fixture written from the assumption does not prove the assumption. Real data here means staging or anonymized data, never production.
   * A time window does not attribute authorship: measure on the path only the suspect writes. An acceptance criterion the orchestrator prescribes is risk code, so every path that produces its signal is checked before it is prescribed.

2. **Point at the rule; do not copy it.** A briefing names the principle and writes only what belongs to the part; what belongs to the repository lives in its knowledge base (`.vibeflow/`). When a principle changes, the briefings still open are rewritten before their next dispatch.

3. **A part fits in one session and leaves a trail.**
   * Every round (executor, fix, auditor, re-auditor) is a fresh session. The durable state is the progress file, the loop ledger and git, never the memory of a session.
   * A round that ends above 400k tokens of context says the part was too big, and the next one is cut smaller.
   * A session that stops without an error (process alive, CPU idle) is ended and restarted from its file, after reading what it left in the worktree.

4. **Scope freezes at dispatch.** An addition found midway becomes a follow-up item or a new part with its own audit, never a fix before the audit. Before a file goes into the anti-scope, or a value is told to stay, `who-reads.mjs` says which tests, scripts and generators read it. A generated file changes only through its generator; when parallel parts share one, the orchestrator regenerates it once at the end.

5. **Whoever did the work does not approve it.** The auditor and the re-auditor are clean sessions every time, never an earlier auditor resumed by message. The executor does not call a reviewer of its own. The orchestrator checks from outside before the audit (suite, types, `perimeter.mjs`), because a cheap check that reads the terminal catches most wrong acceptances at almost no cost.

6. **Proof scales with risk.**
   * Red before green, run by the executor. The written exception is a hardening test, which is proven by killing a sabotage that had survived.
   * Sabotage is done only by the auditor and only in risk code: money and totals, credentials and permissions, deleting or overwriting data, date and time boundaries. Each sabotage is undone from a copy checked by hash; `git checkout`, `restore`, `stash` and `reset` are off limits while work is uncommitted.
   * Where the repository has a mutation tool (Stryker, mutmut, cargo-mutants), it runs on the part's lines before the audit and the survivors go to the auditor; hand sabotage covers what the tool cannot express, such as SQL inside a string, a constant from another file or a domain rule.
   * Every finding has a severity: `defect`, `risk-gap` or `low`. Only the first two open a fix round; a `low` finding becomes a follow-up item. A differential oracle is used when a reference implementation exists.
   * A red gate gets fixed, never recalibrated: no raised baseline, no `skip`, no loosened assertion. A test that compares the real clock does not enter. When quota runs short, the work pauses and the proof stays as strong.

7. **Behavior probes join the suite; state probes stay in the report.**
   * A state probe pins the repository instead of a behavior: a diff against the base, the list of files touched, today's version, a sentence of a document, "still pending", a line number, the real clock. It stays out of the test directory, and `check-probes.mjs` lists the suspects before the PR.
   * A probe pins by content. The executor does not shape code to please a probe; it records the conflict and the re-audit decides.
   * An old probe that the part makes false (a defect now fixed, a sentence rewritten) is rewritten only with written permission in the briefing, by the fact and with equal strength.
   * A rule over a space of inputs (a date window, an amount, a time zone) becomes a property test when the repository has fast-check or Hypothesis, with the oracle written in the test.
   * In an operational runbook, a new instruction is a command with its expected output and a stop condition, proven in a temporary directory.

8. **The ceiling is written, and it escalates.**
   * Two fix rounds per part. A fix round leaves without asking up to the second; a finding that changes scope or product goes to the user before any fix.
   * A third round asks the user for a one-line OK, with the orchestrator's default declared, and leaves the moment it is given.
   * The same finding returning for the same cause stops the loop before the ceiling.
   * A round above 400k tokens of context stops before the next fix.
   * A headless executor runs with a spending cap of three to five times the measured cost of the part's first round. Turn limits in agent definitions are a safety net, not a budget.

9. **What must always happen is a script or a template, not a paragraph.** The checks live in `scripts/` and in `briefings.md`; a new paragraph here describing a mechanical check is a sign of a missing script. A front is measured in tokens processed (summed per call) and in clock time from dispatch to PASS; the final context size is a ceiling, not a cost. Each subagent's description follows `<feature> · <part> · <role> · round <n>`, so the rounds can be counted from the loop files without a hand-made table.

## Admission rule for a new friction

A friction is whatever cost clock time, tokens or a round. It enters in this order:

1. Record it every time: a dated entry in the loop ledger (`.vibeflow/loop/<feature>.md`), with its measured cost.
2. If it fits a line that already exists, it becomes that line, or adjusts it, in the principle or the step where it happens. There is no section of frictions.
3. If a machine can check it, it becomes a script or a field of a briefing template, with a test; the principle only points at it.
4. If it belongs to one repository, it goes to that repository's knowledge base (`teach`), not here.
5. This file stays under 150 lines and 3,000 words, and a test fails above either. A new line without room removes another: the one no part of the last two weeks used. A superseded rule leaves in the same change; struck-through text does not live next to the rule that holds.

Signals to measure when the user asks for a review: new lines and principles per week, and frictions that came back after admission (a rule that exists and does not hold should become a script).

## Pruning rule for audit probes

The suite grows with every audit, because probes become tests. Three gates keep it honest:

* On entry, each probe answers in the report: which contract it protects, which plausible regression breaks it, and why the executor's tests do not catch it. A probe without the three answers stays in the report.
* Before the PR, `check-probes.mjs <repo> --base <default branch>`; a state probe leaves the suite before the PR opens.
* The next part that touches the module has its auditor list the old probes that duplicate an executor test or pin state; they leave in the same PR, with the reason in the report. The size of the audit probe folder is part of the front's measurement.
