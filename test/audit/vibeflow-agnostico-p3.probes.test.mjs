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
