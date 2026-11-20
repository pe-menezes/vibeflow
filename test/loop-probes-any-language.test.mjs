// Step 7 of the audit and two loop scripts, held to no language convention. Step 7 asks for the
// project's own test folder, file name and framework, plus a marker comment; check-probes finds a
// probe file by that marker in any language and folder, and its state families read the form that
// does not depend on the language; who-reads counts any reference outside prose as a reader.
// The marker is assembled below, so this file is never read as a probe of this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCRIPTS_DIR, makeSandbox, runScript, withSandbox } from './loop-helpers.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MARK = ['vibeflow', 'probe:'].join('-');
const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};

const flat = (text) => text.replace(/\s+/g, ' ');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------- step 7, by property

// What step 7 has to be, as a list of the properties it breaks: the probe goes where the
// project's own tests go (their folder, the name their runner picks up, their framework), a
// comment carries the marker, the call to check-probes has no --dir and says it finds the probe
// by the marker, and neither the step nor the report's example fixes a folder or a suffix.
function step7Problems(text) {
  const body = flat(text);
  const step = /7\. \*\*Probes\*\*.*? 8\. When/.exec(body)?.[0];
  if (!step) return ['no step 7'];
  const problems = [];
  if (!/the project's own tests/.test(step) || !/in the folder where they live/.test(step)) problems.push('folder of the project\'s tests');
  if (!/file name its test runner picks up/.test(step)) problems.push('name the runner picks up');
  if (!/same test framework/.test(step)) problems.push('framework of the project\'s tests');
  if (!new RegExp(`comment[^.]*\`${escape(MARK)} <feature>-<part>\``).test(step)) problems.push('marker in a comment');
  if (/\/audit\//.test(step) || /<test dir>/.test(step)) problems.push('fixed folder');
  if (/<feature>-<part>\.[a-z<]/.test(step) || /\.test\.</.test(step)) problems.push('fixed suffix');
  if (!/`node \S+scripts\/check-probes\.mjs <project root> --base <base>`/.test(step) || /--dir\b/.test(step)) problems.push('check-probes call without --dir');
  if (!/finds the probe file by its marker/.test(step)) problems.push('found by the marker');
  const template = /## Output format ```.*?```/.exec(body)?.[0] ?? '';
  const paths = [...template.matchAll(/probe: (\S+?)::/g)].map((match) => match[1]);
  if (paths.length === 0) problems.push('no probe path in the example');
  if (paths.some((path) => /(^|\/)audit\//.test(path) || /\.test\.</.test(path))) problems.push('fixed folder in the example');
  return problems;
}

test('step 7 in every audit edition asks for the folder, name and framework of the project\'s tests and the marker, and fixes no folder or suffix', () => {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    assert.deepEqual(step7Problems(readFileSync(join(ROOT, path), 'utf8')), [], edition);
  }
});

// The proof that the property bites: each mutation puts back one thing the old step had, and the
// property names it.
const MUTATIONS = [
  ['an audit/ folder back', (text) => text.replace('Behavior probes go in one new test file', 'Behavior probes go in `<test dir>/audit/`, one new test file'), 'fixed folder'],
  ['a .test.<ext> suffix back', (text) => text.replace('`<feature>-<part>` (a standalone audit uses its feature slug)', '`<feature>-<part>.test.<ext>` (a standalone audit uses its feature slug)'), 'fixed suffix'],
  ['the marker removed', (text) => text.replace(`\`${MARK} <feature>-<part>\``, '`<feature>-<part>`'), 'marker in a comment'],
  ['the --dir back', (text) => text.replace('--base <base>`', '--base <base> --dir <probe dir>`'), 'check-probes call without --dir'],
  ['an audit/ folder back in the example', (text) => text.replace('probe: tests/', 'probe: tests/audit/'), 'fixed folder in the example'],
];

for (const [name, mutate, problem] of MUTATIONS) {
  test(`step 7 property: ${name} is caught in every edition`, () => {
    for (const [edition, path] of Object.entries(EDITIONS)) {
      const text = flat(readFileSync(join(ROOT, path), 'utf8'));
      const mutated = mutate(text);
      assert.notEqual(mutated, text, `${edition}: the mutation applies`);
      assert.ok(step7Problems(mutated).includes(problem), `${edition}: ${step7Problems(mutated).join(', ')}`);
    }
  });
}

// ------------------------------------------------- check-probes finds a probe by the marker

// A probe per language, where that language's tests live, with the marker in its comment form.
// Line 2 is a canary every family run reads as a line number, so the output names each file read.
const LANGUAGE_PROBES = [
  ['Go', 'billing/billing_p1_probe_test.go', '//'],
  ['Python', 'tests/test_billing_p1_probes.py', '#'],
  ['C#', 'tests/Billing.Tests/BillingP1Probes.cs', '//'],
  ['Kotlin', 'src/test/kotlin/billing/BillingP1ProbeTest.kt', '//'],
  ['Swift', 'Tests/AppTests/BillingP1Probes.swift', '//'],
];
const CANARY = 'canary src/rules.ts:42';
const OLD_PROBE = 'tests/audit/old_probe.rb';
const PRODUCTION = 'billing/billing.go';
const SETTLED = 'tests/test_settled_probes.py';
// Paths compare without letter case: on a file system that ignores it (the macOS default),
// `Tests/` and `tests/` are one folder, and git lists it under the name it was created with.
const named = (stdout, path) => new RegExp(`^${escape(path)}:\\d+ \\[`, 'mi').test(stdout);
const readCount = (stdout) => Number(/^(\d+) probe file\(s\) read/m.exec(stdout)?.[1]);

function discoveryRepo(box) {
  // On the base: a marked probe that does not change afterwards.
  box.write(SETTLED, `# ${MARK} settled-p1\n# ${CANARY}\n`);
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'settled probe');
  const base = box.git('rev-parse', 'HEAD').trim();
  for (const [, path, comment] of LANGUAGE_PROBES) box.write(path, `${comment} ${MARK} billing-p1\n${comment} ${CANARY}\n`);
  box.write(OLD_PROBE, `require 'billing'\n# ${CANARY}\n`);
  box.write(PRODUCTION, `package billing\n// ${CANARY}\nfunc Stamp() time.Time { return time.Now() }\n`);
  // Text that quotes the marker's template is not a probe, and neither is the installed kit.
  box.write('docs/audit-step.md', `A comment carries \`${MARK} <feature>-<part>\`.\n${CANARY}\n`);
  mkdirSync(join(box.repo, '.github/vibeflow/loop/scripts'), { recursive: true });
  copyFileSync(join(SCRIPTS_DIR, 'check-probes.mjs'), join(box.repo, '.github/vibeflow/loop/scripts/check-probes.mjs'));
  // Committed after the base: the Go probe and the production code beside it; the rest untracked.
  box.git('add', LANGUAGE_PROBES[0][1], PRODUCTION);
  box.git('commit', '-q', '-m', 'go probe');
  return base;
}

test('check-probes without --dir reads every marked probe in any language and folder, the old audit/ folder, and no unmarked file', () => {
  withSandbox((box) => {
    discoveryRepo(box);
    const result = runScript('check-probes.mjs', [box.repo], box.env());
    assert.equal(result.status, 1, result.out);
    for (const [language, path] of LANGUAGE_PROBES) assert.ok(named(result.stdout, path), `${language}: ${path}\n${result.out}`);
    assert.ok(named(result.stdout, OLD_PROBE), `the old audit/ folder: ${result.out}`);
    assert.ok(named(result.stdout, SETTLED), `a marked probe on the base: ${result.out}`);
    for (const path of [PRODUCTION, 'docs/audit-step.md', '.github/vibeflow/loop/scripts/check-probes.mjs']) {
      assert.ok(!named(result.stdout, path), `${path} is not a probe: ${result.out}`);
    }
    assert.equal(readCount(result.stdout), LANGUAGE_PROBES.length + 2, result.out);
  });
});

test('check-probes with --base reads only the probes changed since the base or untracked, found by the marker or the old folder', () => {
  withSandbox((box) => {
    const base = discoveryRepo(box);
    const result = runScript('check-probes.mjs', [box.repo, '--base', base], box.env());
    assert.equal(result.status, 1, result.out);
    for (const [language, path] of LANGUAGE_PROBES) assert.ok(named(result.stdout, path), `${language}: ${path}\n${result.out}`);
    assert.ok(named(result.stdout, OLD_PROBE), result.out);
    assert.ok(!named(result.stdout, SETTLED), `unchanged since the base: ${result.out}`);
    assert.ok(!named(result.stdout, PRODUCTION), result.out);
    assert.equal(readCount(result.stdout), LANGUAGE_PROBES.length + 1, result.out);
  });
});

test('check-probes with --dir reads the folder as before, unmarked files included, and nothing outside it', () => {
  withSandbox((box) => {
    discoveryRepo(box);
    const result = runScript('check-probes.mjs', [box.repo, '--dir', 'billing'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.ok(named(result.stdout, PRODUCTION), result.out);
    assert.ok(named(result.stdout, LANGUAGE_PROBES[0][1]), result.out);
    assert.ok(!named(result.stdout, LANGUAGE_PROBES[1][1]), result.out);
    assert.equal(readCount(result.stdout), 2, result.out);
  });
});

// ----------------------------------------------------- the state families, by table

// family -> language -> [a line that pins state, the corresponding line that pins behavior]
const FAMILY_TABLE = {
  'reads git': {
    Go: ['out, _ := exec.Command("git", "diff", "main").Output()', 'out, _ := exec.Command("make", "build").Output()'],
    Python: ['out = subprocess.run(["git", "log", "-1"], capture_output=True)', 'out = subprocess.run(["make", "build"], capture_output=True)'],
    'C#': ['var p = Process.Start("git", "rev-parse HEAD");', 'var p = Process.Start("dotnet", "build");'],
    Kotlin: ['val p = ProcessBuilder("git", "status").start()', 'val p = ProcessBuilder("gradle", "build").start()'],
    Swift: ['process.arguments = ["git", "ls-files"]', 'process.arguments = ["swift", "build"]'],
    Ruby: ['out = IO.popen(["git", "show", "HEAD"]).read', 'out = IO.popen(["rake", "build"]).read'],
    JavaScript: ["execFileSync('git', ['diff', 'origin/main...HEAD'])", "execFileSync('npm', ['run', 'build'])"],
  },
  'current version': {
    Go: ['if got := Version; got != "1.4.2" {', 'if got := Total(cart); got != 42 {'],
    Python: ['assert billing.__version__ == "2.0.1"', 'assert billing.total(cart) == 42'],
    'C#': ['Assert.Equal("3.1.0", typeof(Billing).Assembly.GetName().Version.ToString());', 'Assert.Equal(42, Billing.Total(cart));'],
    Kotlin: ['assertEquals("1.2.0", BuildConfig.VERSION_NAME)', 'assertEquals(42, Billing.total(cart))'],
    Swift: ['XCTAssertEqual(App.version, "1.0.0")', 'XCTAssertEqual(Billing.total(cart), 42)'],
    Ruby: ['expect(Billing::VERSION).to eq("4.4.1")', 'expect(Billing.total(cart)).to eq(42)'],
    JavaScript: ["expect(pkg.version).toBe('4.4.1')", 'expect(total(cart)).toBe(42)'],
  },
  'state that changes by itself': {
    Go: ['assert.Contains(t, notes, "the refund is still pending")', 'assert.Contains(t, notes, "the refund was issued")'],
    Python: ['self.assertIn("not yet fixed", report)', 'self.assertIn("refund issued", report)'],
    'C#': ['Assert.Contains("the bug remains open", report);', 'Assert.Contains("the bug was closed", report);'],
    Kotlin: ['assertTrue(report.contains("migration is pending"))', 'assertTrue(report.contains("migration ran"))'],
    Swift: ['XCTAssertTrue(notes.contains("the swap is still pending"))', 'XCTAssertTrue(notes.contains("the swap ran"))'],
    Ruby: ['expect(notes).to include("not yet shipped")', 'expect(notes).to include("shipped")'],
    JavaScript: ["expect(doc).toContain('the swap is still pending')", "expect(doc).toContain('the swap is done')"],
  },
  'line number': {
    Go: ['assert.Equal(t, "billing.go:42", loc)', 'assert.Equal(t, "billing.go", loc.File)'],
    Python: ['self.assertIn("billing.py:12", trace)', 'self.assertIn("billing.py", trace)'],
    'C#': ['Assert.Contains("Billing.cs:88", trace);', 'Assert.Contains("Billing.cs", trace);'],
    Kotlin: ['assertTrue(trace.contains("Billing.kt:12"))', 'assertTrue(trace.contains("Billing.kt"))'],
    Swift: ['XCTAssertTrue(trace.contains("App.swift:30"))', 'XCTAssertTrue(trace.contains("App.swift"))'],
    Ruby: ['expect(trace).to include("billing.rb:7")', 'expect(trace).to include("billing.rb")'],
    JavaScript: ["expect(report).toContain('src/rules.ts:42')", "expect(report).toContain('src/rules.ts')"],
  },
  'real clock': {
    Go: ['if stamp.After(time.Now()) {', 'if stamp.After(fixed) {'],
    Python: ['self.assertLess(stamp, datetime.now())', 'self.assertLess(stamp, datetime(2024, 1, 1))'],
    'C#': ['Assert.True(stamp < DateTime.UtcNow);', 'Assert.True(stamp < new DateTime(2024, 1, 1));'],
    Kotlin: ['assertTrue(stamp.isBefore(Instant.now()))', 'assertTrue(stamp.isBefore(Instant.ofEpochSecond(0)))'],
    Swift: ['XCTAssertLessThan(stamp, Date())', 'XCTAssertLessThan(stamp, Date(timeIntervalSince1970: 0))'],
    Ruby: ['expect(stamp).to be < Time.now', 'expect(stamp).to be < Time.at(0)'],
    JavaScript: ['expect(stamp).toBeLessThan(Date.now())', 'expect(stamp).toBeLessThan(fixedNow)'],
  },
  'doc text': {
    Go: ['body, _ := os.ReadFile("docs/guide.md")', 'body, _ := os.ReadFile("testdata/input.json")'],
    Python: ['text = Path("README.rst").read_text()', 'text = Path("fixtures/input.json").read_text()'],
    'C#': ['var text = File.ReadAllText("docs/Guide.adoc");', 'var text = File.ReadAllText("fixtures/input.json");'],
    Kotlin: ['val text = File("docs/guide.md").readText()', 'val text = File("fixtures/input.json").readText()'],
    Swift: ['let text = try String(contentsOfFile: "docs/guide.html")', 'let text = try String(contentsOfFile: "fixtures/input.json")'],
    Ruby: ['text = File.read("CHANGES.txt")', 'text = File.read("fixtures/input.json")'],
    JavaScript: ["expect(readFileSync('docs/guide.md', 'utf8')).toContain('x')", "expect(readFileSync('fixtures/input.json', 'utf8')).toContain('x')"],
  },
};
const EXTENSIONS = { Go: 'go', Python: 'py', 'C#': 'cs', Kotlin: 'kt', Swift: 'swift', Ruby: 'rb', JavaScript: 'js' };
const FAMILY_ROWS = Object.entries(FAMILY_TABLE).flatMap(([family, languages]) =>
  Object.entries(languages).map(([language, [state, control]]) => {
    const file = `${family.replace(/\W+/g, '-')}/${language.replace('#', 'sharp').toLowerCase()}.${EXTENSIONS[language]}`;
    return { family, language, state, control, statePath: `state/${file}`, controlPath: `control/${file}` };
  }));
const NOT_READ = /^not read: [^\n]*another file[^\n]*environment/m;

test('the family table covers six families in seven languages', () => {
  assert.equal(Object.keys(FAMILY_TABLE).length, 6);
  for (const languages of Object.values(FAMILY_TABLE)) assert.deepEqual(Object.keys(languages).sort(), Object.keys(EXTENSIONS).sort());
});

test('check-probes flags each family\'s state line in every language, passes the behavior line, and says what it does not read', async (t) => {
  const box = makeSandbox();
  try {
    for (const row of FAMILY_ROWS) {
      box.write(row.statePath, `${row.state}\n`);
      box.write(row.controlPath, `${row.control}\n`);
    }
    const state = runScript('check-probes.mjs', [box.repo, '--dir', 'state'], box.env());
    const control = runScript('check-probes.mjs', [box.repo, '--dir', 'control'], box.env());
    for (const row of FAMILY_ROWS) {
      await t.test(`${row.family} · ${row.language}`, () => {
        assert.match(state.stdout, new RegExp(`^${escape(row.statePath)}:1 \\[${escape(row.family)}\\]`, 'm'), `${row.state}\n${state.out}`);
        assert.ok(!control.stdout.includes(`${row.controlPath}:`), `${row.control}\n${control.out}`);
      });
    }
    assert.equal(control.status, 0, control.out);
    assert.match(control.stdout, new RegExp(`^${FAMILY_ROWS.length} probe file\\(s\\) read; 0 suspect line\\(s\\)$`, 'm'));
    assert.equal(state.status, 1, state.out);
    assert.match(state.stdout, new RegExp(`^${FAMILY_ROWS.length} probe file\\(s\\) read; ${FAMILY_ROWS.length} suspect line\\(s\\)$`, 'm'));
    assert.match(state.stdout, NOT_READ, 'with suspects, the output says what it does not read');
    assert.match(control.stdout, NOT_READ, 'without suspects, too');
  } finally {
    box.cleanup();
  }
});

// -------------------------------------------------------- who-reads: readers outside prose

const NON_DOCUMENT_REFERENCES = {
  'billing/invoice_test.go': 'const fixture = "src/rules.ts"\n',
  'tests/Billing.Tests/InvoiceTests.cs': 'private const string Fixture = "src/rules.ts";\n',
  'src/test/kotlin/billing/InvoiceTest.kt': 'private const val FIXTURE = "src/rules.ts"\n',
  'Tests/AppTests/AppTests.swift': 'let fixture = "src/rules.ts"\n',
  'tools/release.sh': 'cp src/rules.ts dist/rules.ts\n',
  'manifest.json': '{ "files": ["src/rules.ts"] }\n',
};
const DOCUMENTS = ['md', 'mdx', 'txt', 'rst', 'adoc'].map((ext) => `docs/notes.${ext}`);

test('who-reads marks a reference from any file that is not a document as a reader, and a document\'s as a mention', () => {
  withSandbox((box) => {
    for (const [path, text] of Object.entries(NON_DOCUMENT_REFERENCES)) box.write(path, text);
    // Words that read a file do not turn prose into a reader.
    for (const path of DOCUMENTS) box.write(path, 'Read it with cat src/rules.ts or import it from src/rules.ts.\n');
    box.git('add', '-A');
    const result = runScript('who-reads.mjs', [box.repo, 'src/rules.ts'], box.env());
    assert.equal(result.status, 1, result.out);
    for (const path of Object.keys(NON_DOCUMENT_REFERENCES)) assert.match(result.stdout, new RegExp(`^ {2}reads ${escape(path)}:`, 'mi'), `${path}\n${result.out}`);
    for (const path of DOCUMENTS) assert.match(result.stdout, new RegExp(`^ {8}${escape(path)}:`, 'mi'), `${path}\n${result.out}`);
  });
});

test('who-reads exits 0 when only documents mention the file', () => {
  withSandbox((box) => {
    box.write('src/alone.ts', 'export {}\n');
    for (const path of DOCUMENTS) box.write(path, 'Read it with cat src/alone.ts.\n');
    box.git('add', '-A');
    const result = runScript('who-reads.mjs', [box.repo, 'src/alone.ts'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, new RegExp(`src/alone\\.ts: ${DOCUMENTS.length} reference`));
  });
});
