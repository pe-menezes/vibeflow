// Contracts of the loop's company mode: the "Ending: company mode" section of the
// loop kit's orchestrator.md and the PR body template loop/pr-body.md. The limits
// (merge, deploy, shared migration, production read) and the road to the push and the PR
// are risk code, so each rule is pinned as a whole sentence, up to its period,
// and a predicate over every sentence of the section refuses an added exception; the order
// of the ending (CI-environment suite, push, PR, watch) is pinned by position.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withSandbox } from './loop-helpers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT = 'plugins/vibeflow/skills/implement/loop';
const HEADING = '## Ending: company mode';

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
// Prompts wrap prose, so phrase contracts run on a copy with whitespace collapsed.
const flat = (text) => text.replace(/\s+/g, ' ');

function count(haystack, needle) {
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) n += 1;
  return n;
}

// The company-mode section, from its heading to the next "## " heading or the end.
function companySection() {
  const content = read(`${KIT}/orchestrator.md`);
  const start = content.indexOf(`\n${HEADING}\n`);
  assert.ok(start !== -1, `orchestrator.md has "${HEADING}"`);
  const end = content.indexOf('\n## ', start + 1);
  return content.slice(start + 1, end === -1 ? undefined : end);
}
const section = () => flat(companySection());
// The section's sentences: a period, semicolon or colon followed by a capital, a digit or a backtick.
const sentences = () => section().split(/(?<=[.;:])\s+(?=[A-Z0-9`])/);

// The numbered step n of the section, up to step n + 1 (or the end of the section).
function step(n) {
  const match = new RegExp(`(?:^| )${n}\\. (.*?)(?= ${n + 1}\\. |$)`).exec(section());
  assert.ok(match, `the section has step ${n}`);
  return match[1];
}

// Each rule, as the whole sentence the section states it in.
function hasSentence(text, sentence, message) {
  assert.ok(text.includes(sentence), `${message}: "${sentence}"`);
}

// The fenced template of pr-body.md, split by its "## " headings.
function prBodyTemplate() {
  const fence = /```markdown\n([\s\S]*?)\n```/.exec(read(`${KIT}/pr-body.md`));
  assert.ok(fence, 'pr-body.md holds the template in a ```markdown fence');
  const sections = new Map();
  for (const part of fence[1].split(/\n(?=## )/)) {
    const match = /^## (.+)\n?([\s\S]*)$/.exec(part);
    if (match) sections.set(match[1].trim(), flat(match[2]));
  }
  return sections;
}

const BODY_SECTIONS = [
  'Verdict per part',
  'Definition of Done',
  'Findings',
  'Probes',
  'Sabotage',
  'Critical Gate',
  'Commands',
  'Decisions',
  'Follow-ups',
];

// ------------------------------------------------------------------ the CI's environment, draft, watch and order

test('company mode: the suite runs in the CI\'s environment, at the CI\'s checkout depth, or the PR says it could not', () => {
  const text = section();
  hasSentence(text, 'Read the CI configuration: runner image, runtime version, test command, the events that trigger it, and how it checks out the code (a checkout without full history, such as `actions/checkout` with no `fetch-depth`, leaves the tests no git history to read).', 'reads the CI configuration, triggers and checkout included');
  hasSentence(text, "When the dev machine differs from it, run the suite in the CI's environment before the push: for example a container of the CI image with the network off, over a clone as shallow as the CI's checkout, made with `git clone --depth <n> file://<project root> <clone>`, because git ignores `--depth` for a plain local path.", 'the CI-environment suite before the push, in a container, over a shallow clone');
  hasSentence(text, 'When the CI tests the pull request\'s merge commit with the base, as `pull_request` workflows do, the run is over the feature branch merged with the default branch inside the clone, never on the branch that is pushed.', 'the merge commit, as the CI tests it');
  hasSentence(text, "A red run there blocks the push and is a finding for a fix round of the part it belongs to, within that part's ceiling (loop principle 8), and the ending restarts as below.", 'a red CI-environment run blocks the push and restarts the ending');
  hasSentence(text, 'When that run is not possible (no container runtime, an image that cannot run locally), the ledger records why and the PR body says so.', 'the impossibility is recorded and declared in the PR');
  hasSentence(text, 'A repository with no CI configuration has nothing to match, and the PR body says it has no CI.', 'no CI is said in the PR');
});

test('company mode: the shallow clone the section writes is shallow, and a plain local path would not be', () => {
  const clone = [...section().matchAll(/`(git clone [^`]+)`/g)].map((m) => m[1]);
  assert.equal(clone.length, 1, 'the section writes one git clone command');
  withSandbox((box) => {
    for (const n of [2, 3]) {
      box.write('src/rules.ts', `export const x = ${n}\n`);
      box.git('commit', '-q', '-am', `commit ${n}`);
    }
    const run = (argv) => spawnSync(argv[0], argv.slice(1), { cwd: box.root, env: box.env(), encoding: 'utf8' });
    const depthOf = (dir) => ({
      commits: run(['git', '-C', dir, 'rev-list', '--count', 'HEAD']).stdout.trim(),
      shallow: run(['git', '-C', dir, 'rev-parse', '--is-shallow-repository']).stdout.trim(),
    });
    const target = join(box.root, 'clone');
    const argv = clone[0]
      .replace('<n>', '1')
      .replace('<project root>', box.repo)
      .replace('<clone>', target)
      .split(' ');
    const made = run(argv);
    assert.equal(made.status, 0, made.stderr);
    assert.deepEqual(depthOf(target), { commits: '1', shallow: 'true' }, 'the clone has the CI\'s depth');
    // The reason the section gives holds: with a plain path git ignores --depth.
    const plain = join(box.root, 'plain');
    assert.equal(run(['git', 'clone', '-q', '--depth', '1', box.repo, plain]).status, 0);
    assert.deepEqual(depthOf(plain), { commits: '3', shallow: 'false' }, 'a plain local path ignores --depth');
  });
});

test('company mode: draft or ready by the repository\'s convention, a declared draft default when there is none', () => {
  const text = section();
  hasSentence(text, "Draft or ready, by the repository's convention: its pull request template, its CONTRIBUTING file, or the human's answer recorded as a `Decision:` line.", 'the three sources of the convention');
  hasSentence(text, 'With no convention found, the PR opens as a draft, the declared default because a draft cannot be merged by accident, recorded as a `Decision:` line, and the ending waits for no one.', 'the draft default, recorded, waiting for no one');
  assert.match(text, /`gh pr create [^`]*`, adding `--draft` when the convention says draft/, 'gh pr create, --draft by convention');
  // No sentence about a missing convention or an absent human opens the PR ready.
  const absent = sentences().filter((s) => /\bno convention\b|\bhuman\b[^.]*\b(away|absent|out)\b/i.test(s));
  assert.ok(absent.length >= 1);
  for (const s of absent) assert.doesNotMatch(s, /\bready\b/i, `a missing convention never opens the PR ready: "${s}"`);
});

test('company mode: watch-pr.mjs waits for the checks a CI runs on the PR, its result goes to the body and the final report, and the skip is said', () => {
  const text = section();
  hasSentence(text, 'With CI that runs on the PR, run `watch-pr.mjs` with `--repo <owner/repo> --pr <number>` in the background, its output written to `.vibeflow/reviews/<feature>-pr-checks.txt`.', 'watch-pr with its arguments and its output in a file');
  hasSentence(text, 'A repository with no CI, or whose CI does not run on this PR (only on pushes to the default branch, or only once a draft is marked ready), skips `watch-pr.mjs`, because on a PR with no check it waits until its ceiling; the PR body says which.', 'the skip, its reason, and the PR says which');
  hasSentence(text, 'a failure the change did not cause (the same check failing on the default branch, a cancelled run) goes to the human as a note in the final report and opens no round.', 'a failure the change did not cause is a note, not a round');
  assert.match(text, /final report[^.]*the checks' result from `watch-pr\.mjs`/, 'the checks\' result in the final report');
});

// The route without gh: a remote off GitHub, or a machine without gh logged in, still ends with the
// branch pushed and the body written, and the pull request is handed to the user.
const NO_GH_ROUTE = [
  'Before step 5, check that gh can open the pull request: `gh auth status --hostname <origin host>` exits 0, the same check as the `pr ending:` line of `preflight.mjs`.',
  'When gh is missing, is not logged in on that host, or the remote is on a host gh does not serve (GitLab, Bitbucket, Azure DevOps), the ending pushes the feature branch with the push command of step 5, keeps the body step 4 wrote in `.vibeflow/reviews/<feature>-pr-body.md`, skips steps 5 and 6 and `watch-pr.mjs`, and gives the user one line: the branch, the body file, and that they open the pull request or merge request by hand with that body.',
];
// With no remote to push to, the ending cannot push either, so it stops before the push.
const NO_ORIGIN_ROUTE = 'With no `origin` remote there is nowhere to push: the ending stops before the push, skips steps 5 and 6, and gives the user one line: the branch, the body file in `.vibeflow/reviews/<feature>-pr-body.md`, and that they add a remote, push and open the pull request or merge request by hand.';
// Both routes skip the watch, and the ledger line each one writes is the source of the body's row and of the final report.
const BY_HAND_TAIL = "Both routes write a line to the ledger as they end, `Ending: by hand — <no origin remote, or no gh for that host> — <feature branch>`, the source of what follows: the body's PR checks row reads `not watched: opened by hand`, and the final report of step 7 carries the line given to the user in place of the PR link.";
// The opening says what the ending does when gh cannot open the pull request, for a repository with and without an origin remote.
const OPENING_PR_ENDING = 'Its `pr ending:` line says whether gh can open the pull request at the end; when gh cannot, the loop still runs, and the ending hands the pull request to the user: it pushes the branch when the repository has an `origin` remote, and with none it leaves the push to the user too ("Ending: company mode").';

test('company mode: when gh cannot open the pull request, the ending pushes, keeps the body, skips the watch and hands the PR to the user', () => {
  const text = section();
  for (const sentence of NO_GH_ROUTE) hasSentence(text, sentence, 'the route without gh');
  // The route is decided after the body is written and before the push of step 5.
  const body = text.indexOf('Fill `pr-body.md`');
  const route = text.indexOf(NO_GH_ROUTE[0]);
  const push = text.indexOf('5. Push the feature branch');
  assert.ok(body !== -1 && push !== -1, 'the section has step 4 and step 5');
  assert.ok(body < route && route < push, 'the route sits between the body (step 4) and the push (step 5)');
  // No step of the route needs gh: in orchestrator.md, gh appears only in the check that chooses it.
  const routeText = text.slice(route, push);
  assert.ok(routeText.startsWith(NO_GH_ROUTE[0]), 'the route opens with the check');
  const after = routeText.slice(NO_GH_ROUTE[0].length).split(/(?<=[.;:])\s+(?=[A-Z0-9`])/).filter((s) => s.trim());
  assert.ok(after.length >= 2, 'the route has its steps after the check');
  for (const s of after) assert.doesNotMatch(s, /`gh /, `a step of the route runs gh: "${s}"`);
  hasSentence(routeText, BY_HAND_TAIL, 'the body says the checks were not watched, from the ledger');
});

test('company mode: the opening says the ending pushes only when there is an origin remote', () => {
  const whole = read(`${KIT}/orchestrator.md`);
  const start = whole.indexOf('\n## Opening\n');
  assert.ok(start !== -1, 'orchestrator.md has "## Opening"');
  const opening = flat(whole.slice(start + 1, whole.indexOf('\n## ', start + 1)));
  hasSentence(opening, OPENING_PR_ENDING, 'the opening, with and without an origin remote');
  assert.doesNotMatch(opening, /the ending pushes the branch and leaves/, 'no claim that the ending always pushes');
});

test('company mode: with no origin remote, the ending stops before the push and hands the branch and the body file to the user', () => {
  const text = section();
  hasSentence(text, NO_ORIGIN_ROUTE, 'the route without a remote');
  const at = text.indexOf(NO_ORIGIN_ROUTE);
  assert.ok(text.indexOf('Fill `pr-body.md`') < at && at < text.indexOf('5. Push the feature branch'), 'the route sits between the body (step 4) and the push (step 5)');
  assert.ok(at < text.indexOf(NO_GH_ROUTE[1]), 'the remote is checked before the route that pushes without gh');
  // The tail after both routes names both, so the row and the final report hold without an origin remote too.
  assert.ok(text.indexOf(NO_GH_ROUTE[1]) < text.indexOf(BY_HAND_TAIL), 'the tail follows both routes');
});

test('company mode: watch-pr.mjs exit 64 (a bad argument, or gh missing, not executable or not logged in) says the checks are not watched and how to follow them', () => {
  // The route names every cause watch-pr.mjs gives for 64, so the body's row and the final report hold for each.
  const usage = /· 64 ([^`\n]+)/.exec(read(`${KIT}/scripts/watch-pr.mjs`));
  assert.equal(usage?.[1], 'bad arguments, or gh missing, not executable or not logged in', 'the causes of 64 in watch-pr.mjs, the ones the route below names');
  hasSentence(step(6), "Exit 64: the watch could not start, from a bad argument or a gh that is missing, cannot be executed or is not logged in (its error line says which), so nothing is watching the checks and `gh pr edit` does not run: the ledger gets the line `Ending: checks not watched — watch-pr.mjs exit 64 — <its error line>`, the body file's PR checks row reads `not watched: watch-pr.mjs exit 64 (<its error line>)`, the PR keeps the body step 4 wrote, and the final report says the checks were not watched, with that error line, and gives the user `gh pr checks <number> --watch` to follow them.", 'the route of exit 64');
  assert.doesNotMatch(step(6), /Exit 64: gh is missing or not logged in/, 'exit 64 is not read as gh alone');
  // Only a watch that read the PR rewrites the body with gh.
  const edits = sentences().filter((s) => /`gh pr edit`/.test(s) && /\breplace\b/.test(s));
  assert.equal(edits.length, 1, 'one sentence replaces the body with gh pr edit');
  assert.ok(edits[0].startsWith('When the watch ends with exit 0, 1, 2 or 3,'), `the body is replaced only after a watch that read the PR: "${edits[0]}"`);
});

test('company mode: the ending runs in order, probes, CI-environment suite, body, push, PR, watch, body updated', () => {
  const text = section();
  const steps = [
    '`check-probes.mjs`',
    "run the suite in the CI's environment",
    'Fill `pr-body.md`',
    '`git push',
    '`gh pr create',
    'With CI that runs on the PR, run `watch-pr.mjs`',
    'When the watch ends',
  ];
  const at = steps.map((s) => text.indexOf(s));
  steps.forEach((s, i) => assert.ok(at[i] !== -1, `the section has "${s}"`));
  for (let i = 1; i < at.length; i += 1) assert.ok(at[i - 1] < at[i], `"${steps[i - 1]}" comes before "${steps[i]}"`);
});

// ------------------------------------------------------------------ the road to the push (risk code)

test('company mode: no sentence of the section opens an exception on the road to the push and the PR', () => {
  // An added sentence that waives a rule of the ending fails here.
  const exception = /\bunless\b|\banyway\b|\bonly when\b|\bwithout waiting\b|\bremember|\botherwise\b|\bre-?run\b|\buntil (it|they) pass|\bstays? in the suite\b|\btakes? (too )?long\b|\bif (it is |it's )?new\b|\bfailure is new\b/i;
  const offending = sentences().filter((s) => exception.test(s));
  assert.deepEqual(offending, [], 'no sentence waives a rule of the ending');
});

test('company mode: only the sentences that order the ending speak of pushing or opening the PR', () => {
  // A sentence added anywhere that lets the push or the PR happen earlier, in any wording,
  // is a sentence about the push or the PR that is not one of these.
  const allowed = [
    '`check-probes.mjs` over the project root with `--base <default branch>`; a state probe it names leaves the suite,',
    "When the dev machine differs from it, run the suite in the CI's environment before the push:",
    'When the CI tests the pull request\'s merge commit with the base,',
    'A red run there blocks the push and is a finding for a fix round',
    'With no convention found, the PR opens as a draft,',
    'Before step 5, check that gh can open the pull request:',
    'With no `origin` remote there is nowhere to push:',
    'When gh is missing, is not logged in on that host,',
    'Both routes write a line to the ledger as they end,',
    'Push the feature branch with `git push -u origin <feature branch>` and open the PR with',
    'A repository with no CI, or whose CI does not run on this PR (only on pushes to the default branch,',
    'On a restart the PR already exists:',
    'A fix round opened at step 2 or step 6 restarts the ending',
  ];
  const speaks = /\bpush(es|ed|ing)?\b|\bopen(s|ed|ing)?\b[^.;]*\b(PR|pull request)\b|\b(PR|pull request)\b[^.;]*\bopen(s|ed|ing)?\b/i;
  const offending = sentences().filter((s) => speaks.test(s) && !allowed.some((a) => s.startsWith(a)));
  assert.deepEqual(offending, [], 'no other sentence speaks of the push or of opening the PR');
});

test('company mode: a state probe leaves the suite before the PR opens', () => {
  hasSentence(step(1), '`check-probes.mjs` over the project root with `--base <default branch>`; a state probe it names leaves the suite, committed like a round, before the PR opens (loop principle 7).', 'step 1, whole');
  for (const s of sentences().filter((x) => /state probe/i.test(x))) {
    assert.match(s, /leaves the suite/, `every sentence about a state probe takes it out of the suite: "${s}"`);
  }
});

test('company mode: a red check or a red CI-environment suite restarts the ending from step 1, never straight to the push', () => {
  const text = section();
  hasSentence(text, 'A fix round opened at step 2 or step 6 restarts the ending once its part is back at PASS: from step 1, the probes, the CI-environment suite, the body rewritten, then the push and the watch, never straight to the push.', 'the restart rule');
  assert.match(step(2), /and the ending restarts as below\./, 'step 2 routes its fix round to the restart');
  assert.match(step(6), /a failure the change caused is a finding for a fix round of its part, and the ending restarts as below;/, 'step 6 routes its fix round to the restart');
  // Every sentence that leads from a re-audit or a fix round to the push goes through step 1 first.
  for (const s of sentences().filter((x) => /\b(re-audit|fix round|PASS)\b/.test(x) && /\bpush/.test(x))) {
    if (/A red run there blocks the push/.test(s)) continue;
    const one = s.indexOf('step 1');
    assert.ok(one !== -1 && one < s.indexOf('push'), `a route back to the push goes through step 1: "${s}"`);
  }
  // On a restart the PR exists: its body is replaced, no second PR.
  hasSentence(step(5), 'On a restart the PR already exists: push, then replace its body with `gh pr edit <number> --body-file .vibeflow/reviews/<feature>-pr-body.md`.', 'the restart updates the PR');
});

// ------------------------------------------------------------------ the PR body

test('company mode: the PR body is pr-body.md, filled from the files and never from memory, after the template', () => {
  const text = section();
  hasSentence(text, 'Fill `pr-body.md` from the ledger, the audit and re-audit reports in `.vibeflow/audits/` and the progress files in `.vibeflow/progress/`, never from memory: a line the files do not support stays out.', 'the three sources, never memory');
  hasSentence(text, 'When the repository has a pull request template, its sections come first, filled, and the evidence follows.', 'the repository template first');
  assert.ok(text.includes('--body-file .vibeflow/reviews/<feature>-pr-body.md'), 'the PR is opened with the filled body');
});

test('company mode: gh pr create carries a title and the body file, because gh refuses without them when no terminal is attached', () => {
  const create = [...section().matchAll(/`(gh pr create [^`]+)`/g)].map((m) => m[1]);
  assert.equal(create.length, 1);
  assert.match(create[0], /--title "<title>"/, 'a title');
  assert.match(create[0], /--body-file \.vibeflow\/reviews\/<feature>-pr-body\.md/, 'the body file');
  hasSentence(step(5), 'the title is the spec\'s title, and gh refuses to open a PR without a title and a body when no terminal is attached.', 'the title\'s source and the reason');
});

test('company mode: every row of the body\'s Commands has a file written before it is filled', () => {
  const text = section();
  // The outside check (suite, types, perimeter.mjs) writes to the ledger as it runs.
  hasSentence(text, "The body's Commands rows are filled from files, so in company mode every outside check writes each command it runs (suite, type checker, `perimeter.mjs`) and its result to the ledger as it runs, one line each: `Check: <part> <role> <round> — <command> — <result>`.", 'the outside check in the ledger');
  hasSentence(step(2), 'Record the CI-environment run in the ledger as it ends: image, network, clone depth, command and result.', 'the CI-environment run in the ledger');
  hasSentence(step(6), "When the watch ends with exit 0, 1, 2 or 3, copy its result from that file into the body's PR checks row and replace the PR's body with `gh pr edit` again.", 'the watch result added after the watch');
  // pr-body.md names, for every row, the file that holds it, and the watch file is the one step 6 writes.
  const commands = prBodyTemplate().get('Commands');
  const from = /<!-- from: (.*?) -->/.exec(commands);
  assert.ok(from, 'Commands names its sources');
  const raw = read(`${KIT}/pr-body.md`);
  const table = raw.slice(raw.indexOf('## Commands'), raw.indexOf('\n## ', raw.indexOf('## Commands') + 1));
  const rows = table.split('\n').map((line) => /^\| ([^|]+?) \|/.exec(line)?.[1]).filter((cell) => cell && cell !== 'Check' && !/^-+$/.test(cell));
  assert.deepEqual(rows, ['Suite', 'Types', 'Perimeter', 'CI-environment suite', 'PR checks']);
  for (const row of rows) assert.ok(from[1].includes(row), `the source comment names the source of "${row}"`);
  assert.match(from[1], /Suite, Types and Perimeter: the ledger's `Check:` lines/, 'outside checks from the ledger');
  assert.match(from[1], /CI-environment suite: the ledger's line from step 2 of the ending/, 'the CI-environment run from the ledger');
  const watchFile = /its output written to `\.vibeflow\/reviews\/<feature>(-pr-checks\.txt)`/.exec(text);
  assert.ok(watchFile, 'step 6 writes the watch output to a file');
  assert.ok(from[1].includes(`\`${watchFile[1]}\``) || from[1].includes(watchFile[1]), 'PR checks come from the file step 6 writes');
  assert.match(from[1], /PR checks: [^;]*added with `gh pr edit` after the watch ends with exit 0, 1, 2 or 3/, 'PR checks added after a watch that read the PR');
  // The two not-watched values come from the ledger lines the ending writes, and the by-hand one holds with or without an origin remote.
  assert.match(from[1], /`not watched: opened by hand`: the ledger's `Ending: by hand` line, written with or without an `origin` remote/, 'the by-hand value from the ledger, both routes');
  assert.match(from[1], /`not watched: watch-pr\.mjs exit 64`: the ledger's `Ending: checks not watched` line/, 'the exit-64 value from the ledger');
});

test('pr-body.md: every section the reviewer reads before the diff', () => {
  const sections = prBodyTemplate();
  for (const name of BODY_SECTIONS) assert.ok(sections.has(name), `pr-body.md has "## ${name}"`);
  const get = (name) => sections.get(name);
  assert.match(get('Verdict per part'), /PASS/, 'a verdict per part');
  assert.match(get('Definition of Done'), /evidence/i, 'DoD with evidence');
  for (const group of ['Open', 'Closed', 'Follow-ups']) assert.match(get('Findings'), new RegExp(`\\*\\*${group}\\*\\*`), `findings: ${group}`);
  assert.match(get('Findings'), /<severity> · <cause>/, 'findings carry severity and cause');
  assert.match(get('Probes'), /contract:[^|]*regression:[^|]*missed by/, 'new probes with their three pruning answers');
  assert.match(get('Sabotage'), /survived/, 'sabotages and survivors');
  assert.match(get('Critical Gate'), /Critical Gate/, 'the Critical Gate result');
  for (const command of ['Suite', 'Types', 'Perimeter', 'CI-environment suite']) {
    assert.match(get('Commands'), new RegExp(`\\| ${command} \\|`), `commands: ${command}`);
  }
  assert.match(get('Commands'), /not possible/, 'the CI-environment row can declare the impossibility');
  assert.match(get('Commands'), /no CI/, 'the PR can say the repository has no CI');
  assert.match(get('Commands'), /the CI does not run on this PR/, 'the PR can say the CI does not run on it');
  assert.match(get('Commands'), /not watched: watch-pr\.mjs exit 64 \(<its error line>\)/, 'the PR can say the watch could not start, and why');
  assert.match(get('Commands'), /not watched: opened by hand/, 'the PR can say it was opened by hand');
  assert.ok(get('Decisions').includes('Decision: <what> — why: <reason> — cost if wrong: <cost>'), 'the Decision lines');
  assert.match(get('Follow-ups'), /follow-up/i, 'what became follow-up work');
});

test('pr-body.md: each section names the file it is filled from, and nothing comes from memory', () => {
  const content = flat(read(`${KIT}/pr-body.md`));
  assert.match(content, /never from memory/, 'never from memory');
  const sections = prBodyTemplate();
  for (const name of BODY_SECTIONS) {
    assert.match(sections.get(name), /<!-- from: [^>]+-->/, `"## ${name}" names its source`);
  }
});

// ------------------------------------------------------------------ the limits (risk code)

test('company mode: the four limits and the real-data rule, stated once in orchestrator.md, and the PR is the end', () => {
  const text = section();
  assert.ok(text.includes('The pull request is the end of the agent\'s work.'), 'the PR ends the agent\'s work');
  const limits = 'The agent never merges, never deploys, never applies a migration to a shared environment and never reads production.';
  assert.equal(count(text, limits), 1, 'the four limits, once, as one sentence');
  assert.ok(text.includes('Measurement on real data uses a staging environment or anonymized data delivered by the team.'), 'staging or anonymized data');
  // Once in the whole file: the orchestrator discipline points at the section instead of repeating them.
  const whole = flat(read(`${KIT}/orchestrator.md`));
  assert.equal(count(whole, 'merges'), 1, 'the limits are stated once in orchestrator.md');
  assert.equal(count(whole, 'reads production'), 1, 'the production read is forbidden once in orchestrator.md');
  assert.match(whole, /\* The loop's limits hold in every part, not only at its end; they are stated once, at the end of "Ending: company mode"\./, 'the discipline points at the section');
  assert.doesNotMatch(text, /gh pr merge|--auto\b|--admin\b|\bdeploy (it|the)|apply the migration|production (database|data) (to|for) /i, 'no step that merges, deploys, migrates or reads production');
});

// ------------------------------------------------------------------ the kit

test('company mode: the section is complete, with no placeholder wording', () => {
  const text = section();
  assert.doesNotMatch(text, /Until then/i, 'no "until then"');
  assert.doesNotMatch(text, /fills this section/i, 'no placeholder wording');
});

test('company mode: every script and kit file named in the section and in pr-body.md exists in the kit', () => {
  const texts = [companySection(), read(`${KIT}/pr-body.md`)];
  const scripts = new Set(texts.flatMap((text) => [...text.matchAll(/(?<![\w.-])([a-z][a-z0-9-]*\.mjs)\b/g)].map((match) => match[1])));
  for (const name of ['watch-pr.mjs', 'check-probes.mjs', 'perimeter.mjs']) assert.ok(scripts.has(name), `names ${name}`);
  for (const script of scripts) assert.ok(existsSync(join(ROOT, KIT, 'scripts', script)), `${script} exists in loop/scripts/`);
  const files = new Set(texts.flatMap((text) => [...text.matchAll(/`((?:roles\/)?[A-Za-z][\w-]*\.md)`/g)].map((match) => match[1])));
  assert.ok(files.has('pr-body.md'), 'the section names pr-body.md');
  for (const file of files) assert.ok(existsSync(join(ROOT, KIT, file)), `${file} exists in the kit`);
});

test('company mode: points at loop principles by number, and orchestrator.md stays under 250 lines', () => {
  assert.match(section(), /loop principle \d/, 'points at a principle by number');
  assert.ok(read(`${KIT}/orchestrator.md`).split('\n').length < 250, 'orchestrator.md under 250 lines');
});

test('pr-body.md is listed in the kit README and in manifest.json', () => {
  assert.match(read(`${KIT}/README.md`), /^\* `pr-body\.md`: /m, 'README lists pr-body.md');
  const manifest = JSON.parse(read(`${KIT}/manifest.json`));
  assert.ok(manifest.files.includes('pr-body.md'), 'manifest.json lists pr-body.md');
});
