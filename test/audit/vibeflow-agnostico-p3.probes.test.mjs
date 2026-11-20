// vibeflow-probe: vibeflow-agnostico-p3
// Behavior probes from the audit of part 3 of vibeflow-agnostico: check-probes reads probes in any
// language, and who-reads counts any reference outside prose as a reader. Each case states, as
// comments, the contract it protects, the plausible regression that breaks it, and why the
// implementer's tests did not catch it. A case marked `todo` asserts what a known open finding
// asks for: it runs and prints without failing the suite.
// Every line the scripts read is assembled from pieces, and the comments name the forms in words,
// so check-probes run on this repository finds no suspect line in this file.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runScript, withSandbox } from '../loop-helpers.mjs';

const G = ['g', 'it'].join('');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Writes each line in its own file under probes/ and returns, per file, the family named on it
// (null when the line is not a suspect).
function familiesOf(box, lines) {
  const paths = lines.map((line, index) => {
    const path = `probes/case${index}.py`;
    box.write(path, `${line}\n`);
    return path;
  });
  const result = runScript('check-probes.mjs', [box.repo, '--dir', 'probes'], box.env());
  return paths.map((path) => new RegExp(`^${escape(path)}:1 \\[([^\\]]+)\\]`, 'm').exec(result.stdout)?.[1] ?? null);
}

// Contract: spec part 3, item 3: the families stay neutral to the language "and the script keeps
// finding what it finds today in JavaScript and Python"; at e04b531 a JavaScript process call
// whose command string starts with the version-control program read as a git read, whatever the
// subcommand.
// Breaks when: the git family keeps only the program name as a string of its own plus the six
// listed subcommands, so describe, branch, rev-list or tag in an exec string pass as behavior
// (the form at e6a5b11).
// Not covered by: the family table's JavaScript row passes the program name as its own argument
// and names the default remote branch, two forms the new family still matches.
test('check-probes: a JavaScript exec of git with any subcommand reads git, as at e04b531', () => {
  withSandbox((box) => {
    const lines = [
      `const tag = execSync('${G} describe --tags').toString()`,
      `const branch = execSync('${G} branch --show-current', { encoding: 'utf8' })`,
      `const count = execSync(\`${G} rev-list --count HEAD\`)`,
      `const tags = execSync("${G} tag --list")`,
    ];
    assert.deepEqual(familiesOf(box, lines), lines.map(() => 'reads git'));
  });
});

// Contract: spec part 3, item 4: "a reference in a document is a mention"; the README of the loop
// lists the document extensions, with no condition on the file's name.
// Breaks when: the document test reads the path as git grep prints it, and git quotes a path with
// a byte outside ASCII (an octal escape inside double quotes), so the closing quote hides the
// extension and the document reads as a reader (the form at e6a5b11).
// Not covered by: every document path in the implementer's tests is plain ASCII.
test('who-reads: a document whose name has an accent is a mention, and alone it exits 0', () => {
  withSandbox((box) => {
    box.write('src/alone.ts', 'export {}\n');
    box.write(['docs/decisões', 'md'].join('.'), 'We split src/alone.ts.\n');
    box.git('add', '-A');
    const result = runScript('who-reads.mjs', [box.repo, 'src/alone.ts'], box.env());
    assert.ok(!/^ {2}reads .*decis/m.test(result.stdout), result.out);
    assert.equal(result.status, 0, result.out);
  });
});

// Contract: spec part 3, item 4: a reader is any file that is not a document, and the documents
// are the five prose extensions; a web page that loads a script reads it, and a document keeps
// being a mention when its extension is written in capitals.
// Breaks when: the document list grows to markup that loads code (an HTML page), or the
// extension test starts to care about letter case; in the audit's mutation run over a copy of
// e6a5b11, both changes left the seven test files of the subject green.
// Not covered by: the implementer's who-reads table has no HTML file and only lowercase
// document extensions.
test('who-reads: an HTML page that loads the file reads it, and a document with a capital extension mentions it', () => {
  withSandbox((box) => {
    box.write('src/app.js', 'export {}\n');
    box.write(['site/index', 'html'].join('.'), '<script type="module" src="../src/app.js"></script>\n');
    box.write(['docs/NOTES', 'MD'].join('.'), 'The entry point is src/app.js.\n');
    box.git('add', '-A');
    const result = runScript('who-reads.mjs', [box.repo, 'src/app.js'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /^ {2}reads site\/index\.html:/m, result.out);
    assert.match(result.stdout, /^ {8}docs\/NOTES\.MD:/m, result.out);
  });
});

// Contract: spec part 3, item 3, clock family: a now, today or utcnow call on any receiver, a
// bare Date constructor call and the Python epoch call; nothing there names a method called date.
// Breaks when: the Date-constructor alternative is read without letter case, so Python's date
// method on a parsed datetime, a plain behavior check, reads as the real clock (the form at
// e6a5b11).
// Not covered by: the family table's control lines never call a method named date.
test('check-probes: the date method of a parsed Python datetime is not the real clock', () => {
  withSandbox((box) => {
    const call = ['parse("2026-01-01T10:00").da', 'te()'].join('');
    assert.deepEqual(familiesOf(box, [`self.assertEqual(${call}, expected)`]), [null]);
  });
});

// Every form spec part 3, item 3 names, each alone on its line: no other form of any family is on
// the line, so the case holds that form by itself. Pieces are joined so this file has none of them.
const j = (...pieces) => pieces.join('');
const FORMS = [
  ['reads git', 'Python, relative revision', j('prev = repo.rev_parse("HEA', 'D~2")')],
  ['reads git', 'JavaScript, default remote branch', j("const base = 'origin/", "main'")],
  ['reads git', 'Go, older default remote branch', j('base := "origin/', 'master"')],
  ['current version', 'Go, version constant', j('assert.Equal(t, VER', 'SION, Release())')],
  ['current version', 'JavaScript, version member', j('expect(pkg.ver', 'sion).toBe(release())')],
  ['current version', 'Python, version key', j('assert manifest["ver', 'sion"] == release()')],
  ['current version', 'Ruby, changelog file', j('entries = parse(File.read(root + "/CHANGE', 'LOG"))')],
  ['real clock', 'Rust, path call', j('let t = SystemTime:', ':now();')],
  ['real clock', 'Python, today', j('d = date.to', 'day()')],
  ['real clock', 'C#, Today property', j('var d = DateTime.To', 'day;')],
  ['real clock', 'Python, epoch seconds', j('t = time.ti', 'me()')],
  ['doc text', 'JavaScript, template literal', j('const t = readFileSync(`docs/${name}.', 'md`)')],
];

// Contract: spec part 3, item 3: each family reads the forms the spec lists, in any language: for
// git, the relative revision and the default remote branch; for version, the constant, the
// member, the key and the changelog; for the clock, now through a path separator, today and the
// Python epoch call; for document text, a template literal ending in a document file.
// Breaks when: an alternative of a family is dropped or narrowed; in the audit's mutation run
// over a copy of e6a5b11, dropping the relative revision, the default branch, the version
// constant, the version member, the path separator, today or the epoch call left the seven test
// files of the subject green.
// Not covered by: the family table writes one line per family and language, and most of its
// state lines carry a second form (a version literal next to the constant, the program name next
// to the subcommand), so a single alternative can go without a test turning red.
test('check-probes: each form the spec names reads as its family on a line of its own', () => {
  withSandbox((box) => {
    const found = familiesOf(box, FORMS.map(([, , line]) => line));
    const wrong = FORMS.map(([family, name, line], index) => (found[index] === family ? null : `${name}: expected ${family}, got ${found[index]} · ${line}`))
      .filter(Boolean);
    assert.deepEqual(wrong, []);
  });
});

// ------------------------------------------------ reaudit 1 of part 3 (fix 1, commit 724b8d0)

// Contract: spec part 3, item 3, "the script keeps finding what it finds today in JavaScript and
// Python", and fix 1, criterion 2: a state line the families read at e04b531 is read. At e04b531
// a process call whose command string starts with the program name read as a git read, whatever
// came after the name.
// Breaks when: the command-line form asks for a lowercase word right after the program name and a
// space, so a string whose next token is an option or an interpolation passes as behavior (the
// form at 724b8d0).
// Not covered by: the audit's table of 45 lines and the F1 probe write every command line as the
// program name, a space and a lowercase subcommand.
test('check-probes: a git command line in a string reads git when an option or an interpolation follows the program name, as at e04b531', () => {
  withSandbox((box) => {
    const lines = [
      'const out = execSync(`' + G + ' ${args}`, { cwd: repo })',
      `const out = execSync('${G} -C ' + dir + ' describe --tags')`,
      `const out = execSync("${G} --no-pager show -s")`,
      `const v = execSync('${G} --version')`,
    ];
    assert.deepEqual(familiesOf(box, lines), lines.map(() => 'reads git'));
  });
});

// Contract: spec part 3, item 3 ("keeps finding what it finds today in JavaScript") and fix 1,
// criterion 2: at e04b531 a known source extension followed by a colon and a number read as a
// line number, whatever came before the extension.
// Breaks when: the name before the extension may not follow a dot (the guard against a host name
// with several dots), so a file name with two dots, the usual shape of a test or a declaration
// file in TypeScript, and a regex with the dot escaped pass as behavior (the form at 724b8d0).
// Not covered by: the table's line numbers all follow a name with a single dot.
test('check-probes: a line number after a file name with two dots, or after an escaped dot, reads as a line number, as at e04b531', () => {
  withSandbox((box) => {
    const lines = [
      j("expect(out).toContain('src/cart.test.t", "s:42')"),
      j("expect(out).toContain('src/user.service.t", "s:12')"),
      j('assert.match(stack, /cart\\.t', 's:42/)'),
    ];
    assert.deepEqual(familiesOf(box, lines), lines.map(() => 'line number'));
  });
});

// Each form fix 1 of part 3 adds, alone on its line: the manifests of the version family, each of
// the four words that read in the doc text family, and two of the five names of a test clock.
const FIX1_FORMS = [
  ['current version', 'Rust, Cargo manifest', j('let text = std::fs::read_to_string("Cargo.to', 'ml")?;')],
  ['current version', 'Python, pyproject', j('data = tomllib.loads(Path("pyproject.to', 'ml").read_text())')],
  ['current version', 'C#, project file', j('var doc = XDocument.Load("Billing.cs', 'proj");')],
  ['current version', 'Ruby, gemspec', j('spec = Gem::Specification.load("billing.gem', 'spec")')],
  ['current version', 'Kotlin, Gradle build', j('val text = File("build.gra', 'dle.kts").readText()')],
  ['doc text', 'Python, open', j('with open(ROOT / "docs" / "guide.m', 'd") as f:')],
  ['doc text', 'Python, load', j('page = load(ROOT / "docs" / "guide.m', 'd")')],
  ['doc text', 'Swift, contents', j('let text = try String(contentsOfFile: "docs/guide.m', 'd")')],
  ['doc text', 'Python, read', j('text = Path("docs/guide.m', 'd").read_text()')],
  [null, 'Python, a stub clock', j('t = stub_time.n', 'ow()')],
  [null, 'Python, a frozen clock', j('t = frozen_time.n', 'ow()')],
  [null, 'JavaScript, a fixture whose name has the word read', j("writeFileSync(join(tmp, 'readme.t", "xt'), 'a,b')")],
  [null, 'JavaScript, a fixture whose name has the word load', j("box.write('docs/loading.m", "d', '# Loading')")],
  [null, 'Python, a fixture whose name has the word open', j('(tmp_path / "open-issues.t', 'xt").write_text("a")')],
];

// Contract: fix 1 of part 3, "the forms of the families": the version family reads the manifests
// of several ecosystems; the doc text family needs, outside the literals, one of the four words
// that read; the clock family skips a receiver whose name says it is a test clock.
// Breaks when: a manifest name or a read word is dropped, a test-clock name is dropped, or the read
// word is looked for inside the literals too (in the reaudit's mutation run over a copy of
// 724b8d0, each of these left the subject's test files green).
// Not covered by: the implementer's tables carry the npm manifest and the dunder name only, every
// doc line there reads with read or contents, its test clocks are named clock, fake or mock, and
// no literal in them has a read word inside.
test('check-probes: each form fix 1 adds reads as its family on a line of its own, and a read word inside a literal is no read', () => {
  withSandbox((box) => {
    const found = familiesOf(box, FIX1_FORMS.map(([, , line]) => line));
    const wrong = FIX1_FORMS.map(([family, name, line], index) => (found[index] === family ? null : `${name}: expected ${family}, got ${found[index]} · ${line}`))
      .filter(Boolean);
    assert.deepEqual(wrong, []);
  });
});

// Contract: fix 1 of part 3, doc text: "writing a .txt fixture does not count".
// Breaks when: the word that opens a file for writing counts as a read, so the usual way to write
// a fixture in Python and Ruby reads as document text (the form at 724b8d0).
// Not covered by: the implementer's case writes its ten fixtures with a JavaScript write call only.
test('check-probes: opening a fixture to write it is not reading a document', () => {
  withSandbox((box) => {
    const lines = [
      j('with open(tmp_path / "input.t', 'xt", "w") as f:'),
      j('File.open("input.t', 'xt", "w") { |f| f.puts("a,b") }'),
    ];
    assert.deepEqual(familiesOf(box, lines), [null, null]);
  });
});
