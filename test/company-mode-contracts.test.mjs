// Contracts of the 1.16 company mode (part 4): the "Ending: company mode" section of
// the loop kit's orchestrator.md and the PR body template loop/pr-body.md. The limits
// (merge, deploy, shared migration, production read) are the part's risk code, so they
// are pinned by their whole predicate, and the order of the ending (CI-environment suite,
// push, PR, watch) by position, not by the presence of words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ------------------------------------------------------------------ DoD 1

test('company mode: the suite runs in the CI\'s environment, at the CI\'s checkout depth, or the PR says it could not', () => {
  const text = section();
  assert.match(text, /Read the CI configuration[^.]*how it checks out the code/, 'reads the CI configuration, checkout included');
  assert.match(text, /When the dev machine differs from it, run the suite in the CI's environment before the push/, 'the CI-environment suite before the push');
  assert.match(text, /container of the CI image with the network off/, 'the container example, network off');
  assert.match(text, /clone as shallow as the CI's checkout/, 'a clone as shallow as the CI checks out');
  assert.match(text, /A red run there blocks the push/, 'a red CI-environment run blocks the push');
  assert.match(text, /When that run is not possible[^.]*the PR body says so/, 'the impossibility is declared in the PR');
});

test('company mode: draft or ready by the repository\'s convention, asked once when there is none', () => {
  const text = section();
  assert.match(text, /Draft or ready, by the repository's convention: its pull request template, its CONTRIBUTING file, or the human's answer recorded as a `Decision:` line/, 'the three sources of the convention');
  assert.match(text, /With no convention found, ask the human once and record the answer as a `Decision:` line/, 'asked once and recorded');
  assert.match(text, /`gh pr create [^`]*`[^.]*adding `--draft` when the convention says draft/, 'gh pr create, --draft by convention');
});

test('company mode: watch-pr.mjs waits for the checks, its result goes to the final report, and a repository with no CI skips it', () => {
  const text = section();
  assert.match(text, /With CI, run `watch-pr\.mjs` with `--repo <owner\/repo> --pr <number>` in the background/, 'watch-pr with its arguments');
  assert.match(text, /A repository with no CI skips `watch-pr\.mjs`, because on a PR with no check it waits until its ceiling/, 'the skip and its reason');
  assert.match(text, /the PR body says it has no CI/, 'the PR says there is no CI');
  assert.match(text, /final report[^.]*the checks' result from `watch-pr\.mjs`/, 'the checks\' result in the final report');
});

test('company mode: the ending runs in order, CI-environment suite, push, PR, watch', () => {
  const text = section();
  const steps = [
    "run the suite in the CI's environment",
    '`git push',
    '`gh pr create',
    'With CI, run `watch-pr.mjs`',
  ];
  const at = steps.map((step) => text.indexOf(step));
  steps.forEach((step, i) => assert.ok(at[i] !== -1, `the section has "${step}"`));
  for (let i = 1; i < at.length; i += 1) assert.ok(at[i - 1] < at[i], `"${steps[i - 1]}" comes before "${steps[i]}"`);
});

// ------------------------------------------------------------------ DoD 2

test('company mode: the PR body is pr-body.md, filled from the files and never from memory', () => {
  const text = section();
  assert.match(text, /Fill `pr-body\.md` from the ledger, the audit and re-audit reports in `\.vibeflow\/audits\/` and the progress files in `\.vibeflow\/progress\/`, never from memory/, 'the three sources, never memory');
  assert.match(text, /a line the files do not support stays out/, 'an unsupported line stays out');
  assert.ok(text.includes('--body-file .vibeflow/reviews/<feature>-pr-body.md'), 'the PR is opened with the filled body');
});

test('pr-body.md: every section of the spec\'s DoD 2', () => {
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

// ------------------------------------------------------------------ DoD 3 (risk code)

test('company mode: the four limits and the real-data rule, stated once, and the PR is the end', () => {
  const text = section();
  assert.ok(text.includes('The pull request is the end of the agent\'s work.'), 'the PR ends the agent\'s work');
  const limits = 'The agent never merges, never deploys, never applies a migration to a shared environment and never reads production.';
  assert.equal(count(text, limits), 1, 'the four limits, once, as one sentence');
  assert.ok(text.includes('Measurement on real data uses a staging environment or anonymized data delivered by the team.'), 'staging or anonymized data');
  assert.equal(count(text, 'never merges'), 1, 'the limits are stated once in the section');
  assert.doesNotMatch(text, /gh pr merge|--auto\b|--admin\b|\bdeploy (it|the)|apply the migration|production (database|data) (to|for) /i, 'no step that merges, deploys, migrates or reads production');
});

// ------------------------------------------------------------------ DoD 4 and 5

test('company mode: the part 3 placeholder is gone', () => {
  const text = section();
  assert.doesNotMatch(text, /part 4/i, 'no "part 4 fills this section"');
  assert.doesNotMatch(text, /Until then/i, 'no "until then"');
  assert.doesNotMatch(text, /fills this section/i, 'no placeholder wording');
});

test('company mode: every script and kit file named in the section and in pr-body.md exists in the kit', () => {
  const texts = [companySection(), read(`${KIT}/pr-body.md`)];
  const scripts = new Set(texts.flatMap((text) => [...text.matchAll(/(?<![\w.-])([a-z][a-z0-9-]*\.mjs)\b/g)].map((match) => match[1])));
  for (const name of ['watch-pr.mjs', 'check-probes.mjs']) assert.ok(scripts.has(name), `names ${name}`);
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
