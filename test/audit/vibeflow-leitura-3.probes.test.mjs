// Audit probes for the full read (vibeflow-leitura, part 3): the consumers of
// `.vibeflow/conventions.md` and of the pattern documents read them whole and
// declare what they read. test/full-read-contracts.test.mjs pins that each
// literal is present somewhere in the file; these probes pin where it binds
// (the receipt goes in the reply, in English), what the auditor template points
// at, and that no other sentence of a consumer tells the model to read the same
// documents in parts. A case marked `todo` asserts what a known open gap asks
// for: it runs and prints without failing the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const KIT = 'plugins/vibeflow/skills/implement/loop';
const RECEIPT = ['Read in full: <n> of <m>', '- <path> (<lines> lines)', 'Not read whole: none'];
const REPLY_CONSUMERS = ['gen-spec', 'implement', 'prompt-pack', 'quick'];
const CONSUMERS = [...REPLY_CONSUMERS, 'audit'];

function editions(workflow) {
  return {
    shared: `plugins/vibeflow/skills/${workflow}/SKILL.md`,
    cursor: `cursor/skills/vibeflow-${workflow}/SKILL.md`,
    copilot: `copilot/github/prompts/vibeflow-${workflow}.prompt.md`,
  };
}

const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const sentences = (text) => flat(text).split(/(?<=[.!?])\s+/);

// The receipt's fenced block in a skill, with the paragraph right before it
// (what tells the model where the block goes) and the one right after it (what
// it says about a document not read whole).
function receiptBlock(raw, label) {
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*```\s*$/.test(lines[i])) continue;
    const body = lines.slice(i + 1, i + 1 + RECEIPT.length).map((l) => l.trim());
    if (body.join('\n') !== RECEIPT.join('\n') || !/^\s*```\s*$/.test(lines[i + 1 + RECEIPT.length] ?? '')) continue;
    let start = i - 1;
    while (start >= 0 && lines[start].trim() === '') start -= 1;
    let top = start;
    while (top > 0 && lines[top - 1].trim() !== '') top -= 1;
    let after = i + 2 + RECEIPT.length;
    while (after < lines.length && lines[after].trim() === '') after += 1;
    let end = after;
    while (end < lines.length && lines[end].trim() !== '') end += 1;
    return { before: flat(lines.slice(top, start + 1).join('\n')), after: flat(lines.slice(after, end).join('\n')) };
  }
  assert.fail(`${label}: no fenced read receipt`);
}

// Contract: the receipt comes out in the reply of gen-spec, implement,
// prompt-pack and quick (part 3, done-when 2). Regression: a rewrite that keeps
// the block as a format sample but drops the sentence that puts it in the
// reply (sabotage S6, S7 survived the executor's test).
test('reply consumers: the sentence that opens the receipt block puts it at the end of the reply', () => {
  for (const workflow of REPLY_CONSUMERS) {
    for (const [edition, path] of Object.entries(editions(workflow))) {
      const { before } = receiptBlock(read(path), `${workflow} ${edition}`);
      assert.match(before, /\breply ends with the read receipt\b/, `${workflow} ${edition}: "${before}"`);
    }
  }
});

// Contract: the receipt's labels are read the same in any output language, like
// the other machine-read labels. Regression: "its labels in English in any
// language" dropped or turned into "in the output language" (sabotage S8
// survived the executor's test).
test('reply consumers: the receipt labels stay in English in any output language', () => {
  for (const workflow of REPLY_CONSUMERS) {
    for (const [edition, path] of Object.entries(editions(workflow))) {
      const { before } = receiptBlock(read(path), `${workflow} ${edition}`);
      assert.match(before, /labels in English in any language/, `${workflow} ${edition}: "${before}"`);
    }
  }
});

// Contract: a document not read whole is said in the reply, never silently.
// Regression: "and the reply says so" dropped from the paragraph under the
// block; in gen-spec the 100 KB sentence still carries "reply says so", so the
// executor's file-wide match passed (sabotage S9b survived).
test('reply consumers: the paragraph under the receipt says a gap is told in the reply', () => {
  for (const workflow of REPLY_CONSUMERS) {
    for (const [edition, path] of Object.entries(editions(workflow))) {
      const { after } = receiptBlock(read(path), `${workflow} ${edition}`);
      assert.match(after, /`Not read whole:` stands alone[^.]*and the reply says so\./, `${workflow} ${edition}: "${after}"`);
    }
  }
});

// Contract: the auditor reads conventions.md and the documents the spec lists,
// the same set the executor read (part 3, done-when 1). Regression: the
// auditor template back to "the patterns index.md lists" while keeping the
// rule and both file names (sabotage S12 survived the executor's test, which
// checks only the rule, conventions.md and index.md).
test('briefing templates: executor and auditor "Read first" point at each pattern doc the spec lists', () => {
  const raw = read(`${KIT}/briefings.md`);
  for (const [from, to] of [['## Executor', '## Fix'], ['## Auditor', '## Re-auditor']]) {
    const template = raw.slice(raw.indexOf(from), raw.indexOf(to));
    const readFirst = template.slice(template.indexOf('## Read first'), template.indexOf('\n## ', template.indexOf('## Read first') + 1));
    assert.match(flat(readFirst), /`\.vibeflow\/conventions\.md` and each pattern doc the spec lists/, `${from}: "${flat(readFirst)}"`);
  }
});

// Contract: no sentence of a consumer tells the model to read conventions.md
// or a pattern doc by headings, sections, ranges or keyword search, which is
// how a skill read by a model regresses (the rule stays, a sentence elsewhere
// says the opposite). The prompt-pack sentence that copies sections into the
// pack is about writing the pack, from documents step 2 already read whole.
test('consumers: no sentence reads the listed documents in parts', () => {
  const PART = /\b(skim\w*|grep|headings?|by sections?|excerpts?|offset|line ranges?|first \d+ lines|relevant sections|summar\w*)\b/i;
  const DOC = /conventions\.md|pattern docs?|patterns\/|applicable entr/i;
  for (const workflow of CONSUMERS) {
    for (const [edition, path] of Object.entries(editions(workflow))) {
      for (const s of sentences(read(path))) {
        if (!DOC.test(s) || !PART.test(s)) continue;
        if (/^Copy the relevant sections\b/.test(s)) continue;
        assert.fail(`${workflow} ${edition}: a sentence reads the documents in parts: "${s}"`);
      }
    }
  }
  for (const path of [`${KIT}/roles/executor.md`, `${KIT}/roles/auditor.md`, `${KIT}/briefings.md`]) {
    for (const s of sentences(read(path))) {
      if (DOC.test(s) && PART.test(s)) assert.fail(`${path}: a sentence reads the documents in parts: "${s}"`);
    }
  }
});

// Finding L2. Contract: the audit report's receipt labels stay in English like
// its other header labels. Regression: a run in another language translating
// `Read in full`; the audit's Language section lists the labels that stay in
// English and the receipt's are not on it, and step 2 does not say it either.
test('audit: the receipt labels are among the labels that stay in English', () => {
  for (const [edition, path] of Object.entries(editions('audit'))) {
    const raw = flat(read(path));
    const language = raw.slice(raw.indexOf('## Language'), raw.indexOf('## ', raw.indexOf('## Language') + 3));
    const step2 = raw.slice(raw.indexOf('2. **Spec**'), raw.indexOf('3. **Tests**'));
    assert.ok(/`Read in full`/.test(language) || /labels in English in any language/.test(step2), `audit ${edition}`);
  }
});

// Finding L2. Contract: implement, audit and prompt-pack find the spec's list by
// the literal `Documents to read:`; gen-spec writes every other line in the
// user's language except the literals its Language section exempts.
// Regression: a spec written in Portuguese with "Documentos a ler:", which the
// consumers read as a spec without the line.
// Rewritten by the fact in re-audit 1: the first version cut the section at the
// first "## " of the flattened text, which is the `## References` heading quoted
// inside the exempt list itself, so a literal listed after it never counted.
// The section now runs from its heading line to the next heading at the start
// of a line, and the literal has to sit in a sentence that keeps literals in
// English.
test('gen-spec: `Documents to read:` is among the literals that stay in English', () => {
  for (const [edition, path] of Object.entries(editions('gen-spec'))) {
    const raw = read(path);
    const start = raw.search(/^## Language[ \t]*$/m);
    assert.notEqual(start, -1, `gen-spec ${edition}: the Language section`);
    const next = raw.slice(start + 1).search(/^## /m);
    const language = raw.slice(start, next === -1 ? raw.length : start + 1 + next);
    const exempt = sentences(language).filter((s) => /stay (literally )?in English/.test(s));
    assert.ok(exempt.some((s) => s.includes('`Documents to read:`')), `gen-spec ${edition}: ${JSON.stringify(exempt)}`);
  }
});

// Finding D1. Contract: the number in the `Documents to read:` line is a
// measurement the session can take with the tools the skill grants, or the
// skill says it is an estimate. Regression: the shared gen-spec asks for a size
// (KB, bytes, "on disk") while its allowed-tools (Read, Grep, Glob, WebSearch,
// WebFetch) report no size, so the number is guessed and written as measured.
// Rewritten by the fact in fix 1: the volume's unit is read from the line
// itself; a size needs a shell in allowed-tools or the word "estimate", and a
// line count is defined as what the file-reading tool reports, with Read
// granted. A "size on disk" anywhere in the skill keeps the original check.
test('gen-spec (shared): the volume in `Documents to read:` is a number the skill\'s tools report, or an estimate', () => {
  const raw = read(editions('gen-spec').shared);
  const front = raw.slice(0, raw.indexOf('\n---', 3));
  const tools = (front.match(/^allowed-tools:\s*(.*)$/m) || [])[1] ?? '';
  const shell = /\bBash\b/.test(tools);
  for (const s of sentences(raw).filter((x) => /sizes? on disk/.test(x))) {
    assert.ok(shell || /estimat/i.test(s), `gen-spec shared: "${s}" with allowed-tools: ${tools}`);
  }
  const text = flat(raw);
  const line = text.match(/`Documents to read: <m> \(<(\w+)> (\w+)\)/);
  assert.ok(line, 'gen-spec shared: the `Documents to read:` line with its volume');
  const [, placeholder, unit] = line;
  const definition = sentences(raw).find((s) => s.includes(`\`<${placeholder}>\` is`));
  assert.ok(definition, `gen-spec shared: a sentence defines <${placeholder}>`);
  if (/^(KB|MB|bytes?)$/i.test(unit)) {
    assert.ok(shell || /estimat/i.test(definition), `gen-spec shared: "${definition}" with allowed-tools: ${tools}`);
    return;
  }
  assert.equal(unit, 'lines', `gen-spec shared: the volume is a size or a line count, not "${unit}"`);
  assert.match(tools, /\bRead\b/, `gen-spec shared: the file-reading tool is granted (allowed-tools: ${tools})`);
  assert.match(definition, /line counts[^.]*as the file-reading tool reports them/, `gen-spec shared: "${definition}"`);
});
