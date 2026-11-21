// The kit states a behavior; a language, framework, test runner, tool or
// manifest appears in its prose only as an example, and an example spans more
// than one ecosystem. Two properties over every sentence of the kit's prose:
// - P1: a sentence that names a term of the vocabulary carries an example mark
//   ("for example", "such as", "or the equivalent", ...) in the same sentence;
// - P2: a sentence with an example mark whose terms all belong to one
//   ecosystem fails, because an example of one stack reads as the rule.
// The prose is every `.md` and `.mdc` file under the edition folders that git
// knows, tracked or new and not ignored, so a new file is read without a change
// here. The vocabulary holds each term with its ecosystem, and covers the
// languages of the gate-languages fixture. A short list of exceptions, each
// with its files, the excerpt it covers and the reason, takes the excerpt out
// of the sentence before the terms are read; an exception whose excerpt no
// longer matches fails, so the list cannot outlive the text it was written for.
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
// letter, a backtick or a parenthesis, and at the end of its block; "e.g." and
// "i.e." end nothing.
const BREAK = /(?<=[.;:])(?<!\be\.g\.)(?<!\bi\.e\.)\s+(?=[A-Z`(])/g;

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
    for (const cut of [...text.matchAll(BREAK), { index: text.length, 0: '' }]) {
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
// not the project's stack.
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
const termSource = (term) => {
  const left = /^\w/.test(term) ? '(?<![\\w@.-])' : '';
  const right = /\w$/.test(term) ? '(?![\\w-])' : /[#+]$/.test(term) ? '(?![\\w#+])' : '';
  return `${left}${escape(term)}${right}`;
};
// Longest first, so "Node.js" is read before "Node" and "cargo-mutants" before "cargo".
const TERMS = new RegExp([...ECOSYSTEM.keys()].sort((a, b) => b.length - a.length).map(termSource).join('|'), 'g');
const termsIn = (text) => [...text.matchAll(TERMS)].map((match) => match[0]);

const MARK = /\b(for example|for instance|such as|or the equivalent)\b|\be\.g\./i;

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

const EXCEPTIONS = [
  { family: 'kit runtime', files: ANY_KIT_FILE, excerpt: /`node [^`]*\.mjs\b[^`]*`/g,
    reason: 'the command that runs one of the kit\'s scripts' },
  { family: 'kit runtime', files: ANY_KIT_FILE, excerpt: /`node --version`/g,
    reason: 'the check that the Node.js the kit needs is there' },
  { family: 'kit runtime', files: ANY_KIT_FILE, excerpt: /\bNode(\.js)? (18\b|older than 18\b|is missing or older\b)/g,
    reason: 'the Node.js version the kit\'s scripts need' },
  { family: 'kit runtime', files: ANY_KIT_FILE, excerpt: /`node`(?= (is missing|answers|answering)\b)/g,
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
      const terms = termsIn(left);
      found.push({ path, line, text, terms, families: [...families], marked: MARK.test(text) });
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
  t.diagnostic(`sentences naming a term: ${naming.length}, with a mark: ${naming.filter((s) => s.marked).length}`);
  for (const [ecosystem, terms] of Object.entries(byEcosystem).sort()) t.diagnostic(`${ecosystem}: ${[...terms].sort().join(', ')}`);
  for (const s of found.filter((x) => x.families.length > 0)) t.diagnostic(`excused (${s.families.join(', ')}): ${where(s)}`);
  assert.deepEqual(naming.filter((s) => !s.marked).map(where), [],
    'these sentences name a stack outside an example');
});

test('P2: an example names more than one ecosystem', () => {
  const { found } = read();
  const single = found.filter((s) => s.marked && s.terms.length > 0
    && new Set(s.terms.map((term) => ECOSYSTEM.get(term))).size === 1);
  assert.deepEqual(single.map((s) => `${where(s)} [${ECOSYSTEM.get(s.terms[0])}]`), [],
    'these examples stay inside one ecosystem');
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
