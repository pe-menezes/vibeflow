// The gate-languages fixture: the same dangerous behaviours written in 13 languages, with decoys,
// built by make.mjs into a scratch git repository, and the manifest that says where each case is.
// The completeness of the matrix and the labels of each case are proved on what the generator
// produces, never on a list written by hand here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATALOG_1_20,
  DECOY_KINDS,
  FAKE_VALUE,
  LANGUAGES,
  NOT_APPLICABLE,
  RULES,
  TERM_ECOSYSTEMS,
  casesTable,
  ecosystemTerms,
  expandCases,
  extensionListed,
  tokenListed,
} from './fixtures/gate-languages/matrix.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test/fixtures/gate-languages');
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
  const dir = mkdtempSync(join(tmpdir(), `vibeflow-gate-languages-${label}-`));
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
const planted = () => manifest.filter((c) => c.kind === 'planted');
const decoys = () => manifest.filter((c) => c.kind === 'decoy');

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
  assert.ok(files.length > LANGUAGES.length, 'the tree has files');
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
    if (c.side === 'removed') for (const line of c.snippet) assert.ok(!now.includes(line), `${c.id} still has ${line}`);
  }
});

test('two cases of one file sit at least 5 lines apart, so a finding can only be near one', () => {
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

test('every manifest entry has the fields of the spec, and ids are unique', () => {
  const fields = ['id', 'kind', 'rule', 'language', 'extension', 'variant', 'decoyKind', 'path', 'line', 'side', 'extensionListed', 'tokenListed'];
  for (const c of manifest) {
    for (const field of fields) assert.ok(field in c, `${c.id ?? '?'} lacks ${field}`);
    assert.ok(['planted', 'decoy'].includes(c.kind));
    assert.ok(['added', 'removed'].includes(c.side));
    assert.ok(RULES.includes(c.rule), c.rule);
    assert.ok(c.path.endsWith(c.extension), c.path);
    if (c.kind === 'decoy') {
      assert.ok(DECOY_KINDS.includes(c.decoyKind));
      assert.equal(c.side, 'added');
    } else {
      assert.equal(c.decoyKind, null);
      assert.equal(c.side, CATALOG_1_20.rules[c.rule].scope === 'r' ? 'removed' : 'added', c.id);
    }
    assert.ok(typeof c.why === 'string' && c.why.length > 10, `${c.id} has a justification`);
  }
  assert.equal(new Set(manifest.map((c) => c.id)).size, manifest.length);
  assert.deepEqual(manifest, expandCases(), 'the manifest is the matrix expanded');
});

// --- criterion 3: completeness, proved on the product ------------------------------------------

test('the matrix has 13 languages, 6 on the 1.20.0 extension list, and the 7 behaviours', () => {
  assert.equal(LANGUAGES.length, 13);
  assert.equal(LANGUAGES.filter((l) => extensionListed(l.extension)).length, 6);
  assert.deepEqual(RULES, ['SEC101', 'SEC104', 'SEC106', 'SEC108', 'DAT101', 'DAT102', 'DAT104']);
  assert.equal(new Set(LANGUAGES.map((l) => l.extension)).size, 13);
});

test('every language and behaviour has a planted case or a not-applicable reason, never both', () => {
  let pairs = 0;
  for (const language of LANGUAGES) {
    for (const rule of RULES) {
      pairs += 1;
      const cases = planted().filter((c) => c.language === language.id && c.rule === rule);
      const reason = NOT_APPLICABLE[language.id]?.[rule];
      if (reason) {
        assert.equal(cases.length, 0, `${language.id} ${rule} is both planted and not applicable`);
        assert.ok(reason.length > 20, `${language.id} ${rule} reason`);
      } else {
        assert.ok(cases.length > 0, `${language.id} ${rule} has no case`);
      }
    }
  }
  assert.equal(pairs, 91);
  for (const [language, rules] of Object.entries(NOT_APPLICABLE)) {
    assert.ok(LANGUAGES.some((l) => l.id === language), language);
    for (const rule of Object.keys(rules)) assert.ok(RULES.includes(rule), rule);
  }
});

test('a listed language whose ecosystem the catalog names has a catalog variant and another form', () => {
  let paired = 0;
  for (const language of LANGUAGES.filter((l) => extensionListed(l.extension))) {
    for (const rule of RULES) {
      const cases = planted().filter((c) => c.language === language.id && c.rule === rule);
      const variants = cases.map((c) => c.variant).sort();
      if (ecosystemTerms(rule, language.id).length > 0) {
        paired += 1;
        assert.deepEqual(variants, ['catalog', 'other'], `${language.id} ${rule}`);
        assert.equal(cases.find((c) => c.variant === 'catalog').tokenListed, true, `${language.id} ${rule} catalog`);
        assert.equal(cases.find((c) => c.variant === 'other').tokenListed, false, `${language.id} ${rule} other`);
      } else {
        assert.deepEqual(variants, ['idiomatic'], `${language.id} ${rule}`);
      }
    }
  }
  assert.ok(paired >= 30, `paired: ${paired}`);
  for (const c of planted().filter((p) => !extensionListed(p.extension))) assert.equal(c.variant, 'idiomatic', c.id);
});

test('every term the ecosystem table names is a term of the 1.20.0 catalog', () => {
  for (const [rule, terms] of Object.entries(TERM_ECOSYSTEMS)) {
    assert.deepEqual(Object.keys(terms).sort(), [...CATALOG_1_20.rules[rule].terms].sort(), rule);
    for (const languages of Object.values(terms)) {
      for (const id of languages) assert.ok(extensionListed(LANGUAGES.find((l) => l.id === id).extension), `${rule}: ${id}`);
    }
  }
});

test('every language has the three decoy kinds', () => {
  assert.equal(decoys().length, LANGUAGES.length * 3);
  for (const language of LANGUAGES) {
    const kinds = decoys().filter((c) => c.language === language.id).map((c) => c.decoyKind).sort();
    assert.deepEqual(kinds, [...DECOY_KINDS].sort(), language.id);
  }
});

// --- criterion 4: the labels come from CATALOG_1_20 by function ---------------------------------

test('every label in the manifest is what the two functions compute from CATALOG_1_20', () => {
  for (const c of manifest) {
    assert.equal(c.extensionListed, extensionListed(c.extension), c.id);
    assert.equal(c.tokenListed, tokenListed(c.rule, c.snippet.join('\n')), c.id);
  }
});

test('the four quadrants hold cases of the matrix, and the functions place them right', () => {
  const quadrant = (e, t) => planted().filter((c) => c.extensionListed === e && c.tokenListed === t);
  for (const e of [true, false]) for (const t of [true, false]) assert.ok(quadrant(e, t).length > 0, `quadrant ${e}/${t}`);
  const expect = {
    'python-SEC108-catalog': [true, true],
    'python-SEC108-other': [true, false],
    'kotlin-SEC108-idiomatic': [false, true],
    'rust-SEC108-idiomatic': [false, false],
  };
  for (const [id, [e, t]] of Object.entries(expect)) {
    const c = manifest.find((m) => m.id === id);
    assert.ok(c, id);
    assert.equal(extensionListed(c.extension), e, `${id} extension`);
    assert.equal(tokenListed(c.rule, c.snippet.join('\n')), t, `${id} token`);
  }
});

test('extensionListed reads the Security and Data list of the 1.20.0 catalog', () => {
  assert.deepEqual(CATALOG_1_20.domains.Security.extensions, ['.py', '.js', '.ts', '.rb', '.go', '.java']);
  for (const ext of ['.py', '.js', '.ts', '.rb', '.go', '.java']) assert.equal(extensionListed(ext), true, ext);
  for (const ext of ['.tsx', '.cs', '.kt', '.swift', '.php', '.rs', '.sh', '.jsx']) assert.equal(extensionListed(ext), false, ext);
});

test('tokenListed finds a catalog term as a word, in any case, and not inside another word', () => {
  const yes = [
    ['SEC108', 'subprocess.call(cmd, shell=True)'],
    ['SEC108', 'out = execSync(cmd)'],
    ['SEC108', 'exec.Command("sh", "-c", script)'],
    ['SEC108', 'shell_exec($cmd)'],
    ['SEC108', 'eval(expr)'],
    ['SEC101', '@login_required'],
    ['SEC101', 'before_action :authenticate_user!'],
    ['SEC104', 'DB_PASSWORD = x'],
    ['SEC104', 'apiToken = x'],
    ['SEC106', 'requests.get(url, verify=False)'],
    ['SEC106', 'tls.Config{InsecureSkipVerify: true}'],
    ['SEC106', 'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";'],
    ['DAT101', 'Order.delete_all'],
    ['DAT102', 'customer.getCpf()'],
    ['DAT104', 'Rails.logger.info("token #{token}")'],
    ['DAT104', '_logger.LogInformation("{Password}", password)'],
  ];
  const no = [
    ['SEC108', 'evaluate(expr)'],
    ['SEC108', 'task.executableURL = url'],
    ['SEC108', 'filesystem.read()'],
    ['SEC101', 'auth.anyRequest().authenticated()'],
    ['SEC101', 'middleware::from_fn(require_auth)'],
    ['SEC104', 'DB_PASS = x'],
    ['SEC104', 'TOKENS = x'],
    ['SEC106', 'InsecureSkipVerify: skipVerify'],
    ['SEC106', 'ctx.verify_mode = ssl.CERT_NONE'],
    ['DAT102', 'customer.CardNumber'],
    ['DAT104', 'console.log("user", user)'],
    ['DAT104', 'log.Printf("token=%s", token)'],
  ];
  for (const [rule, line] of yes) assert.equal(tokenListed(rule, line), true, `${rule}: ${line}`);
  for (const [rule, line] of no) assert.equal(tokenListed(rule, line), false, `${rule}: ${line}`);
});

// --- the fake secret and criterion 9 ------------------------------------------------------------

test('the planted secret is obviously fake and has no provider key format', () => {
  assert.doesNotMatch(FAKE_VALUE, /sk-|ghp_|gh[pousr]_|AKIA|xox|AIza|_live_/);
  assert.ok(FAKE_VALUE.length >= 8);
  const secrets = planted().filter((c) => c.rule === 'SEC104');
  assert.ok(secrets.length > 0);
  for (const c of secrets) assert.ok(c.text.includes(FAKE_VALUE) || c.snippet.join('\n').includes(FAKE_VALUE), c.id);
});

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
  cpSync(FIXTURE, join(work, 'test/fixtures/gate-languages'), { recursive: true });
  for (const name of ['gate-languages-fixture.test.mjs', 'gate-languages-measure.test.mjs']) {
    if (existsSync(join(ROOT, 'test', name))) cpSync(join(ROOT, 'test', name), join(work, 'test', name));
  }
  cpSync(join(ROOT, 'test/README.md'), join(work, 'test/README.md'));
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'fixture']);
  const out = join(dir, 'package.md');
  const result = run([REVIEW_PACKAGE, work, base, out]);
  assert.equal(result.status, 0, result.stderr);
  const text = readFileSync(out, 'utf8');
  // The package opens with a line `WITHHELD: <n> file diff(s) ...` when it leaves one out; the
  // word inside a diff line comes after the + of the diff.
  assert.doesNotMatch(text, /^WITHHELD/m);
  assert.match(text, /^\+export const CATALOG_1_20/m, 'the matrix diff is in the package');

  // Control: the same package over a file that holds a generated planted line is withheld, so
  // the detector is live and the clean result above is not an accident of the run.
  const sec104 = planted().find((c) => c.rule === 'SEC104' && c.language === 'python' && c.variant === 'catalog');
  writeFileSync(join(work, 'settings.py'), `${sec104.text}\n`);
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'control']);
  const control = join(dir, 'control.md');
  assert.equal(run([REVIEW_PACKAGE, work, base, control]).status, 0);
  assert.match(readFileSync(control, 'utf8'), /^WITHHELD: 1 file/m);
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
  assert.doesNotMatch(table, new RegExp(FAKE_VALUE));
});
