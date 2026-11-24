// The gate-tech fixture: the 25 rules of the Database, Infrastructure, Kubernetes and Config
// domains of the audit's Critical Gate, each planted in several formats, with decoys, controls and
// the regression cases measured by hand in part 2a, built by make.mjs into a scratch git
// repository, and the manifest that says where each case is. The completeness of the matrix and
// the labels of each case are proved on what the generator produces, never on a list of ids
// written by hand here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATALOG_TECH_1_20,
  DECOY_KINDS,
  FORMATS,
  QUADRANT_GAPS,
  REGRESSION,
  TECH_RULES,
  casesTable,
  expandCases,
  extensionListed,
  globMatches,
  labels,
  tokenListed,
} from './fixtures/gate-tech/matrix.mjs';
import * as languages from './fixtures/gate-languages/matrix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/gate-tech');
const MAKE = join(FIXTURE, 'make.mjs');
const REVIEW_PACKAGE = join(ROOT, 'plugins/vibeflow/skills/implement/loop/scripts/review-package.mjs');

function cleanEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
}

function run(args, options = {}) {
  return spawnSync(process.execPath, args, { encoding: 'utf8', env: cleanEnv(), ...options });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

const scratch = [];
function tempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `vibeflow-gate-tech-${label}-`));
  scratch.push(dir);
  return dir;
}

let first;
let second;
let manifest;

before(() => {
  first = join(tempDir('a'), 'out');
  second = join(tempDir('b'), 'out');
  for (const dest of [first, second]) {
    const result = run([MAKE, dest]);
    assert.equal(result.status, 0, `make.mjs failed: ${result.stderr}`);
  }
  manifest = JSON.parse(readFileSync(join(first, 'manifest.json'), 'utf8'));
});

after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const repo = (dest) => join(dest, 'repo');
const matrixCases = () => manifest.filter((c) => c.language !== REGRESSION);
const planted = () => matrixCases().filter((c) => c.kind === 'planted');
const controls = () => matrixCases().filter((c) => c.kind === 'control');
const decoys = () => manifest.filter((c) => c.kind === 'decoy');
const regression = () => manifest.filter((c) => c.language === REGRESSION);
const domainOf = (rule) => CATALOG_TECH_1_20.rules[rule].domain;

function worktreeFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...worktreeFiles(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

// --- criterion 1: deterministic, two commits, refuses a non-empty destination -------------------

test('make.mjs builds the same repository and the same manifest in two runs', () => {
  assert.equal(readFileSync(join(first, 'manifest.json'), 'utf8'), readFileSync(join(second, 'manifest.json'), 'utf8'));
  assert.equal(git(repo(first), ['rev-parse', 'HEAD']), git(repo(second), ['rev-parse', 'HEAD']));
  assert.equal(git(repo(first), ['rev-parse', 'HEAD~1']), git(repo(second), ['rev-parse', 'HEAD~1']));
  const files = worktreeFiles(repo(first));
  assert.deepEqual(files, worktreeFiles(repo(second)));
  assert.ok(files.length > FORMATS.length, 'the tree has files');
  for (const file of files) {
    assert.equal(readFileSync(join(repo(first), file), 'utf8'), readFileSync(join(repo(second), file), 'utf8'), file);
  }
  assert.deepEqual(readdirSync(first).sort(), ['manifest.json', 'repo']);
});

test('the repository has exactly two commits, with a fixed author, e-mail and date', () => {
  assert.equal(git(repo(first), ['rev-list', '--count', 'HEAD']).trim(), '2');
  const people = git(repo(first), ['log', '--format=%an|%ae|%aI|%cn|%ce|%cI']).trim().split('\n');
  assert.equal(people.length, 2);
  assert.equal(new Set(people).size, 1, 'both commits share author, committer and date');
  assert.equal(git(repo(first), ['status', '--porcelain']), '', 'the worktree is the second commit');
});

test('make.mjs refuses a destination that exists and is not empty, and deletes nothing', () => {
  const dest = tempDir('busy');
  writeFileSync(join(dest, 'keep.txt'), 'keep me\n');
  mkdirSync(join(dest, 'repo'));
  writeFileSync(join(dest, 'repo', 'old.txt'), 'old\n');
  const result = run([MAKE, dest]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not empty/);
  assert.deepEqual(readdirSync(dest).sort(), ['keep.txt', 'repo']);
  assert.equal(readFileSync(join(dest, 'keep.txt'), 'utf8'), 'keep me\n');
  assert.deepEqual(readdirSync(join(dest, 'repo')), ['old.txt']);
  const file = join(tempDir('file'), 'plain.txt');
  writeFileSync(file, 'a file\n');
  const onFile = run([MAKE, file]);
  assert.notEqual(onFile.status, 0);
  assert.equal(readFileSync(file, 'utf8'), 'a file\n');
});

test('make.mjs takes an existing empty destination and refuses to run without one', () => {
  const dest = tempDir('empty');
  const result = run([MAKE, dest]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(dest, 'manifest.json')));
  const usage = run([MAKE]);
  assert.notEqual(usage.status, 0);
  assert.match(usage.stderr, /usage/);
});

// --- criterion 2: every case points at a line that holds its text --------------------------------

test('every case points at a line of the generated file that holds its snippet', () => {
  assert.ok(manifest.length > 0);
  const base = new Map();
  for (const c of manifest) {
    let lines;
    if (c.side === 'removed') {
      if (!base.has(c.path)) base.set(c.path, git(repo(first), ['show', `HEAD~1:${c.path}`]).split('\n'));
      lines = base.get(c.path);
    } else {
      lines = readFileSync(join(repo(first), c.path), 'utf8').split('\n');
    }
    assert.equal(lines[c.line - 1], c.text, `${c.id} at ${c.path}:${c.line}`);
    const start = c.line - 1 - c.snippet.indexOf(c.text);
    assert.deepEqual(lines.slice(start, start + c.snippet.length), c.snippet, `${c.id} snippet`);
  }
});

test('a removed case is gone from the change and an added case is new in it', () => {
  for (const c of manifest) {
    const now = readFileSync(join(repo(first), c.path), 'utf8').split('\n');
    const diff = git(repo(first), ['diff', 'HEAD~1', 'HEAD', '--', c.path]).split('\n');
    const sign = c.side === 'removed' ? '-' : '+';
    for (const line of c.snippet) assert.ok(diff.includes(`${sign}${line}`), `${c.id}: ${sign}${line}`);
    if (c.side === 'removed') {
      assert.ok(!now.includes(c.text), `${c.id} still has ${c.text}`);
      const block = `\n${c.snippet.join('\n')}\n`;
      assert.ok(!`\n${now.join('\n')}`.includes(block), `${c.id} still has its lines`);
    }
  }
});

test('two cases of one file sit at least 5 lines apart, and no file mixes added and removed cases', () => {
  const byFile = new Map();
  for (const c of manifest) {
    const key = `${c.path}|${c.side}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(c.line);
  }
  for (const [key, lines] of byFile) {
    lines.sort((a, b) => a - b);
    for (let i = 1; i < lines.length; i += 1) assert.ok(lines[i] - lines[i - 1] >= 5, `${key}: ${lines[i - 1]} and ${lines[i]}`);
  }
  for (const c of manifest) {
    const others = manifest.filter((o) => o.path === c.path && o.side !== c.side);
    assert.deepEqual(others, [], `${c.path} mixes added and removed cases`);
  }
});

test('every case lives under a top folder named after its format, so a format is one diff path', () => {
  const ids = new Set(FORMATS.map((f) => f.id));
  assert.ok(ids.has(REGRESSION));
  for (const c of manifest) {
    assert.ok(ids.has(c.language), `${c.id}: unknown format ${c.language}`);
    assert.ok(c.path.startsWith(`${c.language}/`), `${c.id}: ${c.path} is not under ${c.language}/`);
  }
  // Each format's diff holds exactly the files of its cases and nothing of another format.
  const tree = worktreeFiles(repo(first));
  for (const file of tree) assert.ok(ids.has(file.split('/')[0]), `${file} is outside every format folder`);
});

test('every manifest entry has the fields of the gate-languages manifest, and ids are unique', () => {
  const fields = ['id', 'kind', 'rule', 'language', 'extension', 'variant', 'decoyKind', 'path', 'line', 'side', 'extensionListed', 'tokenListed', 'origin'];
  for (const c of manifest) {
    for (const field of fields) assert.ok(field in c, `${c.id ?? '?'} lacks ${field}`);
    assert.ok(['planted', 'decoy', 'control'].includes(c.kind), c.id);
    assert.ok(['added', 'removed'].includes(c.side));
    assert.equal(c.extension, extname(c.path), c.id);
    if (c.kind === 'decoy') {
      assert.ok(DECOY_KINDS.includes(c.decoyKind));
      assert.equal(c.side, 'added');
    } else {
      assert.equal(c.decoyKind, null);
    }
    if (c.language === REGRESSION) assert.ok(typeof c.origin === 'string' && c.origin.length > 0, c.id);
    else {
      assert.equal(c.origin, null, c.id);
      // A row delete is filed under DAT101, the rule the regression table gives it, and not under a
      // rule of the four domains whose behaviour it is not (conserto 1 of part 2b-1).
      assert.ok(TECH_RULES.includes(c.rule) || (c.rule === 'DAT101' && c.kind === 'planted'), `${c.id}: ${c.rule}`);
    }
    assert.ok(typeof c.why === 'string' && c.why.length > 10, `${c.id} has a justification`);
    assert.ok(c.snippet.length >= 1 && c.snippet.length <= 4, `${c.id}: 1 to 4 lines`);
  }
  assert.equal(new Set(manifest.map((c) => c.id)).size, manifest.length);
  assert.deepEqual(manifest, expandCases(), 'the manifest is the matrix expanded');
});

// --- criterion 3: completeness, proved on the product ------------------------------------------

test('every one of the 25 rules has at least three planted cases in three formats, and a control', () => {
  assert.equal(TECH_RULES.length, 25);
  for (const rule of TECH_RULES) {
    const cases = planted().filter((c) => c.rule === rule);
    assert.ok(cases.length >= 3, `${rule}: ${cases.length} planted`);
    assert.ok(new Set(cases.map((c) => c.language)).size >= 3, `${rule}: formats ${[...new Set(cases.map((c) => c.language))]}`);
    assert.ok(controls().some((c) => c.rule === rule), `${rule} has no control`);
  }
});

test('every rule covers the three quadrants the spec asks for, or says why it cannot', () => {
  const wanted = {
    both: (c) => c.extensionListed && c.tokenListed,
    formatOff: (c) => !c.extensionListed,
    wordOff: (c) => !c.tokenListed,
  };
  for (const rule of TECH_RULES) {
    const cases = planted().filter((c) => c.rule === rule);
    for (const [quadrant, holds] of Object.entries(wanted)) {
      const reason = QUADRANT_GAPS[rule]?.[quadrant];
      if (reason) {
        assert.ok(!cases.some(holds), `${rule} ${quadrant} is both covered and excused`);
        assert.ok(reason.length > 20, `${rule} ${quadrant} reason`);
      } else {
        assert.ok(cases.some(holds), `${rule} has no case for ${quadrant}`);
      }
    }
  }
  for (const [rule, gaps] of Object.entries(QUADRANT_GAPS)) {
    assert.ok(TECH_RULES.includes(rule), rule);
    for (const quadrant of Object.keys(gaps)) assert.ok(Object.keys(wanted).includes(quadrant), `${rule} ${quadrant}`);
  }
});

test('planted cases follow the scope of their rule: removed for r, added for a, both sides for b', () => {
  for (const c of planted()) {
    const { scope } = CATALOG_TECH_1_20.rules[c.rule] ?? languages.CATALOG_1_20.rules[c.rule];
    if (scope === 'r') assert.equal(c.side, 'removed', c.id);
    if (scope === 'a') assert.equal(c.side, 'added', c.id);
  }
  for (const rule of TECH_RULES.filter((r) => CATALOG_TECH_1_20.rules[r].scope === 'b')) {
    const sides = new Set(planted().filter((c) => c.rule === rule).map((c) => c.side));
    assert.deepEqual([...sides].sort(), ['added', 'removed'], rule);
  }
  assert.equal(CATALOG_TECH_1_20.rules.IAC103.scope, 'b');
  for (const c of controls()) assert.equal(c.side, 'added', c.id);
});

test('every format with a planted case has the three decoy kinds in each domain it is planted in', () => {
  // The decoys are asked for in the four domains; a DAT101 case of the matrix asks for none.
  const pairs = new Set(planted().filter((c) => TECH_RULES.includes(c.rule)).map((c) => `${c.language}|${domainOf(c.rule)}`));
  assert.ok(pairs.size >= 10);
  for (const pair of pairs) {
    const [format, domain] = pair.split('|');
    const kinds = decoys().filter((c) => c.language === format && domainOf(c.rule) === domain).map((c) => c.decoyKind).sort();
    assert.deepEqual(kinds, [...DECOY_KINDS].sort(), pair);
  }
  for (const c of decoys()) assert.ok(pairs.has(`${c.language}|${domainOf(c.rule)}`), `${c.id} has no planted case beside it`);
});

test('every decoy holds the trigger word of the rule it is filed under, by tokenListed', () => {
  for (const c of decoys()) {
    assert.equal(c.tokenListed, true, `${c.id}: ${c.text}`);
    assert.equal(tokenListed(c.rule, c.snippet.join('\n')), true, c.id);
  }
});

test('the formats include the minimum of the spec', () => {
  const byId = Object.fromEntries(FORMATS.map((f) => [f.id, f]));
  const has = (pred, what) => assert.ok(FORMATS.some(pred), what);
  has((f) => f.extension === '.sql', 'SQL in a .sql file');
  for (const id of ['app-sql', 'django-migration', 'rails-migration', 'liquibase', 'terraform', 'cloudformation', 'pulumi', 'k8s-manifest', 'helm', 'compose', 'ecs-task', 'docker-run', 'config-yaml', 'config-json', 'dotenv', 'ini', 'nginx', 'dockerfile', 'config-code', REGRESSION]) {
    assert.ok(byId[id], id);
  }
  // SQL in application code sits outside any migrations folder.
  for (const c of manifest.filter((m) => m.language === 'app-sql')) assert.doesNotMatch(c.path, /migrat/, c.id);
});

// The 25 rules of the four domains as the 1.20.0 tag writes them, read by structure: the rows of
// the tables between the `_Database_` heading and the `_Data_` heading, without the Security domain
// that sits among them (the gate-languages fixture covers it).
function rulesOfTag(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^\s*_Database_ — files:/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^\s*_Data_ — files:/.test(l));
  assert.ok(start >= 0 && end > start, 'the tag has the Database and Data headings');
  const domains = {};
  const rules = [];
  let domain = null;
  for (const line of lines.slice(start, end)) {
    const heading = line.match(/^\s*_([^_]+)_ — files: (.*)$/);
    if (heading) {
      domain = heading[1];
      if (domain !== 'Security') domains[domain] = heading[2].trim();
      continue;
    }
    if (domain === 'Security') continue;
    const row = line.match(/^\s*\| ([A-Z0-9]+\d) \| ([A-Z]+) \| ([arb]) \| (.*) \|\s*$/);
    if (row) rules.push({ id: row[1], severity: row[2], scope: row[3], trigger: row[4], domain });
  }
  return { domains, rules };
}

const hasTag = spawnSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/v1.20.0'], { cwd: ROOT, encoding: 'utf8', env: cleanEnv() }).status === 0;

// Written by hand from the 1.20.0 catalog: used only when this clone has no v1.20.0 tag (the CI
// checks out without tags).
const RULES_1_20_BY_HAND = [
  ['DS101', 'CRITICAL', 'a'], ['DS102', 'CRITICAL', 'a'], ['DS103', 'CRITICAL', 'a'], ['DS104', 'HIGH', 'a'],
  ['DS105', 'HIGH', 'a'], ['DS106', 'HIGH', 'a'], ['DS108', 'WARNING', 'a'], ['DS110', 'INFO', 'a'],
  ['IAC101', 'CRITICAL', 'a'], ['IAC102', 'CRITICAL', 'a'], ['IAC103', 'HIGH', 'b'], ['IAC104', 'HIGH', 'r'],
  ['IAC105', 'WARNING', 'a'], ['IAC106', 'WARNING', 'a'],
  ['K8S101', 'HIGH', 'a'], ['K8S102', 'HIGH', 'a'], ['K8S103', 'HIGH', 'a'], ['K8S104', 'HIGH', 'a'],
  ['K8S105', 'WARNING', 'a'], ['K8S106', 'WARNING', 'a'],
  ['CFG101', 'HIGH', 'a'], ['CFG102', 'WARNING', 'a'], ['CFG103', 'WARNING', 'a'], ['CFG104', 'WARNING', 'a'],
  ['CFG105', 'INFO', 'r'],
];

const frozen = () => TECH_RULES.map((id) => [id, CATALOG_TECH_1_20.rules[id].severity, CATALOG_TECH_1_20.rules[id].scope]);

if (hasTag) {
  test('CATALOG_TECH_1_20 holds the 25 rules of the four domains of the v1.20.0 tag, with the same id, severity, scope, trigger and file line', () => {
    const text = git(ROOT, ['show', 'v1.20.0:plugins/vibeflow/skills/audit/SKILL.md']);
    const tag = rulesOfTag(text);
    assert.equal(tag.rules.length, 25);
    assert.deepEqual(frozen(), tag.rules.map((r) => [r.id, r.severity, r.scope]));
    // The table for a clone without the tag says the same.
    assert.deepEqual(RULES_1_20_BY_HAND, tag.rules.map((r) => [r.id, r.severity, r.scope]));
    for (const r of tag.rules) {
      const mine = CATALOG_TECH_1_20.rules[r.id];
      assert.equal(mine.trigger, r.trigger, r.id);
      assert.equal(CATALOG_TECH_1_20.domains[mine.domain].heading, r.domain, r.id);
    }
    for (const [heading, files] of Object.entries(tag.domains)) {
      const domain = Object.values(CATALOG_TECH_1_20.domains).find((d) => d.heading === heading);
      assert.ok(domain, heading);
      assert.equal(domain.files, files, heading);
    }
  });
} else {
  test('CATALOG_TECH_1_20 holds 25 rules with the id, severity and scope of the 1.20.0 catalog (no v1.20.0 tag in this clone: compared with the table written in this test)', () => {
    assert.deepEqual(frozen(), RULES_1_20_BY_HAND);
  });
}

// --- criterion 4: the labels come from CATALOG_TECH_1_20 by function ----------------------------

test('every label in the manifest is what the functions compute', () => {
  for (const c of manifest) {
    assert.deepEqual({ extensionListed: c.extensionListed, tokenListed: c.tokenListed }, labels(c.rule, c.path, c.snippet.join('\n')), c.id);
    if (TECH_RULES.includes(c.rule)) {
      assert.equal(c.extensionListed, extensionListed(c.rule, c.path), c.id);
      assert.equal(c.tokenListed, tokenListed(c.rule, c.snippet.join('\n')), c.id);
    } else {
      // A Security or Data rule of a regression case is labelled by the gate-languages catalog.
      assert.equal(c.extensionListed, languages.extensionListed(c.extension), c.id);
      assert.equal(c.tokenListed, languages.tokenListed(c.rule, c.snippet.join('\n')), c.id);
    }
  }
});

test('the four quadrants hold planted cases of the matrix, and the functions place each one', () => {
  for (const e of [true, false]) {
    for (const t of [true, false]) {
      const cases = planted().filter((c) => TECH_RULES.includes(c.rule) && c.extensionListed === e && c.tokenListed === t);
      assert.ok(cases.length > 0, `quadrant ${e}/${t}`);
      for (const c of cases.slice(0, 3)) {
        assert.equal(extensionListed(c.rule, c.path), e, `${c.id} extension`);
        assert.equal(tokenListed(c.rule, c.snippet.join('\n')), t, `${c.id} token`);
      }
    }
  }
});

test('the glob forms of the 1.20.0 file lines', () => {
  assert.equal(globMatches('**/migrations/*', 'billing/migrations/0007_x.py'), true);
  assert.equal(globMatches('**/migrations/*', 'db/migrate/20261102_x.rb'), false);
  assert.equal(globMatches('**/migrations/*', 'django-migration/billing/migrations/0007_x.py'), true);
  assert.equal(globMatches('**/migrations/*', 'migrations/0001_initial.py'), true);
  assert.equal(globMatches('**/migrations/*', 'billing/migrations/sub/0007_x.py'), false);
  assert.equal(globMatches('*.sql', 'sql/db/scripts/cleanup.sql'), true);
  assert.equal(globMatches('*.sql', 'sql/db/scripts/cleanup.sql.bak'), false);
  assert.equal(globMatches('*.tf', 'terraform/main.tf'), true);
  assert.equal(globMatches('*.yml', 'compose/docker-compose.yaml'), false);
  assert.equal(globMatches('Dockerfile', 'dockerfile/images/api/Dockerfile'), true);
  const db = (path) => extensionListed('DS102', path);
  assert.equal(db('django-migration/billing/migrations/0007_remove_invoice.py'), true);
  assert.equal(db('rails-migration/db/migrate/20261102000001_drop_orders.rb'), false);
  assert.equal(db('sql/db/scripts/cleanup.sql'), true);
  assert.equal(db('liquibase/db/changelog/changes/007-orders.xml'), false);
  assert.equal(extensionListed('IAC101', 'terraform/modules/storage/main.tf'), true);
  assert.equal(extensionListed('IAC101', 'terragrunt/live/prod/terragrunt.hcl'), true);
  assert.equal(extensionListed('IAC101', 'cloudformation/templates/storage.yaml'), false);
  assert.equal(extensionListed('K8S101', 'k8s-manifest/deploy/agent.yaml'), true);
  assert.equal(extensionListed('K8S101', 'compose/docker-compose.yml'), true);
  assert.equal(extensionListed('K8S101', 'ecs-task/deploy/agent-task.json'), false);
  // Config: YAML, JSON, TOML, Dockerfiles and any source-code file.
  for (const path of ['config-yaml/config/application.yml', 'config-json/config/production.json', 'x/pyproject.toml', 'dockerfile/images/api/Dockerfile', 'config-code/src/server.js', 'x/app/settings.py']) {
    assert.equal(extensionListed('CFG101', path), true, path);
  }
  for (const path of ['nginx/conf.d/api.conf', 'dotenv/deploy/production.env', 'ini/php/conf.d/app.ini', 'x/application.properties']) {
    assert.equal(extensionListed('CFG101', path), false, path);
  }
});

test('tokenListed finds the trigger word of the rule as a word, in any case, and not a spelling of it', () => {
  const yes = [
    ['DS101', 'DROP DATABASE IF EXISTS analytics;'],
    ['DS102', 'migrations.RunSQL("drop table billing_invoice_archive")'],
    ['DS103', 'TRUNCATE sessions;'],
    ['DS105', 'ALTER TABLE events DROP PARTITION p1;'],
    ['DS106', 'cursor.execute("DELETE FROM carts")'],
    ['DS108', 'ALTER TABLE orders RENAME TO purchases;'],
    ['DS110', 'ALTER TABLE invoices MODIFY amount INT;'],
    ['IAC101', '  force_destroy = true'],
    ['IAC101', '  forceDestroy: true,'],
    ['IAC103', 'resource "aws_iam_role_policy" "ci" {'],
    ['IAC104', 'resource "google_compute_firewall" "deny_ssh" {'],
    ['IAC105', '    cidr_blocks = ["0.0.0.0/0"]'],
    ['IAC106', '  publicly_accessible = true'],
    ['K8S101', '        privileged: true'],
    ['K8S102', '      hostPath:'],
    ['K8S105', '          add: ["SYS_ADMIN"]'],
    ['CFG101', '            Access-Control-Allow-Origin: "*"'],
    ['CFG102', 'APP_DEBUG=true'],
    ['CFG103', '    root: DEBUG'],
    ['CFG104', 'EXPOSE 5432'],
    ['CFG105', '      connection-timeout: 30000'],
  ];
  const no = [
    ['DS102', '    drop_table :orders'],
    ['DS102', '<dropTable tableName="orders"/>'],
    ['DS104', '    remove_column :users, :legacy_email'],
    ['IAC104', '  vpc_security_group_ids = [aws_security_group.db.id]'],
    ['IAC105', '    ipv6_cidr_blocks = ["::/0"]'],
    ['K8S101', '      "privileged": true,'],
    ['K8S103', '  runAsUser: 1000'],
    ['CFG101', 'add_header Access-Control-Allow-Origin *;'],
    ['CFG102', '  "debug": true,'],
    ['CFG104', '      - "15432:8080"'],
    ['CFG104', 'EXPOSE 8080'],
  ];
  for (const [rule, line] of yes) assert.equal(tokenListed(rule, line), true, `${rule}: ${line}`);
  for (const [rule, line] of no) assert.equal(tokenListed(rule, line), false, `${rule}: ${line}`);
});

// --- criterion 6: the regression cases, one by one, by the table of their origin ----------------

// The table of the spec (part 2b-1, the regression cases): origin, a fragment that names the line,
// the rule and what is expected.
const REGRESSION_TABLE = [
  ['bulk-delete-narrowing', 'Session.where("expires_at < ?", cutoff).delete_all', 'DAT101', 'planted'],
  ['bulk-delete-narrowing', 'Account.where(plan: "trial").destroy_all', 'DAT101', 'planted'],
  ['bulk-delete-narrowing', 'Invoice.objects.filter(status="void").delete()', 'DAT101', 'planted'],
  ['bulk-delete-narrowing', 'prisma.event.deleteMany({ where: { tenantId } })', 'DAT101', 'planted'],
  ['bulk-delete-narrowing', 'ExecuteDeleteAsync()', 'DAT101', 'planted'],
  ['bulk-delete-narrowing', 'find "$CACHE_DIR" -type f -mtime +30 -delete', 'DAT101', 'planted'],
  ['bulk-delete-narrowing', 'User.find(params[:id]).destroy', 'DAT101', 'control'],
  ['bulk-delete-narrowing', 'prisma.user.delete({ where: { id } })', 'DAT101', 'control'],
  ['bulk-delete-narrowing', 'subprocess.call(["git", "fetch", "--all"])', 'SEC108', 'control'],
  ['bulk-delete-narrowing', 'os.system("make build")', 'SEC108', 'control'],
  ['bulk-delete-narrowing', 'crm.post("/contacts", { name: user.name, cpf: user.cpf })', 'DAT102', 'planted'],
  ['delete-controls', 'cart.getItems().removeAll(expiredItems)', 'DAT101', 'control'],
  ['delete-controls', 'sessionCache.clear()', 'DAT101', 'control'],
  ['delete-controls', 'pending_jobs.clear()', 'DAT101', 'control'],
  ['delete-controls', 'DELETE FROM users WHERE id = $1', 'DAT101', 'control'],
  ['delete-controls', 'update_all(deleted_at: Time.current)', 'DAT101', 'control'],
  ['delete-controls', 'redis_client.delete(f"upload:{bucket}:lock")', 'DAT101', 'control'],
  ['delete-controls', 'DELETE FROM messages WHERE created_at < $1', 'DAT101', 'planted'],
  ['delete-controls', 's3.delete_objects(', 'DAT101', 'planted'],
  ['delete-controls', 'redis_client.flushdb()', 'DAT101', 'planted'],
  ['shared-cache', 'es.deleteByQuery(', 'DAT101', 'planted'],
  ['generated-migration', 'migrations.RunSQL("DROP TABLE billing_invoice_archive")', 'DS102', 'planted'],
  ['literal-personal-data', '"cpf": "286.455.970-14", "card_number"', 'DAT102', 'planted'],
  ['literal-personal-data', 'Rui Antunes,rui.antunes@example.net,905.317.482-06', 'DAT102', 'planted'],
  ['literal-personal-data', 'CPF_FORMAT = /', 'DAT102', 'control'],
  ['literal-personal-data', 'The `cpf` column takes the 11 digits', 'DAT102', 'control'],
];

test('every row of the regression table is one case with its origin, rule and expected kind, and there is no other', () => {
  const seen = new Set();
  for (const [origin, fragment, rule, expected] of REGRESSION_TABLE) {
    const hits = regression().filter((c) => c.origin === origin && c.text.includes(fragment));
    assert.equal(hits.length, 1, `${origin}: ${fragment} (${hits.length} cases)`);
    const [c] = hits;
    assert.equal(c.rule, rule, c.id);
    assert.equal(c.kind, expected, c.id);
    assert.ok(c.path.startsWith(`${REGRESSION}/${origin}/`), c.id);
    seen.add(c.id);
  }
  assert.deepEqual(regression().filter((c) => !seen.has(c.id)).map((c) => c.id), [], 'cases outside the table');
});

test('the regression cases left open by the spec are not cases', () => {
  for (const text of ['Rails.cache.clear', 'cache.clear()', 'flush_all', 'cpf { "000.000.000-00" }']) {
    assert.deepEqual(regression().filter((c) => c.text.includes(text) && !c.text.includes('sessionCache')).map((c) => c.id), [], text);
  }
});

test('the project marks the migration of generated-migration as generated, as in the measured case', () => {
  const attributes = readFileSync(join(repo(first), REGRESSION, 'generated-migration', '.gitattributes'), 'utf8');
  assert.match(attributes, /^\*\/migrations\/\*\.py linguist-generated=true$/m);
  const c = regression().find((r) => r.rule === 'DS102');
  const rel = c.path.slice(`${REGRESSION}/generated-migration/`.length);
  const attr = git(join(repo(first), REGRESSION, 'generated-migration'), ['check-attr', 'linguist-generated', '--', rel]);
  assert.match(attr, /linguist-generated: true/);
  assert.equal(c.extensionListed, true);
  assert.equal(c.tokenListed, true);
});

// --- criterion 8: no versioned file of the fixture is withheld by the review package -----------

test('the review package of the versioned fixture files carries no WITHHELD list', () => {
  const dir = tempDir('package');
  const work = join(dir, 'repo');
  mkdirSync(work);
  git(work, ['init', '-q', '-b', 'main']);
  git(work, ['config', 'user.name', 'Fixture']);
  git(work, ['config', 'user.email', 'fixture@example.invalid']);
  git(work, ['config', 'commit.gpgsign', 'false']);
  git(work, ['commit', '-q', '--allow-empty', '-m', 'base']);
  const base = git(work, ['rev-parse', 'HEAD']).trim();
  cpSync(FIXTURE, join(work, 'test/fixtures/gate-tech'), { recursive: true });
  for (const name of ['gate-tech-fixture.test.mjs', 'gate-languages-measure.test.mjs']) {
    if (existsSync(join(ROOT, 'test', name))) cpSync(join(ROOT, 'test', name), join(work, 'test', name));
  }
  cpSync(join(ROOT, 'test/fixtures/gate-languages/measure.mjs'), join(work, 'test/fixtures/gate-languages/measure.mjs'));
  cpSync(join(ROOT, 'test/README.md'), join(work, 'test/README.md'));
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'fixture']);
  const out = join(dir, 'package.md');
  const result = run([REVIEW_PACKAGE, work, base, out]);
  assert.equal(result.status, 0, result.stderr);
  const text = readFileSync(out, 'utf8');
  assert.doesNotMatch(text, /^WITHHELD/m);
  assert.match(text, /^\+export const CATALOG_TECH_1_20/m, 'the matrix diff is in the package');

  // Control: the same package over a file that holds a generated secret line of the gate-languages
  // fixture is withheld, so the detector is live and the clean result above is not an accident.
  const sec104 = languages.expandCases().find((c) => c.rule === 'SEC104' && c.language === 'python' && c.variant === 'catalog');
  writeFileSync(join(work, 'settings.py'), `${sec104.text}\n`);
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'control']);
  const control = join(dir, 'control.md');
  assert.equal(run([REVIEW_PACKAGE, work, base, control]).status, 0);
  assert.match(readFileSync(control, 'utf8'), /^WITHHELD: 1 file/m);
});

// --- fix 3 of part 2b: planted cases that are the behaviour of their rule (review 1 of PR 69) ----

const changed = (c) => readFileSync(join(repo(first), c.path), 'utf8');

test('a planted DS101 case drops a database, and a schema dropped stands for a database only in MySQL, with no CASCADE', () => {
  const cases = planted().filter((c) => c.rule === 'DS101');
  assert.ok(cases.length >= 3);
  for (const c of cases) {
    // DROP DATABASE, dropDatabase(), or a DROP SCHEMA run only on MySQL, where a schema is a database.
    assert.match(c.text, /\bDROP\s+(?:DATABASE|SCHEMA)\b|\bdrop_?database\b/i, c.id);
    if (/\bDROP\s+SCHEMA\b/i.test(c.text)) {
      assert.doesNotMatch(c.text, /\bCASCADE\b/i, `${c.id}: CASCADE is the PostgreSQL form, where a schema is not a database`);
      const file = changed(c).split('\n');
      const changeSet = file.slice(0, c.line).reverse().find((line) => /<changeSet\b/.test(line));
      assert.ok(changeSet, `${c.id}: the changeSet of the line`);
      assert.match(changeSet, /\bdbms="mysql"/, `${c.id}: DROP SCHEMA drops a database only in MySQL`);
    }
  }
});

test('a planted IAC106 case makes a resource reachable from the internet, not only lifts a block on it', () => {
  const BLOCK = /\b(?:block_public_acls|block_public_policy|ignore_public_acls|restrict_public_buckets|BlockPublic\w*|IgnorePublicAcls|RestrictPublicBuckets)\b/;
  for (const c of planted().filter((p) => p.rule === 'IAC106')) {
    assert.doesNotMatch(c.text, BLOCK, `${c.id}: lifting a public access block grants no public access`);
  }
  // The storage bucket of the Terraform module is made readable by anyone, in the same format.
  const bucket = planted().find((c) => c.rule === 'IAC106' && c.language === 'terraform' && c.path.includes('/storage/'));
  assert.ok(bucket, 'the IAC106 storage case in Terraform');
  assert.match(bucket.text, /\bacl\s*=\s*"public-read(?:-write)?"|"Principal"\s*:\s*"\*"|Principal\s*=\s*"\*"/, bucket.id);
});

test('every host volume of an ECS task definition is mounted by a container of the task', () => {
  const files = [...new Set(manifest.filter((c) => c.language === 'ecs-task').map((c) => c.path))];
  assert.ok(files.length > 0);
  let hostVolumes = 0;
  for (const path of files) {
    const task = JSON.parse(readFileSync(join(repo(first), path), 'utf8'));
    const mounted = new Set((task.containerDefinitions ?? []).flatMap((d) => (d.mountPoints ?? []).map((m) => m.sourceVolume)));
    for (const volume of task.volumes ?? []) {
      if (!volume.host?.sourcePath) continue;
      hostVolumes += 1;
      assert.ok(mounted.has(volume.name), `${path}: the host volume ${volume.name} is mounted by no container`);
    }
  }
  assert.ok(hostVolumes > 0, 'the K8S102 case declares a host volume');
});

// --- fix 3 of part 2b: the personal data of the fixture is synthetic -----------------------------

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

test('the e-mails of the fixture are at reserved example domains, and its card number is the test number', () => {
  const sources = ['matrix.mjs', 'README.md'].map((name) => [name, readFileSync(join(FIXTURE, name), 'utf8')]);
  sources.push(['manifest', manifest.map((c) => c.text).join('\n')]);
  let emails = 0;
  let cards = 0;
  for (const [name, text] of sources) {
    for (const [, domain] of text.matchAll(/[\w.+-]+@((?:[\w-]+\.)+[a-z]{2,})\b/gi)) {
      // A Google Cloud service account of a made-up project is an identity, not a mailbox.
      if (/^acme-[\w-]+\.iam\.gserviceaccount\.com$/i.test(domain)) continue;
      emails += 1;
      assert.match(domain.toLowerCase(), /^(?:example\.(?:com|org|net)|[\w.-]+\.(?:example|invalid|test))$/, `${name}: ${domain} is not a reserved domain`);
    }
    for (const [number] of text.matchAll(/\b\d(?:[ -]?\d){12,18}\b/g)) {
      const digits = number.replace(/\D/g, '');
      if (!luhn(digits)) continue;
      cards += 1;
      assert.equal(digits, '4111111111111111', `${name}: ${number} passes the card checksum and is not the test number`);
    }
  }
  assert.ok(emails > 0 && cards > 0, `the check read e-mails (${emails}) and a card (${cards})`);
});

// --- the README table is generated from the matrix ---------------------------------------------

test('the README carries the table of cases the matrix generates', () => {
  const readme = readFileSync(join(FIXTURE, 'README.md'), 'utf8');
  const start = readme.indexOf('<!-- cases:start -->');
  const end = readme.indexOf('<!-- cases:end -->');
  assert.ok(start >= 0 && end > start, 'the README has the cases markers');
  const table = readme.slice(start + '<!-- cases:start -->'.length, end).trim();
  assert.equal(table, casesTable().trim());
  for (const c of manifest) assert.ok(table.includes(`| ${c.id} |`), c.id);
});
