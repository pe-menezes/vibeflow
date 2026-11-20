// Step 7 of the audit and two loop scripts, held to no language convention. Step 7 asks for the
// project's own test folder, file name and framework, plus a marker comment; check-probes finds a
// probe file by that marker in any language and folder, and its state families read the form that
// does not depend on the language; who-reads counts any reference outside prose as a reader.
// The marker is assembled below, so this file is never read as a probe of this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
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

// The measured paragraph of step 7 (the sentences that ask for the folder, the name the runner
// picks up and the framework of the project's own tests, and for the marker), held by inclusion:
// a word added inside either sentence breaks it.
const MEASURED_LOCATION = 'Behavior probes go in one new test file for `<feature>-<part>` (a standalone audit uses its feature slug), written the way the project\'s own tests are: in the folder where they live, with the file name its test runner picks up and the same test framework, so the project\'s usual test command runs it; in a project with no test yet, the layout its language\'s default test runner expects.';
const MEASURED_MARKER = `A comment on the file's first lines carries the marker \`${MARK} <feature>-<part>\`, by which the kit finds its probes.`;
const OTHER_FRAMEWORK = /\b(any|another|other|different|whichever)\b[^.;]{0,40}\bframeworks?\b|\bframeworks?\b[^.;]{0,30}\b(any|another|other|different|whichever)\b/i;
// A folder: a name in code that ends in a slash or is a path with no space in it.
const isFolder = (span) => /\/$/.test(span) || (/\//.test(span) && !/\s/.test(span));
// A suffix: a name in code that starts with `_`, `.` or `-`, or the probe's name with an ending.
const isSuffix = (span) => /^[_.-]\w/.test(span) || /<feature>-<part>[._]/.test(span);

// What step 7 has to be, as a list of the properties it breaks: the measured paragraph is in it
// word for word (the folder, name and framework of the project's own tests; the marker in a
// comment), nothing else in the step fixes a folder, a suffix or another framework, the call to
// check-probes has no --dir and says it finds the probe by the marker, and the report's example
// fixes no folder either.
function step7Problems(text) {
  const body = flat(text);
  const step = /7\. \*\*Probes\*\*.*? 8\. When/.exec(body)?.[0];
  if (!step) return ['no step 7'];
  const problems = [];
  if (!step.includes(MEASURED_LOCATION)) problems.push('measured paragraph');
  if (!step.includes(MEASURED_MARKER)) problems.push('marker in a comment');
  const spans = [...step.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  const prose = step.replace(/`[^`]+`/g, '``');
  if (/\/audit\//.test(step) || /<test dir>/.test(step) || spans.some(isFolder) || /(^|\s)[\w.-]+\/(?=[\s,.;:)]|$)/.test(prose)) problems.push('fixed folder');
  if (/<feature>-<part>\.[a-z<]/.test(step) || /\.test\.</.test(step) || spans.some(isSuffix) || /(^|\s)[_.][a-z]\w*(?=[\s,.;:)]|$)/i.test(prose)) problems.push('fixed suffix');
  if (OTHER_FRAMEWORK.test(prose)) problems.push('other framework');
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
  // The audit's three, each inside the measured sentence, then the same three as a sentence of
  // their own after the paragraph, where the inclusion alone does not see them.
  ['a fixed probes/ folder in the sentence', (text) => text.replace('in the folder where they live,', 'in the folder where they live, under a `probes/` subfolder,'), ['measured paragraph', 'fixed folder']],
  ['a fixed _probe suffix in the sentence', (text) => text.replace('with the file name its test runner picks up', 'with the file name its test runner picks up, ending in `_probe`'), ['measured paragraph', 'fixed suffix']],
  ['another framework allowed in the sentence', (text) => text.replace('and the same test framework', 'and the same test framework or any other one'), ['measured paragraph', 'other framework']],
  ['a fixed probes/ folder after the paragraph', (text) => text.replace('by which the kit finds its probes.', 'by which the kit finds its probes. Put it under `probes/`.'), 'fixed folder'],
  ['a fixed probes/ folder in plain words after the paragraph', (text) => text.replace('by which the kit finds its probes.', 'by which the kit finds its probes. Put it under probes/ in that folder.'), 'fixed folder'],
  ['a fixed _probe suffix after the paragraph', (text) => text.replace('by which the kit finds its probes.', 'by which the kit finds its probes. Its name ends in `_probe`.'), 'fixed suffix'],
  ['a fixed .probe suffix in plain words after the paragraph', (text) => text.replace('by which the kit finds its probes.', 'by which the kit finds its probes. Its name ends in .probe before the extension.'), 'fixed suffix'],
  ['another framework allowed after the paragraph', (text) => text.replace('by which the kit finds its probes.', 'by which the kit finds its probes. Any other test framework works too.'), 'other framework'],
];

for (const [name, mutate, expected] of MUTATIONS) {
  test(`step 7 property: ${name} is caught in every edition`, () => {
    for (const [edition, path] of Object.entries(EDITIONS)) {
      const text = flat(readFileSync(join(ROOT, path), 'utf8'));
      const mutated = mutate(text);
      assert.notEqual(mutated, text, `${edition}: the mutation applies`);
      for (const problem of [expected].flat()) assert.ok(step7Problems(mutated).includes(problem), `${edition}: ${problem}? ${step7Problems(mutated).join(', ')}`);
    }
  });
}

// ------------------------------------------------- check-probes finds a probe by the marker

// A probe per language, where that language's tests live, with the marker in its comment form.
// Line 2 is a canary every family run reads as a line number, so the output names each file read;
// it is a line of code, because a line that is only a comment is not read.
const LANGUAGE_PROBES = [
  ['Go', 'billing/billing_p1_probe_test.go', '//'],
  ['Python', 'tests/test_billing_p1_probes.py', '#'],
  ['C#', 'tests/Billing.Tests/BillingP1Probes.cs', '//'],
  ['Kotlin', 'src/test/kotlin/billing/BillingP1ProbeTest.kt', '//'],
  ['Swift', 'Tests/AppTests/BillingP1Probes.swift', '//'],
];
const CANARY = "canary('src/rules.ts:42')";
const OLD_PROBE = 'tests/audit/old_probe.rb';
const PRODUCTION = 'billing/billing.go';
const SETTLED = 'tests/test_settled_probes.py';
// Paths compare without letter case: on a file system that ignores it (the macOS default),
// `Tests/` and `tests/` are one folder, and git lists it under the name it was created with.
const named = (stdout, path) => new RegExp(`^${escape(path)}:\\d+ \\[`, 'mi').test(stdout);
const readCount = (stdout) => Number(/^(\d+) probe file\(s\) read/m.exec(stdout)?.[1]);

function discoveryRepo(box) {
  // On the base: a marked probe that does not change afterwards.
  box.write(SETTLED, `# ${MARK} settled-p1\n${CANARY}\n`);
  box.git('add', '-A');
  box.git('commit', '-q', '-m', 'settled probe');
  const base = box.git('rev-parse', 'HEAD').trim();
  for (const [, path, comment] of LANGUAGE_PROBES) box.write(path, `${comment} ${MARK} billing-p1\n${CANARY}\n`);
  box.write(OLD_PROBE, `require 'billing'\n${CANARY}\n`);
  box.write(PRODUCTION, `package billing\n${CANARY}\nfunc Stamp() time.Time { return time.Now() }\n`);
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

test('check-probes without --dir reads no file under .vibeflow/ and no marker followed by a template in braces', () => {
  withSandbox((box) => {
    box.write('tests/test_billing_p1_probes.py', `# ${MARK} billing-p1\n${CANARY}\n`);
    // A filled auditor briefing in a tracked .vibeflow/, at the top and in a nested project.
    const briefing = `* the probe file carries \`${MARK} billing-p1\` in a comment\n${CANARY}\n`;
    box.write('.vibeflow/briefings/billing-p1-auditor.md', briefing);
    box.write('packages/api/.vibeflow/briefings/billing-p1-auditor.md', briefing);
    // A code comment that quotes the marker's template in braces.
    box.write('src/notes.ts', `// the audit writes ${MARK} {feature}-{part} in each probe\n${CANARY}\n`);
    box.write('src/notes.py', `# the audit writes ${MARK}{feature}-{part} in each probe\n${CANARY}\n`);
    box.git('add', '-A');
    for (const args of [[box.repo], [box.repo, '--base', box.base]]) {
      const result = runScript('check-probes.mjs', args, box.env());
      assert.ok(named(result.stdout, 'tests/test_billing_p1_probes.py'), result.out);
      for (const path of ['.vibeflow/briefings/billing-p1-auditor.md', 'packages/api/.vibeflow/briefings/billing-p1-auditor.md', 'src/notes.ts', 'src/notes.py']) {
        assert.ok(!named(result.stdout, path), `${path} is not a probe: ${result.out}`);
      }
      assert.equal(readCount(result.stdout), 1, result.out);
    }
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

// The audit's table of part 3: lines in nine languages, each a state line (S) or a behavior line
// (B), with the family check-probes names on it, or null when it names none. Every state line the
// families read at e04b531 is read, `notes.txt.bak` included; the state lines that neither version
// read stay unread, by name; of the behavior lines, only the one declared alarm is read.
const STATE_UNREAD = {
  'the clock in milliseconds': 'val start = System.currentTimeMillis()',
  'the clock in nanoseconds': 'long t = System.nanoTime();',
  'the monotonic clock': 't = time.monotonic()',
  'the time elapsed since': 'elapsed := time.Since(start)',
  'the long markdown extension': "const t = readFileSync(join(ROOT, 'docs/guide.markdown'), 'utf8')",
};
const DECLARED_ALARMS = {
  'the git name as an expected value, first argument of an assertion': 'Assert.Equal("git", Detect(dir));',
};
const AUDIT_ROWS = [
  ['S', 'reads git', 'JavaScript', "const tag = execSync('git describe --tags').toString()"],
  ['S', 'reads git', 'JavaScript', "const branch = execSync('git branch --show-current', { encoding: 'utf8' })"],
  ['S', 'reads git', 'JavaScript', 'const n = execSync(`git rev-list --count HEAD`)'],
  ['S', 'reads git', 'JavaScript', "const tags = execSync('git tag --list')"],
  ['S', 'reads git', 'JavaScript', "const blame = execFileSync('git blame src/a.ts')"],
  ['S', 'reads git', 'Python', "out = subprocess.check_output('git describe --tags', shell=True)"],
  ['S', 'reads git', 'Ruby', 'tag = `git describe --tags`'],
  ['S', 'reads git', 'Go', 'out, _ := exec.Command("sh", "-c", "git describe --tags").Output()'],
  ['S', 'reads git', 'JavaScript', "spawnSync('git', ['diff', base])"],
  ['B', null, 'JavaScript', "assert.equal(detectVcs(dir), 'git')"],
  ['B', null, 'Python', 'self.assertEqual(repo.kind, "git")'],
  ['B', null, 'Go', 'if got := DetectVCS(dir); got != "git" {'],
  ['B', 'reads git', 'C#', DECLARED_ALARMS['the git name as an expected value, first argument of an assertion']],
  ['S', 'current version', 'JavaScript', "const pkg = JSON.parse(readFileSync('package.json', 'utf8'))"],
  ['S', 'current version', 'Python', 'from billing import __version__'],
  ['S', 'current version', 'Python', 'assert billing.__version__ == billing.get_version()'],
  ['S', 'current version', 'Rust', 'assert_eq!(env!("CARGO_PKG_VERSION"), "0.3.1");'],
  ['S', 'line number', 'JavaScript', "expect(out).toContain('src/cart.ts:42')"],
  ['S', 'line number', 'JavaScript', 'expect(out).toContain(`${file}.ts:42`)'],
  ['S', 'line number', 'C', 'assert(strstr(msg, "parser.c:120"));'],
  ['B', null, 'Python', 'header = data[self.offset:4]'],
  ['B', null, 'Go', 'chunk := buf[r.off:8]'],
  ['B', null, 'C#', 'var n = list.Any() ? list.Count:0;'],
  ['B', null, 'JavaScript', "await fetch('http://api.example.com:8080/health')"],
  ['B', null, 'Python', 'conn = connect("db.internal:5432")'],
  ['S', null, 'Kotlin', STATE_UNREAD['the clock in milliseconds']],
  ['S', null, 'Java', STATE_UNREAD['the clock in nanoseconds']],
  ['S', null, 'Python', STATE_UNREAD['the monotonic clock']],
  ['S', null, 'Go', STATE_UNREAD['the time elapsed since']],
  ['S', 'real clock', 'Rust', 'let now = SystemTime::now();'],
  ['S', 'real clock', 'JavaScript', 'const t = performance.now()'],
  ['B', null, 'Python', 'self.assertEqual(parse("2026-01-01T10:00").date(), date(2026, 1, 1))'],
  ['B', null, 'Go', 'clock := fakeClock{}; if got := Stamp(clock.Now()); got != want {'],
  ['B', null, 'Python', 'clock.now = lambda: FIXED'],
  ['B', null, 'JavaScript', "const t = mock.timers; t.enable({ apis: ['Date'], now: 0 }); expect(stamp(clock.now())).toBe(0)"],
  ['B', null, 'Ruby', 'expect(schedule.today).to eq(Date.new(2024, 1, 1))'],
  ['S', 'doc text', 'JavaScript', "const t = readFileSync(join(ROOT, 'docs', 'guide.md'), 'utf8')"],
  ['S', 'doc text', 'JavaScript', "const t = readFileSync(join(ROOT, 'notes.txt.bak'))"],
  ['S', 'doc text', 'Python', 'text = (ROOT / "docs" / "guide.md").read_text()'],
  ['S', null, 'JavaScript', STATE_UNREAD['the long markdown extension']],
  ['B', null, 'JavaScript', "writeFileSync(join(tmp, 'input.txt'), 'a,b')"],
  ['B', null, 'Python', '(tmp_path / "input.txt").write_text("a,b")'],
  ['B', null, 'Go', 'os.WriteFile(filepath.Join(dir, "input.txt"), data, 0o644)'],
  ['B', null, 'JavaScript', "const res = await request(app).get('/index.html')"],
  ['B', null, 'JavaScript', "box.write('.vibeflow/specs/cart.md', '# Cart')"],
];
const AUDIT_EXTENSIONS = { ...EXTENSIONS, Rust: 'rs', C: 'c', Java: 'java' };

test('the audit\'s table has its 45 lines, names the unread state lines and declares one behavior alarm', () => {
  assert.equal(AUDIT_ROWS.length, 45);
  const alarms = AUDIT_ROWS.filter(([kind, family]) => kind === 'B' && family !== null).map(([, , , line]) => line);
  assert.deepEqual(alarms.sort(), Object.values(DECLARED_ALARMS).sort());
  const unread = AUDIT_ROWS.filter(([kind, family]) => kind === 'S' && family === null).map(([, , , line]) => line);
  assert.deepEqual(unread.sort(), Object.values(STATE_UNREAD).sort());
});

test('check-probes names the family of each line of the audit\'s table, and no family on the others', async (t) => {
  const box = makeSandbox();
  try {
    const rows = AUDIT_ROWS.map(([kind, family, language, line], index) => ({ kind, family, language, line, path: `rows/${index}.${AUDIT_EXTENSIONS[language]}` }));
    for (const row of rows) box.write(row.path, `${row.line}\n`);
    const result = runScript('check-probes.mjs', [box.repo, '--dir', 'rows'], box.env());
    for (const row of rows) {
      const alarm = Object.entries(DECLARED_ALARMS).find(([, line]) => line === row.line)?.[0];
      const unread = Object.entries(STATE_UNREAD).find(([, line]) => line === row.line)?.[0];
      const label = alarm ? `declared alarm: ${alarm}` : unread ? `state not read: ${unread}` : row.kind === 'S' ? 'state' : 'behavior';
      await t.test(`${row.language} · ${label} · ${row.line}`, () => {
        const found = new RegExp(`^${escape(row.path)}:1 \\[([^\\]]+)\\]`, 'm').exec(result.stdout)?.[1] ?? null;
        assert.equal(found, row.family, `${row.line}\n${result.out}`);
      });
    }
    const flagged = AUDIT_ROWS.filter(([, family]) => family !== null).length;
    assert.match(result.stdout, new RegExp(`^${AUDIT_ROWS.length} probe file\\(s\\) read; ${flagged} suspect line\\(s\\)$`, 'm'));
  } finally {
    box.cleanup();
  }
});

// Criterion 3 of the fix: a probe that writes its fixtures and keeps document paths in constants
// pins no document; a line that reads a document does.
test('check-probes: writing ten .txt fixtures and keeping three document paths in constants is no doc text; reading a .md is', () => {
  withSandbox((box) => {
    const writes = Array.from({ length: 10 }, (_, index) => `writeFileSync(join(tmp, 'case-${index}.txt'), 'a,b\\n')`);
    const constants = ["const GUIDE = 'docs/guide.md'", "const PAGE = 'site/index.html'", "const NOTES = `${ROOT}/notes.rst`"];
    box.write('tests/fixtures.test.js', `// ${MARK} fixtures-p1\n${[...writes, ...constants].join('\n')}\n`);
    const quiet = runScript('check-probes.mjs', [box.repo], box.env());
    assert.equal(quiet.status, 0, quiet.out);
    assert.match(quiet.stdout, /^1 probe file\(s\) read; 0 suspect line\(s\)$/m, quiet.out);
    box.write('tests/fixtures.test.js', `// ${MARK} fixtures-p1\n${[...writes, ...constants, 'const text = readFileSync(GUIDE_DIR + \'/guide.md\', \'utf8\')'].join('\n')}\n`);
    const read = runScript('check-probes.mjs', [box.repo], box.env());
    assert.equal(read.status, 1, read.out);
    assert.equal((read.stdout.match(/ \[doc text\] /g) ?? []).length, 1, read.out);
    assert.match(read.stdout, /^1 probe file\(s\) read; 1 suspect line\(s\)$/m, read.out);
  });
});

// ------------------------------------- fix 2: the families as the sum of what they read before

// The families at e04b531, the last release before part 3, kept here frozen as the reference: copied
// from `git show e04b531:plugins/vibeflow/skills/implement/loop/scripts/check-probes.mjs`, lines
// 29 to 34. They do not change when the script changes.
const E04B531_FAMILIES = [
  ['reads git', /\b(execFileSync|execFile|spawnSync|spawn|execSync|exec)\(\s*['"`]git\b|subprocess\.\w+\(\s*\[\s*['"]git|\bgit (diff|log|show|rev-parse|status|ls-files)\b|origin\/(main|master)|HEAD~\d/],
  ['current version', /\bVERSION\b|['"]version['"]|\.version\b|package\.json|CHANGELOG|__version__|['"]v?\d+\.\d+\.\d+['"]/],
  ['state that changes by itself', /\b(still|remains|is)\s+(pending|open|unfixed|todo)\b|\bnot yet (done|fixed|implemented|shipped)\b/i],
  ['line number', /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|md|sh):\d+\b/],
  ['real clock', /\bDate\.now\(\)|new Date\(\s*\)|datetime\.(now|today|utcnow)\(|date\.today\(|time\.time\(\)/],
  ['doc text', /\b(readFileSync|readFile|read_text|open)\([^)]*\.(md|html|txt)\b/],
];
const readAtE04b531 = (line) => E04B531_FAMILIES.some(([, pattern]) => pattern.test(line));
// The two lines the families no longer read, by the spec of fix 2: a line that is only a comment
// (it runs nothing), and a line that opens a file to write it (a mode after a comma).
const IS_COMMENT = /^\s*(\/\/|#|--|;|\/\*|\*|<!--)/;
const OPENS_TO_WRITE = /,\s*['"][wax]\+?b?['"]/;

// The re-audit's table of part 3: 54 lines, 27 that pin state and 27 of common behavior, each with
// the family check-probes names on it, or null. Of the state lines, the ones e04b531 read are read;
// the ones no version reads stay unread, by name. Of the behavior lines, three are read, by name.
const REAUDIT_STATE_UNREAD = {
  'a document path kept in a constant': "const GUIDE = join(ROOT, 'docs/guide.md')",
  'a document embedded at build time': 'const README: &str = include_str!("../README.md");',
  'a document read through Files.lines': 'var lines = Files.lines(Path.of("README.md"))',
  'the program name kept in a constant': "const GIT = 'git'",
  'a process call through that constant': "spawnSync(GIT, ['describe', '--tags'])",
};
const REAUDIT_ALARMS = {
  'a fixture read back that e04b531 read too': "assert.equal(readFileSync(join(tmp, 'out.txt'), 'utf8'), 'a,b')",
  'a test title that starts with the program and a word': "test('git branch names are validated', () => {",
  'a message that starts with the program and a word': "assert.match(result.stderr, /git is not installed/); expect(msg).toBe('git not found')",
};
const REAUDIT_ROWS = [
  ['S', 'reads git', 'js', 'const out = execSync(`git ${args}`, { cwd: repo })'],
  ['S', 'reads git', 'js', "const out = execSync('git -C ' + dir + ' describe --tags')"],
  ['S', 'reads git', 'js', 'const out = execSync("git --no-pager log -1")'],
  ['S', 'reads git', 'js', "const v = execSync('git --version')"],
  ['S', 'reads git', 'js', "const r = spawnSync('git')"],
  ['S', 'reads git', 'js', 'const out = execSync(`git log -1`)'],
  ['S', 'reads git', 'py', 'out = subprocess.check_output(["git", "-C", repo, "log"])'],
  ['S', 'line number', 'js', "expect(out).toContain('src/cart.test.ts:42')"],
  ['S', 'line number', 'js', "expect(out).toContain('src/user.service.ts:12')"],
  ['S', 'line number', 'js', 'assert.match(report, /index.d.ts:5/)'],
  ['S', 'line number', 'py', 'assert "tests/test_cart.py:42" in out'],
  ['S', 'line number', 'js', "expect(msg).toContain('README.md:3')"],
  ['S', 'line number', 'js', "expect(msg).toContain('jquery.min.js:2')"],
  ['S', 'line number', 'js', "expect(msg).toContain('Button.stories.tsx:9')"],
  ['S', 'real clock', 'js', 'const t = Date.now()'],
  ['S', 'real clock', 'py', 'now = datetime.datetime.now()'],
  ['S', 'real clock', 'py', 'today = date.today()'],
  ['S', 'doc text', 'js', "const t = readFileSync(join(ROOT, 'docs', 'guide.html'), 'utf8')"],
  ['S', 'doc text', 'py', 'with open("README.md") as f:'],
  ['S', 'doc text', 'js', "const t = readFileSync(`${ROOT}/notes.txt`, 'utf8')"],
  ['S', 'real clock', 'cpp', 'auto t = std::chrono::system_clock::now();'],
  ['S', 'real clock', 'cpp', 'auto t = std::chrono::steady_clock::now();'],
  ['S', null, 'js', REAUDIT_STATE_UNREAD['a document path kept in a constant']],
  ['S', null, 'rs', REAUDIT_STATE_UNREAD['a document embedded at build time']],
  ['S', null, 'java', REAUDIT_STATE_UNREAD['a document read through Files.lines']],
  ['S', null, 'js', REAUDIT_STATE_UNREAD['the program name kept in a constant']],
  ['S', null, 'js', REAUDIT_STATE_UNREAD['a process call through that constant']],
  ['B', null, 'py', 'with open(tmp_path / "input.txt", "w") as f: f.write("a,b")'],
  ['B', null, 'rb', 'File.open("input.txt", "w") { |f| f.write("a,b") }'],
  ['B', null, 'c', 'FILE *f = fopen("out.txt", "w");'],
  ['B', null, 'js', "const payload = { file: 'report.txt' }"],
  ['B', null, 'js', "await upload(page, 'fixtures/report.txt')"],
  ['B', null, 'js', "const thread = createThread('notes.md')"],
  ['B', null, 'js', "await server.ready; const res = await request(app).get('/index.html')"],
  ['B', null, 'js', "await page.goto('/index.html'); await page.waitForLoadState()"],
  ['B', null, 'js', "const spread = { ...base, name: 'a.md' }"],
  ['B', 'doc text', 'js', REAUDIT_ALARMS['a fixture read back that e04b531 read too']],
  ['B', null, 'js', "const downloaded = await download('export.txt')"],
  ['B', null, 'java', 'var d = LocalDate.now(fixedClock);'],
  ['B', null, 'java', 'var t = Instant.now(clock);'],
  ['B', null, 'js', 'const t = scheduler.now()'],
  ['B', null, 'js', 'jest.advanceTimersByTime(1000); expect(jest.now()).toBe(1000)'],
  ['B', null, 'go', 'c := clockwork.NewFakeClock(); start := c.Now()'],
  ['B', null, 'py', 'env = simpy.Environment(); assert env.now == 0'],
  ['B', null, 'js', 'expect(timeline.today).toBe(day)'],
  ['B', null, 'py', 'chunk = text[self.pos:10]'],
  ['B', null, 'py', 'head = data[m.end:4]'],
  ['B', null, 'java', '@TestPropertySource(properties = "server.port:0")'],
  ['B', null, 'js', "const url = 'http://api.local:8080/health'"],
  ['B', null, 'py', 'conn = connect("redis.svc:6379")'],
  ['B', null, 'yml', 'image: redis.io:7'],
  ['B', 'reads git', 'js', REAUDIT_ALARMS['a test title that starts with the program and a word']],
  ['B', 'reads git', 'js', REAUDIT_ALARMS['a message that starts with the program and a word']],
  ['B', null, 'py', 'assert detect_vcs(path) == "git"'],
];

test('the re-audit\'s table has its 54 lines, half state and half behavior, and names its unread state lines and its three behavior alarms', () => {
  assert.equal(REAUDIT_ROWS.length, 54);
  assert.equal(REAUDIT_ROWS.filter(([kind]) => kind === 'S').length, 27);
  const alarms = REAUDIT_ROWS.filter(([kind, family]) => kind === 'B' && family !== null).map(([, , , line]) => line);
  assert.deepEqual(alarms.sort(), Object.values(REAUDIT_ALARMS).sort());
  const unread = REAUDIT_ROWS.filter(([kind, family]) => kind === 'S' && family === null).map(([, , , line]) => line);
  assert.deepEqual(unread.sort(), Object.values(REAUDIT_STATE_UNREAD).sort());
});

test('check-probes names the family of each line of the re-audit\'s table, and no family on the others', async (t) => {
  const box = makeSandbox();
  try {
    const rows = REAUDIT_ROWS.map(([kind, family, ext, line], index) => ({ kind, family, ext, line, path: `rows/${index}.${ext}` }));
    for (const row of rows) box.write(row.path, `${row.line}\n`);
    const result = runScript('check-probes.mjs', [box.repo, '--dir', 'rows'], box.env());
    for (const row of rows) {
      const alarm = Object.entries(REAUDIT_ALARMS).find(([, line]) => line === row.line)?.[0];
      const unread = Object.entries(REAUDIT_STATE_UNREAD).find(([, line]) => line === row.line)?.[0];
      const label = alarm ? `declared alarm: ${alarm}` : unread ? `state not read: ${unread}` : row.kind === 'S' ? 'state' : 'behavior';
      await t.test(`${row.ext} · ${label} · ${row.line}`, () => {
        const found = new RegExp(`^${escape(row.path)}:1 \\[([^\\]]+)\\]`, 'm').exec(result.stdout)?.[1] ?? null;
        assert.equal(found, row.family, `${row.line}\n${result.out}`);
      });
    }
  } finally {
    box.cleanup();
  }
});

// Every line of a text file under test/ in this repository, as it is on disk now.
function testFolderLines() {
  const lines = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const text = readFileSync(path, 'utf8');
        if (!text.includes('\0')) lines.push(...text.split('\n'));
      }
    }
  };
  walk(join(ROOT, 'test'));
  return lines;
}

// Fix 2, criterion 1, as a property over a corpus that is not chosen by hand: every line of the files
// under test/, the audit's 45 lines and the re-audit's 54. Each line of it that is not only a comment,
// does not open a file to write, and that the families of e04b531 read, check-probes reads too.
test('check-probes reads every line the families of e04b531 read, over the lines of test/ and both tables, except comments and writes', () => {
  const corpus = [...testFolderLines(), ...AUDIT_ROWS.map(([, , , line]) => line), ...REAUDIT_ROWS.map(([, , , line]) => line)];
  const read = [...new Set(corpus.filter((line) => !IS_COMMENT.test(line) && !OPENS_TO_WRITE.test(line) && readAtE04b531(line)))];
  // The corpus is the real one: hundreds of lines, the tables' state lines among them.
  assert.ok(read.length > 300, `${read.length} lines`);
  for (const [kind, , , line] of REAUDIT_ROWS) if (kind === 'S' && readAtE04b531(line)) assert.ok(read.includes(line), line);
  withSandbox((box) => {
    box.write('corpus/lines.txt', `${read.join('\n')}\n`);
    const result = runScript('check-probes.mjs', [box.repo, '--dir', 'corpus'], box.env());
    const flagged = new Set([...result.stdout.matchAll(/^corpus\/lines\.txt:(\d+) \[/gm)].map((match) => Number(match[1]) - 1));
    const missed = read.filter((_, index) => !flagged.has(index));
    assert.deepEqual(missed, [], `${missed.length} of ${read.length} lines read at e04b531 are not read now`);
  });
});

// Fix 2, criterion 4: a line that is only a comment runs nothing, so no family reads it, whatever
// the comment marker; the same text as code is read.
const COMMENT_MARKERS = ['//', '#', '--', ';', '/*', '*', '<!--'];
const STATE_TEXTS = [
  "execSync('git describe --tags')",
  "expect(out).toContain('src/rules.ts:42')",
  "readFileSync('docs/guide.md', 'utf8')",
  'expect(stamp).toBeLessThan(Date.now())',
  "expect(pkg.version).toBe('4.4.1')",
];

test('check-probes reads no line that is only a comment, in any comment marker, and reads the same text as code', () => {
  withSandbox((box) => {
    const comments = COMMENT_MARKERS.flatMap((marker) => STATE_TEXTS.map((text) => `  ${marker} ${text}`));
    box.write('probes/comments.txt', `${comments.join('\n')}\n`);
    box.write('probes/code.txt', `${STATE_TEXTS.join('\n')}\n`);
    const result = runScript('check-probes.mjs', [box.repo, '--dir', 'probes'], box.env());
    assert.ok(!/^probes\/comments\.txt:/m.test(result.stdout), result.out);
    assert.equal((result.stdout.match(/^probes\/code\.txt:\d+ \[/gm) ?? []).length, STATE_TEXTS.length, result.out);
    assert.match(result.stdout, new RegExp(`^2 probe file\\(s\\) read; ${STATE_TEXTS.length} suspect line\\(s\\)$`, 'm'), result.out);
  });
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

// git grep quotes a path with a byte outside ASCII unless core.quotePath is off; the quote must not
// hide a document's extension, nor turn the path of a reader into another one.
test('who-reads reads a path with an accent as git stores it: a document mentions, a script reads', () => {
  withSandbox((box) => {
    box.write('src/alone.ts', 'export {}\n');
    box.write('docs/decisões.md', 'We split src/alone.ts.\n');
    const mention = runScript('who-reads.mjs', [box.repo, 'src/alone.ts'], box.env());
    assert.equal(mention.status, 0, mention.out);
    assert.match(mention.stdout.normalize('NFC'), /^ {8}docs\/decisões\.md:1:/m, mention.out);
    box.write('tools/publicação.sh', 'cp src/alone.ts dist/\n');
    const reader = runScript('who-reads.mjs', [box.repo, 'src/alone.ts'], box.env());
    assert.equal(reader.status, 1, reader.out);
    assert.match(reader.stdout.normalize('NFC'), /^ {2}reads tools\/publicação\.sh:1:/m, reader.out);
    assert.match(reader.stdout.normalize('NFC'), /^ {8}docs\/decisões\.md:1:/m, reader.out);
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
