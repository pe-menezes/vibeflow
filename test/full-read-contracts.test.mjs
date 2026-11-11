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

const DOCS_LINE = '`Documents to read: <m> (<lines> lines): .vibeflow/conventions.md and the pattern docs listed above`';
const DOCS_OVER = '`; over 2,500 lines, consider splitting this spec`';

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

// The raw text from a literal to the end of the file (a last section, which
// the Cursor and Copilot editions end without a closing rule).
function rest(content, from, label) {
  const start = content.indexOf(from);
  assert.notEqual(start, -1, `${label}: anchor "${from}"`);
  return content.slice(start);
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

// The rule is stated once, in step 2, which counts step 3's applicable
// imported entries among "these documents"; step 3 reads them by step 2's rule
// without restating it (finding L6).
test('gen-spec: the reading rule once in step 2, and step 3 reads its entries by it', () => {
  forEachEdition('gen-spec', (raw, label) => {
    const step2 = between(raw, '2. Load context from `.vibeflow/`', '3. Identify what exists today', label);
    assert.equal(count(step2, RULE), 1, `${label}: the rule, word for word, in step 2`);
    assert.match(flat(step2), /`conventions\.md` and each pattern doc you load/, `${label}: step 2 names what "these documents" are`);
    assert.match(flat(step2), /each imported entry step 3 marks applicable/, `${label}: step 2 counts step 3's entries among them`);
    const step3 = between(raw, 'Read every applicable entry', '4. Collect what the input points at', label);
    assert.equal(count(step3, RULE), 0, `${label}: step 3 does not restate the rule`);
    assert.match(flat(step3), /^Read every applicable entry whole, by the reading rule of step 2;/, `${label}: step 3 points at step 2's rule`);
  });
});

test('implement: the reading rule in Phase 2', () => {
  forEachEdition('implement', (raw, label) => {
    const phase2 = between(raw, '## Phase 2: Load context from .vibeflow/', '## Phase 3', label);
    assert.equal(count(phase2, RULE), 1, `${label}: the rule in Phase 2`);
    assert.match(flat(phase2), /`\.vibeflow\/conventions\.md` and each pattern doc the spec lists/, `${label}: what "these documents" are`);
    assert.match(flat(phase2), /`Documents to read:` line/, `${label}: the spec's list is the one read`);
    // Finding L5: the docs item 2 resolves from the registry fall under the
    // rule too, and an old spec changes only how the list is found.
    assert.match(flat(phase2), /or, when the spec lists none, each doc item 2 resolves\./, `${label}: the resolved docs are among "these documents"`);
    assert.match(flat(phase2), /a spec without that line, the list is found as before, and only the list: its documents are read whole all the same\./, `${label}: an old spec is still read whole`);
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
  const points = { 'gen-spec': 1, implement: 1, 'prompt-pack': 1, audit: 1, quick: 1 };
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

// Finding L1: the fix round runs with the executor role, which reads "the
// project knowledge it points at"; the fix template points at the spec and at
// what the role reads, like the executor template.
test('briefing templates: "Read first" of the fix points at the spec, conventions.md and each pattern doc the spec lists', () => {
  const raw = read(`${KIT}/briefings.md`);
  const fix = between(raw, '## Fix', '## Auditor', 'briefings fix');
  const readFirst = between(fix, '## Read first', '\n## ', 'briefings fix');
  assert.ok(readFirst.includes('`.vibeflow/specs/<spec file>`'), 'fix template: the spec in "Read first"');
  assert.match(flat(readFirst), /project knowledge: `\.vibeflow\/index\.md`, `\.vibeflow\/conventions\.md` and each pattern doc the spec lists\./, 'fix template: what the executor role reads');
  assert.equal(count(readFirst, RULE), 1, 'fix template: the rule in "Read first"');
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

// Finding L4: "the reply ends with the read receipt" meets each skill's own
// closing (the next-step suggestion, quick's report list, implement's Phase 8
// message, the loop's final report). Each skill says where the receipt goes
// against that closing, and the closing agrees.
test('gen-spec and prompt-pack: the receipt comes right before the next-step suggestion', () => {
  for (const workflow of ['gen-spec', 'prompt-pack']) {
    forEachEdition(workflow, (raw, label) => {
      const close = between(raw, 'reply ends with the read receipt', 'After saving, suggest', label);
      assert.match(flat(close), /^reply ends with the read receipt, its labels in English in any language; only the next-step suggestion below comes after it:/, `${label}: where the receipt goes`);
      assert.ok(fences(close).some((lines) => lines.join('\n') === RECEIPT.join('\n')), `${label}: the receipt block before the suggestion`);
    });
  }
});

test('quick: the receipt comes before the suggestion, in Phase 2 and in the After saving list', () => {
  forEachEdition('quick', (raw, label) => {
    const generate = flat(between(raw, '## Phase 2: Generate the ephemeral spec', '## Phase 3', label));
    assert.match(generate, /the reply ends with the read receipt, its labels in English in any language; in the "After saving" report only the suggestion comes after it:/, `${label}: where the receipt goes`);
    const report = rest(raw, '## After saving', label);
    const receipt = report.indexOf('- The read receipt from Phase 2');
    assert.notEqual(receipt, -1, `${label}: the receipt item`);
    assert.ok(receipt < report.indexOf('- Suggest:'), `${label}: the receipt item before the suggestion`);
  });
});

test('implement: the receipt follows the Phase 8 message, and the loop\'s final report ends with it', () => {
  forEachEdition('implement', (raw, label) => {
    const phase2 = flat(between(raw, '## Phase 2: Load context from .vibeflow/', '## Phase 3', label));
    assert.match(phase2, /The final reply ends with the read receipt, its labels in English in any language, after the Phase 8 message \(in loop mode, at the end of the orchestrator's final report\):/, `${label}: where the receipt goes`);
    const phase8 = flat(rest(raw, '## Phase 8: Finish', label));
    assert.match(phase8, /The read receipt from Phase 2 follows the message and ends the reply\./, `${label}: Phase 8 agrees`);
  });
  const orchestrator = read(`${KIT}/orchestrator.md`);
  const step7 = orchestrator.split('\n').find((line) => line.startsWith('7. Give the user the final report:'));
  assert.ok(step7, 'orchestrator.md: step 7 of the ending');
  assert.match(step7, /, and ends with the read receipt of `implement`'s Phase 2\. Then stop\.$/, 'orchestrator.md: the final report ends with the receipt');
});

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

// Finding L2: the machine-read labels of this contract stay in English in any
// output language. The Language section runs to the next heading at the start
// of a line, so a heading quoted inside its list does not end it.
test('Language: `Documents to read:` in gen-spec and the receipt labels in audit stay in English', () => {
  const language = (raw, label) => {
    const start = raw.indexOf('\n## Language\n');
    assert.notEqual(start, -1, `${label}: the Language section`);
    const end = raw.indexOf('\n## ', start + 1);
    return flat(raw.slice(start, end === -1 ? raw.length : end));
  };
  forEachEdition('gen-spec', (raw, label) => {
    assert.match(language(raw, label), /stay in English in any output language[^.]*`Documents to read:`/, `${label}: the label is exempt`);
  });
  forEachEdition('audit', (raw, label) => {
    const text = language(raw, label);
    const list = text.slice(text.indexOf("The report's machine-read labels stay literally in English in any output language"));
    assert.match(list, /^The report's machine-read labels[\s\S]*the read receipt's labels \(`Read in full`, `Not read whole`, `none`\)/, `${label}: the receipt labels are exempt`);
    const step2 = flat(between(raw, '2. **Spec** (`2/7 spec`)', '3. **Tests** (`3/7 tests`)', label));
    assert.match(step2, /read receipt, its labels in English in any language, right after its `Base:` line/, `${label}: step 2 says it too`);
  });
});

// Finding L7: a re-audit keeps "the same header", receipt included, and says
// the receipt is what the re-audit itself read.
test('audit: the re-audit header carries the receipt of what the re-audit read', () => {
  forEachEdition('audit', (raw, label) => {
    const reaudit = flat(between(raw, '## Re-audit mode', '## Consolidation mode', label));
    assert.match(reaudit, /the same header, its read receipt listing what this re-audit itself read \(a document it read in pieces goes under `Not read whole`\)/, `${label}: the re-audit's receipt`);
  });
});

// ------------------------------------------------------------------ the list in the spec

test('gen-spec: Applicable Patterns ends with the documents to read and their volume', () => {
  forEachEdition('gen-spec', (raw, label) => {
    const patterns = between(raw, '- **Applicable Patterns**', '- **Risks**', label);
    const text = flat(patterns);
    assert.ok(text.includes(DOCS_LINE), `${label}: the Documents to read line, literal`);
    assert.ok(text.includes(DOCS_OVER), `${label}: the 2,500-line suffix, literal`);
    assert.ok(text.indexOf(DOCS_LINE) > text.indexOf('Imported entries that apply:'), `${label}: after the imported lines`);
    // Finding D1: the volume is counted in lines, which the file-reading tool
    // reports and the receipt already uses, never a size the skill's tools
    // cannot measure.
    assert.match(text, /where `<lines>` is the sum of the line counts of the documents read, as the file-reading tool reports them\./, `${label}: how <lines> is computed`);
    assert.doesNotMatch(text, /\bKB\b|on disk|bytes?\b/, `${label}: no size the skill cannot measure`);
    assert.match(text, /Above 2,500 lines the same line ends with/, `${label}: the ceiling in lines`);
    assert.match(text, /nothing is cut from the list/, `${label}: the list is never trimmed`);
    assert.match(text, /consider splitting this spec`, and the reply says so/, `${label}: the reply warns above 2,500 lines`);
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
