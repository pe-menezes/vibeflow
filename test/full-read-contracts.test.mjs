// Contracts of the full read: every consumer of `.vibeflow/conventions.md` and
// of the pattern documents reads them whole, one file per read, and declares
// what it read in a receipt. gen-spec declares the list and its volume in the
// spec; audit goes through every document and gives each one a line under
// Pattern Compliance. Each assertion pins a literal of that contract in the
// three editions (shared, Cursor, Copilot), and the roles in their three
// places (loop kit, Claude agent, OpenCode agent), so a wording that drifts in
// one of them fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT = 'plugins/vibeflow/skills/implement/loop';

const RULE = 'Read each of these documents whole, one file per read: open it with your file-reading tool, without an offset or a limit, and never several files in one shell command. When a read comes back cut (a preview, a notice that the output was saved to a file, a line or size limit), keep reading from where it stopped to the last line. A list of headings or a keyword search is not a read.';

const RECEIPT = ['Read in full: <n> of <m>', '- <path> (<lines> lines)', 'Not read whole: none'];
const RECEIPT_TRUTH = 'The receipt is what this session actually read: a document read in pieces goes under `Not read whole`.';
const RECEIPT_GAP = '`Not read whole:` stands alone and each such document follows on its own line, `- <path>: <why>`';
const RECEIPT_LINE = 'One `- <path> (<lines> lines)` line per document read whole, its path relative to the project root.';

const DOCS_LINE = '`Documents to read: <m> (<kb> KB): .vibeflow/conventions.md and the pattern docs listed above`';
const DOCS_OVER = '`; over 100 KB, consider splitting this spec`';

function editions(workflow) {
  return {
    shared: `plugins/vibeflow/skills/${workflow}/SKILL.md`,
    cursor: `cursor/skills/vibeflow-${workflow}/SKILL.md`,
    copilot: `copilot/github/prompts/vibeflow-${workflow}.prompt.md`,
  };
}

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

// Whitespace collapsed, so a sentence wrapped across indented lines reads as
// one line.
function flat(text) {
  return text.replace(/\s+/g, ' ');
}

function count(text, literal) {
  return flat(text).split(literal).length - 1;
}

// The raw text from one literal up to the next occurrence of another. Fails
// the test when either is absent, so a renamed anchor does not pass silently.
function between(content, from, to, label) {
  const start = content.indexOf(from);
  assert.notEqual(start, -1, `${label}: anchor "${from}"`);
  const end = content.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${label}: anchor "${to}" after "${from}"`);
  return content.slice(start, end);
}

// Every fenced block of the text, as arrays of trimmed lines.
function fences(content) {
  return [...content.matchAll(/^[ \t]*```[^\n]*\n([\s\S]*?)^[ \t]*```/gm)]
    .map((match) => match[1].split('\n').map((line) => line.trim()).filter(Boolean));
}

function forEachEdition(workflow, fn) {
  for (const [edition, path] of Object.entries(editions(workflow))) fn(read(path), `${workflow} ${edition}`);
}

// ------------------------------------------------------------------ the rule

test('gen-spec: the reading rule in step 2 and after "Read every applicable entry" in step 3', () => {
  forEachEdition('gen-spec', (raw, label) => {
    const step2 = between(raw, '2. Load context from `.vibeflow/`', '3. Identify what exists today', label);
    assert.equal(count(step2, RULE), 1, `${label}: the rule, word for word, in step 2`);
    assert.match(flat(step2), /`conventions\.md` and each pattern doc you load/, `${label}: step 2 names what "these documents" are`);
    const step3 = between(raw, 'Read every applicable entry', '4. Collect what the input points at', label);
    assert.equal(count(step3, RULE), 1, `${label}: the rule, word for word, after "Read every applicable entry"`);
  });
});

test('implement: the reading rule in Phase 2', () => {
  forEachEdition('implement', (raw, label) => {
    const phase2 = between(raw, '## Phase 2: Load context from .vibeflow/', '## Phase 3', label);
    assert.equal(count(phase2, RULE), 1, `${label}: the rule in Phase 2`);
    assert.match(flat(phase2), /`\.vibeflow\/conventions\.md` and each pattern doc the spec lists/, `${label}: what "these documents" are`);
    assert.match(flat(phase2), /`Documents to read:` line/, `${label}: the spec's list is the one read`);
  });
});

test('prompt-pack: the reading rule in step 2', () => {
  forEachEdition('prompt-pack', (raw, label) => {
    const step2 = between(raw, '2. Read `.vibeflow/conventions.md`', '3. Read the codebase files', label);
    assert.equal(count(step2, RULE), 1, `${label}: the rule in step 2`);
    assert.match(flat(step2), /`Documents to read:` line/, `${label}: the spec's list is the one read`);
  });
});

test('audit: the reading rule in step 2 (2/7 spec)', () => {
  forEachEdition('audit', (raw, label) => {
    const step2 = between(raw, '2. **Spec** (`2/7 spec`)', '3. **Tests** (`3/7 tests`)', label);
    assert.equal(count(step2, RULE), 1, `${label}: the rule in step 2`);
    assert.match(flat(step2), /`Documents to read:` line/, `${label}: the spec's list is the one read`);
  });
});

test('quick: the reading rule where it embeds patterns and conventions', () => {
  forEachEdition('quick', (raw, label) => {
    const generate = between(raw, '## Phase 2: Generate the ephemeral spec', '## After saving', label);
    assert.equal(count(generate, RULE), 1, `${label}: the rule before the pack embeds them`);
    assert.match(flat(generate), /`\.vibeflow\/conventions\.md` and each pattern doc the ephemeral spec lists/, `${label}: what "these documents" are`);
  });
});

test('the rule is stated once per point: no edition repeats it beyond its reading points', () => {
  const points = { 'gen-spec': 2, implement: 1, 'prompt-pack': 1, audit: 1, quick: 1 };
  for (const [workflow, n] of Object.entries(points)) {
    forEachEdition(workflow, (raw, label) => assert.equal(count(raw, RULE), n, `${label}: ${n} reading point(s)`));
  }
});

// ------------------------------------------------------------------ the roles

const ROLE_PLACES = {
  executor: [`${KIT}/roles/executor.md`, 'plugins/vibeflow/agents/executor.md', 'opencode/agents/executor.md'],
  auditor: [`${KIT}/roles/auditor.md`, 'plugins/vibeflow/agents/auditor.md', 'opencode/agents/auditor.md'],
};

for (const [role, places] of Object.entries(ROLE_PLACES)) {
  test(`${role} role: reads conventions.md and the spec's documents whole, the same line in its three places`, () => {
    const lines = places.map((path) => {
      const line = read(path).split('\n').find((l) => l.startsWith('* Read the briefing first.'));
      assert.ok(line, `${path}: the "Read the briefing first" line`);
      return line;
    });
    for (const [i, line] of lines.entries()) {
      assert.ok(line.includes(RULE), `${places[i]}: the rule, word for word`);
      assert.ok(line.includes('`.vibeflow/index.md`'), `${places[i]}: index.md`);
      assert.ok(line.includes('`.vibeflow/conventions.md`'), `${places[i]}: conventions.md`);
      assert.match(line, /each pattern doc the spec lists/, `${places[i]}: the spec's documents`);
      assert.equal(line, lines[0], `${places[i]}: the same line as ${places[0]}`);
    }
  });
}

test('briefing templates: "Read first" of the executor and the auditor carry the rule', () => {
  const raw = read(`${KIT}/briefings.md`);
  const executor = between(raw, '## Executor', '## Fix', 'briefings executor');
  const auditor = between(raw, '## Auditor', '## Re-auditor', 'briefings auditor');
  for (const [label, template] of [['executor', executor], ['auditor', auditor]]) {
    const readFirst = between(template, '## Read first', '\n## ', `briefings ${label}`);
    assert.equal(count(readFirst, RULE), 1, `${label} template: the rule in "Read first"`);
    assert.ok(readFirst.includes('`.vibeflow/conventions.md`'), `${label} template: conventions.md in "Read first"`);
    assert.ok(readFirst.includes('`.vibeflow/index.md`'), `${label} template: index.md in "Read first"`);
  }
});

// ------------------------------------------------------------------ the receipt

function assertReceiptProse(raw, label) {
  const text = flat(raw);
  assert.ok(text.includes(RECEIPT_LINE), `${label}: one line per document, path relative to the root`);
  assert.ok(text.includes(RECEIPT_GAP), `${label}: a document not read whole is named with its reason`);
  assert.ok(text.includes(RECEIPT_TRUTH), `${label}: the receipt is what was read`);
}

for (const workflow of ['gen-spec', 'implement', 'prompt-pack', 'quick']) {
  test(`${workflow}: the reply ends with the read receipt`, () => {
    forEachEdition(workflow, (raw, label) => {
      assert.ok(fences(raw).some((lines) => lines.join('\n') === RECEIPT.join('\n')), `${label}: the receipt block, literal`);
      assertReceiptProse(raw, label);
      assert.match(flat(raw), /reply says so/, `${label}: a gap is said in the reply, never silently`);
    });
  });
}

test('audit: the report carries the read receipt right after its Base line', () => {
  forEachEdition('audit', (raw, label) => {
    const template = between(raw, '## Output format', '## Verdict rules', label);
    const lines = template.split('\n').map((line) => line.trim());
    const base = lines.indexOf('Base: <sha>');
    assert.notEqual(base, -1, `${label}: the Base line`);
    assert.deepEqual(lines.slice(base + 1, base + 4), RECEIPT, `${label}: the receipt follows Base`);
    assertReceiptProse(raw, label);
  });
});

// ------------------------------------------------------------------ the list in the spec

test('gen-spec: Applicable Patterns ends with the documents to read and their volume', () => {
  forEachEdition('gen-spec', (raw, label) => {
    const patterns = between(raw, '- **Applicable Patterns**', '- **Risks**', label);
    const text = flat(patterns);
    assert.ok(text.includes(DOCS_LINE), `${label}: the Documents to read line, literal`);
    assert.ok(text.includes(DOCS_OVER), `${label}: the 100 KB suffix, literal`);
    assert.ok(text.indexOf(DOCS_LINE) > text.indexOf('Imported entries that apply:'), `${label}: after the imported lines`);
    assert.match(text, /sum of their sizes on disk, rounded to a whole KB/, `${label}: how <kb> is computed`);
    assert.match(text, /nothing is cut from the list/, `${label}: the list is never trimmed`);
    assert.match(text, /reply says so/, `${label}: the reply warns above 100 KB`);
  });
});

test('consumers: a spec without the Documents to read line is read as before', () => {
  for (const workflow of ['implement', 'prompt-pack', 'audit']) {
    forEachEdition(workflow, (raw, label) => {
      assert.match(flat(raw), /a spec without that line[^.]*as before/, `${label}: old specs keep working`);
    });
  }
});

// ------------------------------------------------------------------ audit per document

test('audit: 5B goes through every document, one by one', () => {
  forEachEdition('audit', (raw, label) => {
    const review = flat(between(raw, '**B. Pattern compliance**', '**C. Scenarios**', label));
    assert.match(review, /go through `\.vibeflow\/conventions\.md` and each document the spec lists, one by one/, `${label}: every document`);
    assert.match(review, /each of its rules that the package's files touch/, `${label}: every rule the diff touches`);
    assert.match(review, /one line per document, in the receipt's order/, `${label}: one report line per document`);
  });
});

test('audit: the Pattern Compliance template has a line per document, including the untouched ones', () => {
  forEachEdition('audit', (raw, label) => {
    const template = between(raw, '### Pattern Compliance', '### Convention Violations', label);
    const lines = template.split('\n').map((line) => line.trim());
    assert.ok(lines.includes('- [x] <path> — follows correctly. Evidence: <file:line>'), `${label}: [x] with evidence`);
    assert.ok(lines.includes('- [x] <path>: no rule touches the changed files'), `${label}: the untouched document`);
    assert.ok(lines.includes('- [ ] <path> — DEVIATION: <what\'s wrong, what it should be>'), `${label}: [ ] with the deviation`);
    assert.ok(lines.some((line) => /^- \[ \] patterns\/external-<repo-name>\/<entry-name>\.md — DEVIATION: .* — imported from <repo-name> \(<source_file>\)$/.test(line)),
      `${label}: the imported line keeps its format`);
  });
});
