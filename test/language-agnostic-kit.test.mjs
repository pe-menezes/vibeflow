// The kit states a behavior; a language, framework, test runner, tool or
// manifest appears in its prose only as an example, and an example spans more
// than one ecosystem. Two properties over every sentence of the kit's prose:
// - P1: every term of the vocabulary that a sentence names sits inside the
//   excerpt an example mark ("for example", "such as", "or the equivalent", ...)
//   opens: after the mark, up to the parenthesis that closes it or the end of
//   its clause. A mark does not lend itself to a name before it or in another
//   clause of its sentence;
// - P2: an excerpt whose terms all belong to one ecosystem fails, because an
//   example of one stack reads as the rule.
// The prose is every `.md` and `.mdc` file under the edition folders that git
// knows, tracked or new and not ignored, so a new file is read without a change
// here. The vocabulary holds each term with its ecosystem, and covers the
// languages of the gate-languages fixture. A short list of exceptions, each
// with its files, the excerpt it covers and the reason, takes the excerpt out
// of the sentence before the terms are read; an exception whose excerpt no
// longer matches fails, so the list cannot outlive the text it was written for.
// Known limits: a word that is also English (COMMON) passes where no stack
// context reads it, so each of these sentences passes P1:
// - the object of a verb, with no preposition: "Prefer Go."
// - after "is", "are" or "as": "The project is Go.", "Rewrite the probes as Go."
// - before a noun outside the stack nouns: "Write Go probes."
// - after a preposition outside the stack context (like, onto, of, over): "Write the probes like
//   Go.", "Port the probes onto Swift.", "Base the probes on top of Go."
// More known limits, each sentence passing P1 and P2 unless the line says it fails:
// - a false alarm the other way, since "to" and "from" read a stack: "Walk from node to node."
//   and "Add an edge from node A to node B." fail P1
// - "E.g." capitalized with no colon ends the sentence, so "E.g. Jest or pytest." fails P1
// - a parenthesized list of "`x` in Y" pairs after a marked list in the same sentence reads as
//   an example with no mark of its own, and P2 does not read it (N3): "Mark each probe (for
//   example `todo` in node:test, `xfail` in pytest); every probe uses (`test.failing` in Jest)."
// - an excerpt runs past a comma followed by "and" and a term (N4): "Use a mutation tool such as
//   Stryker or mutmut, and Jest for the probes."
// - in the files listed for the runtime, a Node.js version is taken out wherever it is, and any
//   loop/scripts path counts as the kit's (N5): "This applies to Node 18+ projects only." and
//   "Run the tests with `node ./loop/scripts/app.mjs`." pass in the audit editions
// - the vocabulary is closed and read with its case (A6): "Write every probe with Playwright.",
//   "Write the probes in Bash.", "Write the probes in rust."
// - the generated COMMON_CASES cover only the prepositions in PREPOSITIONS (in, to, into, from,
//   with, using): the other words of STACK_BEFORE (on, for, via, and the verbs use, run and
//   install with their -s forms) have no generated case, so taking any of them out of
//   STACK_BEFORE, say "for" to quiet "for node in graph", leaves every test of the part green
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES } from './fixtures/gate-languages/matrix.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT_DIRS = ['plugins', 'cursor', 'copilot', 'opencode'];

// ------------------------------------------------------------------ the prose

function kitFiles() {
  // A hook or a pre-commit run sets GIT_DIR and friends; the list is this
  // checkout's, whatever the caller's environment says.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...KIT_DIRS],
    { cwd: ROOT, env, encoding: 'utf8' });
  return [...new Set(listed.split('\0'))]
    .filter((path) => /\.(md|mdc)$/.test(path) && existsSync(join(ROOT, path)))
    .sort();
}

// The unit is the sentence. The lines of a paragraph or of a list item join;
// a heading, a table row, a front matter line and a line inside a code fence
// stand alone (a front matter line indented under the previous one joins it).
// A sentence ends at a period, a semicolon or a colon followed by a capital
// letter, a backtick, a parenthesis or a bold opener, and at the end of its
// block; "e.g." and "i.e." in lowercase end nothing (a capitalized "E.g." with no
// colon does end it, a known limit in the header), and neither does a colon right after an
// example mark in any case ("for example:", "For example:"), which introduces
// the example.
const BREAK = /(?<=[.;:])(?<!\be\.g\.)(?<!\bi\.e\.)\s+(?=[A-Z`(*])/g;
const MARK_COLON = /\b(?:for example|for instance|such as|or the equivalent|e\.g\.):$/i;

function sentences(content) {
  const blocks = [];
  let block = null;
  const flush = () => {
    if (block) blocks.push(block);
    block = null;
  };
  const add = (text, line, join) => {
    if (block && join) {
      block.starts.push([block.text.length + 1, line]);
      block.text += ` ${text}`;
    } else {
      flush();
      block = { text, starts: [[0, line]] };
    }
  };
  const lines = content.split('\n');
  let front = lines[0].trim() === '---';
  let fence = null;
  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (front) {
      if (index === 0) return;
      if (text === '---') {
        front = false;
        flush();
      } else if (text) add(text, line, /^\s/.test(raw));
      return;
    }
    if (fence) {
      if (text.startsWith(fence)) {
        fence = null;
        flush();
      } else if (text) add(text, line, false);
      return;
    }
    const open = /^(`{3,}|~{3,})/.exec(text);
    if (open) {
      flush();
      fence = open[1];
      return;
    }
    if (!text || /^(-{3,}|\*{3,}|_{3,})$/.test(text)) {
      flush();
      return;
    }
    const alone = /^(#{1,6}\s|\|)/.test(text);
    const opens = alone || /^([-*+]\s|\d+[.)]\s)/.test(text);
    add(text, line, !opens);
    if (alone) flush();
  });
  flush();

  const out = [];
  for (const { text, starts } of blocks) {
    let from = 0;
    const cuts = [...text.matchAll(BREAK)].filter((cut) => !MARK_COLON.test(text.slice(0, cut.index)));
    for (const cut of [...cuts, { index: text.length, 0: '' }]) {
      const sentence = text.slice(from, cut.index).trim();
      if (sentence) {
        const line = starts.filter(([offset]) => offset <= from).at(-1)[1];
        out.push({ text: sentence, line });
      }
      from = cut.index + cut[0].length;
    }
  }
  return out;
}

// ------------------------------------------------------------- the vocabulary

// Each term names a language, a framework, a test runner or marker, a tool or a
// manifest, under the ecosystem it belongs to. A tool that serves several
// stacks sits under the one it was born in. Left out on purpose: names of the
// host (the Bash, Glob and Grep tools), of git and GitHub, and of what the
// Critical Gate's rule families read (SQL, Terraform, Kubernetes), which are
// not the project's stack. A term that is also an English word counts only
// where it names a stack (COMMON, below).
const VOCABULARY = {
  javascript: ['JavaScript', 'TypeScript', 'TSX', 'Node.js', 'Node', 'node', 'node:test', 'npm', 'npx', 'pnpm', 'Yarn',
    'Deno', 'Bun', 'Jest', 'Vitest', 'Mocha', 'test.failing', 'Stryker', 'fast-check', 'package.json', 'tsconfig.json',
    'ESLint', 'React', 'React Native', 'Next.js', 'Nuxt', 'Vue', 'Angular', 'Svelte', 'Express'],
  python: ['Python', 'pytest', 'xfail', 'unittest', 'expectedFailure', 'mutmut', 'Hypothesis', 'pyproject.toml',
    'requirements.txt', 'pip', 'Poetry', 'Django', 'Flask', 'FastAPI', 'mypy', 'Ruff'],
  rust: ['Rust', 'cargo', 'Cargo.toml', 'cargo-mutants', 'proptest', 'Clippy'],
  go: ['Go', 'go.mod', 'go test', 't.Skip', 'interface{}', 'gofmt'],
  dotnet: ['C#', 'F#', '.NET', 'dotnet', '.csproj', 'xUnit', 'NUnit', 'MSTest', 'FsCheck', 'Blazor'],
  jvm: ['Java', 'Kotlin', 'Scala', 'JUnit', '@Disabled', 'jqwik', 'PIT', 'Maven', 'Gradle', 'build.gradle', 'pom.xml',
    'Spring', 'Android', 'KMP'],
  swift: ['Swift', 'Swift Testing', 'withKnownIssue', 'XCTest', 'Package.swift', 'SwiftUI', 'Xcode', 'iOS'],
  dart: ['Dart', 'Flutter'],
  ruby: ['Ruby', 'Rails', 'RSpec', 'Gemfile', '.gemspec', 'Bundler'],
  php: ['PHP', 'PHPUnit', 'Composer', 'composer.json', 'Laravel'],
  shell: ['Shell', 'Bats'],
  c: ['C++', 'Makefile', 'CMake'],
};

const ECOSYSTEM = new Map(Object.entries(VOCABULARY).flatMap(([ecosystem, terms]) => terms.map((t) => [t, ecosystem])));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A term is read where a word ends it, so a term glued to a hyphenated word
// ("Jest-only") or inside a dotted or @ name (`@pytest.mark.xfail`) counts; a
// longer term of the vocabulary that holds it ("cargo-mutants", "Node.js",
// "go.mod") is read instead, because the alternation tries the longest first.
const termSource = (term) => {
  const left = /^\w/.test(term) ? '(?<![\\w-])' : '';
  const right = /\w$/.test(term) ? '(?!\\w)' : /[#+]$/.test(term) ? '(?![\\w#+])' : '';
  return `${left}${escape(term)}${right}`;
};
const TERMS = new RegExp([...ECOSYSTEM.keys()].sort((a, b) => b.length - a.length).map(termSource).join('|'), 'g');

// Terms that are also ordinary English words ("Go to the next phase", "each node
// of the graph", "Express each check", "Swift answers"). One counts only where it
// names a stack: inside backticks, inside an example excerpt, after a word that
// introduces a stack ("in Go", "with Express", "use React", "port it to Go",
// "migrate into Swift", "move from node"), before "'s" or a version, glued to a
// hyphenated word, or before a noun of a stack ("a Go project", "Swift code").
const COMMON = new Set(['Go', 'node', 'Express', 'Swift']);
const STACK_BEFORE = /\b(in|into|to|from|with|using|use|uses|run|runs|install|installs|on|for|via)\s+$/i;
const STACK_AFTER = new RegExp(`^(?:'s\\b|\\s+v?\\d|-\\w|\\s+(?:${[
  'project', 'code', 'codebase', 'module', 'package', 'test', 'app', 'application', 'service', 'file', 'version',
  'developer', 'toolchain', 'runtime', 'compiler', 'library', 'libraries', 'framework', 'server', 'stack', 'ecosystem',
  'source', 'script', 'program', 'SDK', 'build', 'binary', 'binaries', 'style', 'idiom', 'type',
].join('|')})s?\\b)`, 'i');

const MARK = /\b(?:for example|for instance|such as|or the equivalent)\b|\be\.g\./gi;

// The spans of a sentence between backticks, and its parentheses outside them.
function spans(text) {
  const code = [];
  for (const match of text.matchAll(/`[^`]*`/g)) code.push([match.index, match.index + match[0].length]);
  const inCode = (at) => code.some(([from, to]) => at >= from && at < to);
  const parens = [];
  const open = [];
  for (let at = 0; at < text.length; at++) {
    if (inCode(at)) continue;
    if (text[at] === '(') open.push(at);
    else if (text[at] === ')' && open.length) parens.push([open.pop(), at]);
  }
  for (const at of open) parens.push([at, text.length]);
  return { inCode, parens };
}

// Where the excerpt a mark opens ends. Inside a parenthesis, at the one that
// closes it. Otherwise at a semicolon, at the end of the sentence, or at a comma
// that opens another clause: one whose next word, after an "and" or an "or", is
// not a code span, a capitalized name, a number, an article or a term.
function excerptEnd(text, from, { inCode, parens }) {
  const around = parens.filter(([open, close]) => open < from && close >= from).sort((a, b) => b[0] - a[0])[0];
  if (around) return around[1];
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    if (inCode(at)) continue;
    const char = text[at];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && char === ';') return at;
    else if (depth === 0 && char === ',') {
      const next = text.slice(at + 1).replace(/^\s*(?:(?:and|or|but|nor)\s+)?/, '');
      const startsTerm = new RegExp(`^(?:${TERMS.source})`).test(next);
      if (!/^([`A-Z0-9]|(a|an|the)\b)/.test(next) && !startsTerm) return at;
    }
  }
  return text.length;
}

// A parenthesized list that, in the same sentence, follows a list a mark opens
// and has its form (every item a code span "in" a name, as "`xfail` in pytest")
// continues that example: "(for example `todo` in node:test, `xfail` in pytest);
// in a framework with no such marker, its skip marker (`Skip` in xUnit, ...)".
const PAIR = /^`[^`]+` in \S/;
const pairsOnly = (list) => {
  const items = list.split(/,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 && items.every((item) => PAIR.test(item));
};

// One sentence read: the terms it names (a word that is also English only where
// it names a stack), the ones outside every example excerpt (`bare`), and the
// terms of each excerpt a mark opens (`examples`).
function reading(text) {
  const shape = spans(text);
  const excerpts = [];
  for (const mark of text.matchAll(MARK)) {
    const from = mark.index + mark[0].length;
    const to = excerptEnd(text, from, shape);
    excerpts.push({ from, to, marked: true });
    const inParens = shape.parens.some(([open, close]) => open < mark.index && close === to);
    if (inParens && pairsOnly(text.slice(from, to).replace(/^:/, ''))) {
      for (const [open, close] of shape.parens) {
        if (open > to && pairsOnly(text.slice(open + 1, close))) excerpts.push({ from: open + 1, to: close, marked: false });
      }
    }
  }
  const inExcerpt = (at) => excerpts.some(({ from, to }) => at >= from && at < to);
  const terms = [];
  for (const match of text.matchAll(TERMS)) {
    const at = match.index;
    const term = match[0];
    const end = at + term.length;
    if (COMMON.has(term) && !(shape.inCode(at) || inExcerpt(at) || STACK_BEFORE.test(text.slice(0, at))
      || STACK_AFTER.test(text.slice(end)))) continue;
    terms.push({ term, at });
  }
  return {
    terms: terms.map(({ term }) => term),
    bare: terms.filter(({ at }) => !inExcerpt(at)).map(({ term }) => term),
    examples: excerpts.filter(({ marked }) => marked)
      .map(({ from, to }) => terms.filter(({ at }) => at >= from && at < to).map(({ term }) => term))
      .filter((list) => list.length > 0),
  };
}
const termsIn = (text) => reading(text).terms;

// --------------------------------------------------------------- the exceptions

// Three families, no more: the kit's own runtime (exception D of the design:
// the scripts run on Node.js, and the READMEs say so), the example block of the
// analyze's Don'ts section (a sample from one project, presented as such), and
// the loop's README, which describes what its scripts do. Each entry takes its
// excerpt out of the sentence; the rest of the sentence is still read.
const FAMILIES = ['kit runtime', "analyze Don'ts example", 'loop README'];
const ANY_KIT_FILE = /^(plugins|cursor|copilot|opencode)\//;
const ANALYZE = [
  'plugins/vibeflow/skills/analyze/SKILL.md',
  'cursor/skills/vibeflow-analyze/SKILL.md',
  'copilot/github/prompts/vibeflow-analyze.prompt.md',
];
const LOOP_README = ['plugins/vibeflow/skills/implement/loop/README.md'];
const AUDIT = [
  'plugins/vibeflow/skills/audit/SKILL.md',
  'cursor/skills/vibeflow-audit/SKILL.md',
  'copilot/github/prompts/vibeflow-audit.prompt.md',
];
const IMPLEMENT = [
  'plugins/vibeflow/skills/implement/SKILL.md',
  'cursor/skills/vibeflow-implement/SKILL.md',
  'copilot/github/prompts/vibeflow-implement.prompt.md',
];
const READMES = ['plugins/vibeflow/README.md', 'cursor/README.md', 'copilot/README.md', 'opencode/README.md'];

// The runtime entries cover the kit's own runtime only: the command runs a
// script of the kit's loop (its path goes through the loop's `scripts/`), and
// the Node.js version and presence are read only in the files that state them
// today, and only as a requirement ("18 or newer", "18+", "older than 18").
const EXCEPTIONS = [
  { family: 'kit runtime', files: ANY_KIT_FILE, excerpt: /`node (?:\S*\/loop|<kit>)\/scripts\/[\w<>-]+\.mjs\b[^`]*`/g,
    reason: 'the command that runs one of the kit\'s scripts' },
  { family: 'kit runtime', files: [...AUDIT, ...IMPLEMENT], excerpt: /`node --version`/g,
    reason: 'the check that the Node.js the kit needs is there' },
  { family: 'kit runtime', files: [...READMES, ...AUDIT, ...IMPLEMENT, ...LOOP_README, 'plugins/vibeflow/skills/implement/loop/orchestrator.md'],
    excerpt: /\bNode(\.js)? (18(\+| or (newer|later)\b)|older than 18\b|is missing or older\b)/g,
    reason: 'the Node.js version the kit\'s scripts need' },
  { family: 'kit runtime', files: [...AUDIT, 'plugins/vibeflow/skills/stats/SKILL.md'], excerpt: /`node`(?= (is missing|answers|answering)\b)/g,
    reason: 'how the call to a kit script fails when Node.js or the kit is missing' },
  { family: 'kit runtime', files: ANY_KIT_FILE, excerpt: /\bnpx setup-vibeflow\b/g,
    reason: 'the installer of the Cursor, Copilot and OpenCode editions, published on npm' },
  { family: 'kit runtime', files: LOOP_README, excerpt: /\bas Node scripts\b|`node:` imports\b/g,
    reason: 'the loop\'s README says what its scripts are written in and import' },
  { family: 'kit runtime', files: ['plugins/vibeflow/skills/stats/SKILL.md'], excerpt: /\bBash\(node:\*\)/g,
    reason: 'the tool permission stats needs to run its kit script' },
  { family: "analyze Don'ts example", files: ANALYZE, excerpt: /\bThe example below comes from a TypeScript project\b/g,
    reason: 'presents the block below as a sample from one project, and the same sentence tells the agent to write its own stack' },
  { family: "analyze Don'ts example", files: ANALYZE, excerpt: /\bDo NOT use `any` in TypeScript\b/g,
    reason: 'a bullet of that sample block, which shows the format of a prohibition' },
  { family: 'loop README', files: LOOP_README, excerpt: /\bthat JavaScript's `trim\(\)` takes off\b/g,
    reason: 'describes what the review package\'s secret detector does, which is JavaScript code' },
  { family: 'loop README', files: LOOP_README, excerpt: /\bbefore it covered other languages \(JavaScript and Python\)/g,
    reason: 'the history of check-probes\' families, which first covered two languages' },
  { family: 'loop README', files: LOOP_README, excerpt: /\ba manifest of another ecosystem \([^)]*\)/g,
    reason: 'lists the manifests check-probes recognizes, which is what the script does' },
];

// ------------------------------------------------------------------ the reading

function read() {
  const used = new Map(EXCEPTIONS.map((entry) => [entry, new Set()]));
  const found = [];
  for (const path of kitFiles()) {
    const content = readFileSync(join(ROOT, path), 'utf8');
    for (const { text, line } of sentences(content)) {
      let left = text;
      const families = new Set();
      for (const entry of EXCEPTIONS) {
        const applies = entry.files instanceof RegExp ? entry.files.test(path) : entry.files.includes(path);
        if (!applies) continue;
        left = left.replace(entry.excerpt, (match) => {
          used.get(entry).add(path);
          families.add(entry.family);
          return ' '.repeat(match.length);
        });
      }
      const { terms, bare, examples } = reading(left);
      found.push({ path, line, text, terms, bare, examples, families: [...families] });
    }
  }
  return { found, used };
}

const where = ({ path, line, text }) => `${path}:${line}: "${text}"`;

// ------------------------------------------------------------------ the tests

test('the sentence reader joins a paragraph and splits it where a sentence ends', () => {
  const text = [
    '---', 'name: x', 'description: one line', '  and its continuation', '---',
    '# Title', 'First line of a paragraph', 'and its second line. Then another sentence; and a clause: `code` here.',
    '- an item e.g. Foo', '  continued', '| a | b |', '```', 'fenced one', 'fenced two', '```', 'after.',
  ].join('\n');
  assert.deepEqual(sentences(text), [
    { text: 'name: x', line: 2 },
    { text: 'description: one line and its continuation', line: 3 },
    { text: '# Title', line: 6 },
    { text: 'First line of a paragraph and its second line.', line: 7 },
    { text: 'Then another sentence; and a clause:', line: 8 },
    { text: '`code` here.', line: 8 },
    { text: '- an item e.g. Foo continued', line: 9 },
    { text: '| a | b |', line: 11 },
    { text: 'fenced one', line: 13 },
    { text: 'fenced two', line: 14 },
    { text: 'after.', line: 16 },
  ]);
});

test('a bold opener starts a sentence, and a colon right after an example mark does not end one', () => {
  assert.deepEqual(sentences('One rule. **Next rule** (for example: `a` or `b`) here.').map((s) => s.text),
    ['One rule.', '**Next rule** (for example: `a` or `b`) here.']);
  assert.deepEqual(sentences('Run a tool, such as: Alpha or Beta.').map((s) => s.text), ['Run a tool, such as: Alpha or Beta.']);
});

test('a mark labels only the excerpt it opens, and P2 reads each excerpt', () => {
  const bare = (text) => reading(text).bare;
  // after the mark, up to the parenthesis that closes it or to the end of its clause
  assert.deepEqual(bare('Write the tests (for example with Jest or pytest).'), []);
  assert.deepEqual(bare('Write the tests with Jest (for example with Vitest or pytest).'), ['Jest']);
  assert.deepEqual(bare('Use a tool such as Stryker or mutmut, and write every probe with Jest.'), ['Jest']);
  assert.deepEqual(bare('Use a tool such as Stryker or mutmut; write every probe with Jest.'), ['Jest']);
  assert.deepEqual(bare('Use a loose type such as `any` in TypeScript, or `interface{}` in Go where it fits.'), []);
  // a term glued to a word or inside a dotted or @ name is read
  assert.deepEqual(bare('Write Jest-only probes.'), ['Jest']);
  assert.deepEqual(bare('Mark it `@pytest.mark.xfail`.'), ['pytest', 'xfail']);
  assert.deepEqual(bare('Run cargo-mutants on Node.js code.'), ['cargo-mutants', 'Node.js']);
  // a word that is also a language counts only where it names one
  assert.deepEqual(bare('Go to the next phase; each node of the graph is checked. Express it.'), []);
  assert.deepEqual(bare("Write it in Go, follow Go's style, in a Swift project, with `node`."), ['Go', 'Go', 'Swift', 'node']);
  // the example list is the unit P2 reads
  assert.deepEqual(reading('A list (for example `a` in Jest, `b` in Vitest) and one (such as pytest or Cargo.toml).').examples
    .map((terms) => terms.map((term) => ECOSYSTEM.get(term))), [['javascript', 'javascript'], ['python', 'rust']]);
});

// Cases generated by form. A common word after each preposition of a stack
// context names a stack, and the four English controls name none; a colon right
// after each example mark, in lower case and capitalized, at the start of a
// sentence and after a comma, ends no sentence and labels the list after it.
const PREPOSITIONS = ['in', 'to', 'into', 'from', 'with', 'using'];
const ENGLISH = ['Go to the next phase.', 'Each node of the dependency graph is a module.', 'Express each check as a behavior.',
  'Swift answers beat slow ones.'];
const COMMON_CASES = [...COMMON].flatMap((word) => PREPOSITIONS.map((prep) => ({ text: `Port the probes ${prep} ${word}.`, bare: [word] })))
  .concat(ENGLISH.map((text) => ({ text, bare: [] })));
const capital = (text) => text[0].toUpperCase() + text.slice(1);
const COLON_CASES = ['for example', 'for instance', 'such as', 'or the equivalent', 'e.g.']
  .flatMap((mark) => [mark, capital(mark)])
  .flatMap((mark) => [`${mark}: Jest or pytest.`, `Run a tool, ${mark}: Jest or pytest.`]);

test('a common word names a stack after each preposition of a stack context, and the English controls name none', () => {
  assert.equal(COMMON_CASES.length, 28);
  const off = COMMON_CASES.filter(({ text, bare }) => JSON.stringify(reading(text).bare) !== JSON.stringify(bare))
    .map(({ text, bare }) => `"${text}" read ${JSON.stringify(reading(text).bare)}, expected ${JSON.stringify(bare)}`);
  assert.deepEqual(off, []);
});

test('a colon right after an example mark, in either case, ends no sentence and labels the list after it', () => {
  assert.equal(COLON_CASES.length, 20);
  const off = COLON_CASES.filter((text) => sentences(text).length !== 1 || reading(text).bare.length > 0
    || reading(text).examples.length !== 1);
  assert.deepEqual(off, []);
});

test('the vocabulary covers the languages of the gate-languages fixture', () => {
  for (const { name } of LANGUAGES) {
    assert.ok(ECOSYSTEM.has(name), `${name} is missing from the vocabulary`);
    assert.deepEqual(termsIn(`a ${name} project`), [name], `${name} is not recognized in a sentence`);
  }
});

test('P1: a sentence of the kit that names a language, framework or tool marks it as an example', (t) => {
  const { found } = read();
  const naming = found.filter((s) => s.terms.length > 0);
  assert.ok(found.length > 1000, `the reader found only ${found.length} sentences in the kit`);
  const byEcosystem = {};
  for (const { terms } of naming) {
    for (const term of terms) (byEcosystem[ECOSYSTEM.get(term)] ??= new Set()).add(term);
  }
  t.diagnostic(`sentences naming a term: ${naming.length}, every term inside an example: ${naming.filter((s) => s.bare.length === 0).length}`);
  for (const [ecosystem, terms] of Object.entries(byEcosystem).sort()) t.diagnostic(`${ecosystem}: ${[...terms].sort().join(', ')}`);
  for (const s of found.filter((x) => x.families.length > 0)) t.diagnostic(`excused (${s.families.join(', ')}): ${where(s)}`);
  assert.deepEqual(naming.filter((s) => s.bare.length > 0).map((s) => `${where(s)} [${s.bare.join(', ')}]`), [],
    'these sentences name a stack outside an example');
});

test('P2: an example names more than one ecosystem', () => {
  const { found } = read();
  const single = found.flatMap((s) => s.examples
    .filter((terms) => new Set(terms.map((term) => ECOSYSTEM.get(term))).size === 1)
    .map((terms) => `${where(s)} [${ECOSYSTEM.get(terms[0])}: ${terms.join(', ')}]`));
  assert.deepEqual(single, [], 'these examples stay inside one ecosystem');
});

test('the exceptions are few, each in a named family, and each still matches the text it was written for', () => {
  const { used } = read();
  for (const entry of EXCEPTIONS) {
    assert.ok(FAMILIES.includes(entry.family), `exception in an unknown family: ${entry.family}`);
    assert.ok(entry.reason?.length > 0, `exception without a reason: ${entry.excerpt}`);
    assert.ok(entry.excerpt.global, `the excerpt must be a global pattern: ${entry.excerpt}`);
    const hit = used.get(entry);
    if (entry.files instanceof RegExp) {
      assert.ok(hit.size > 0, `exception "${entry.excerpt}" matches no sentence of the kit`);
    } else {
      for (const path of entry.files) {
        assert.ok(hit.has(path), `exception "${entry.excerpt}" matches no sentence of ${path}`);
      }
    }
  }
});
