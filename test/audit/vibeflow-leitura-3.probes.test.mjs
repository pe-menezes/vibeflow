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
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
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

// ---------------------------------------------------------------- re-audit 2

// The reading point of each consumer: where it finds the list and reads it.
const READING_POINTS = {
  implement: ['## Phase 2', '## Phase 3'],
  'prompt-pack': ['2. Read `.vibeflow/conventions.md`', '3. Read the codebase files'],
  audit: ['2. **Spec** (`2/7 spec`)', '3. **Tests** (`3/7 tests`)'],
};

function section(raw, from, to, label) {
  const start = raw.indexOf(from);
  assert.notEqual(start, -1, `${label}: anchor "${from}"`);
  const end = raw.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${label}: anchor "${to}"`);
  return raw.slice(start, end);
}

// Finding N1. Contract: a spec written before the `Documents to read:` line
// (an old spec) changes only how its list is found; its documents are read
// whole like any other. Regression: any sentence of the reading point that
// talks about a spec without the line and gives it another reading ("is read
// as before", "keeps reading by sections as before"). The executor's test pins
// one exact sentence and refuses only "is read as before", so a second
// sentence that exempts the old spec in other words passes it; this probe
// reads every such sentence, whatever its wording.
test('consumers: every sentence about a spec without the line keeps the whole read', () => {
  for (const [workflow, [from, to]] of Object.entries(READING_POINTS)) {
    for (const [edition, path] of Object.entries(editions(workflow))) {
      const point = section(read(path), from, to, `${workflow} ${edition}`);
      const old = sentences(point).filter((s) => /without (that|the|a) (`Documents to read:` )?line/i.test(s));
      assert.ok(old.length > 0, `${workflow} ${edition}: the reading point says what an old spec does`);
      for (const s of old) {
        assert.match(s, /read whole/, `${workflow} ${edition}: "${s}"`);
        assert.doesNotMatch(s, /\bis read as before\b|\bread (it|them) as before\b/, `${workflow} ${edition}: "${s}"`);
      }
    }
  }
});

// Finding N2. Contract: every reply with which the loop's orchestrator stops
// ends with the Phase 2 read receipt, not only the final report of step 7.
// Regression: the rule narrowed back to the final report, or one of the stops
// that leave the loop unfinished dropped from it: the first verdict without
// the OK to commit, the end with no PR that follows from it (the ending
// "never reaches this section"), the handoff at a part boundary. The
// executor's test names four stops but not the end with no PR.
test('orchestrator: the receipt rule covers every stop, the end with no PR included', () => {
  const raw = read(`${KIT}/orchestrator.md`);
  const discipline = section(raw, '## Orchestrator discipline', '\n## ', 'orchestrator');
  const rule = sentences(discipline).filter((s) => /read receipt/.test(s));
  assert.equal(rule.length, 1, `orchestrator: one receipt rule in the discipline: ${JSON.stringify(rule)}`);
  const [s] = rule;
  assert.match(s, /\bEvery reply that stops the loop\b/, `orchestrator: "${s}"`);
  assert.match(s, /first verdict without the OK to commit/, `orchestrator: "${s}"`);
  assert.match(s, /\bno PR\b/, `orchestrator: "${s}"`);
  assert.match(s, /handoff at a part boundary/, `orchestrator: "${s}"`);
  assert.match(raw, /stops at its first verdict/, 'orchestrator: the stop the rule names still exists');
  assert.match(raw, /At a part boundary[^.]*write the handoff/, 'orchestrator: the handoff the rule names still exists');
});

// Finding N3. Contract: the re-auditor reads the same project knowledge as the
// fix round it re-audits, with the same rule. Oracle: the fix template's
// "project knowledge" line. Regression: one of the two templates edited and
// the other left behind (the executor's test pins each template's literal on
// its own).
test('briefing templates: the re-auditor reads the spec and the same project knowledge as the fix', () => {
  const raw = read(`${KIT}/briefings.md`);
  const readFirst = (from, to) => {
    const template = section(raw, from, to, from);
    return section(template, '## Read first', '\n## ', `${from} Read first`);
  };
  const knowledge = (text) => text.split('\n').find((l) => l.startsWith('* project knowledge:'));
  const fix = readFirst('## Fix', '## Auditor');
  const reaudit = raw.slice(raw.indexOf('## Re-auditor'));
  const reauditFirst = section(reaudit, '## Read first', '\n## ', 're-auditor Read first');
  assert.ok(knowledge(fix), 'fix: project knowledge line');
  assert.equal(knowledge(reauditFirst), knowledge(fix), 're-auditor: the same project knowledge line as the fix');
  assert.match(reauditFirst, /`\.vibeflow\/specs\/<spec file>`/, 're-auditor: the spec');
});

// Finding R3 (executor's caveat in fix 2), closed in fix 3. Contract:
// implement's Phase 2 says where the receipt goes in loop mode the same way the
// orchestrator does (every reply that stops the loop). Regression: the
// parenthesis narrowed back to "at the end of the orchestrator's final report",
// which it said until fix 3.
test('implement: the loop-mode placement of the receipt agrees with the orchestrator', () => {
  for (const [edition, path] of Object.entries(editions('implement'))) {
    const point = flat(section(read(path), '## Phase 2', '## Phase 3', `implement ${edition}`));
    const loop = point.match(/\(in loop mode, ([^)]*)\)/);
    assert.ok(loop, `implement ${edition}: the loop-mode placement`);
    assert.match(loop[1], /every reply that stops the loop|Orchestrator discipline/, `implement ${edition}: "${loop[1]}"`);
  }
});

// ---------------------------------------------------------------- re-audit 3

const EXECUTOR_PLACES = [`${KIT}/roles/executor.md`, 'plugins/vibeflow/agents/executor.md', 'opencode/agents/executor.md'];
const AUDITOR_PLACES = [`${KIT}/roles/auditor.md`, 'plugins/vibeflow/agents/auditor.md', 'opencode/agents/auditor.md'];
const discipline = (path) => section(read(path), '## Session discipline', '## Final answer', path);

// Finding C2. Contract: the orchestrator and watch-round.mjs end a round on
// the progress file's final marker (orchestrator "Watching a round"), so the
// executor's receipt goes before the marker and the marker stays the round's
// last line. Regression: the sentence that makes the marker the last line
// dropped from the role, or any instruction that writes something after the
// marker. The executor's test pins that the receipt bullet opens with "Before
// the round's final marker" and comes after the progress bullet, but not that
// the progress bullet still makes the marker the last line (sabotage S2 of
// re-audit 3 survives it).
test('executor role: the receipt goes before the final marker, and the marker stays the round\'s last line', () => {
  for (const path of EXECUTOR_PLACES) {
    const lines = discipline(path).split('\n');
    const progress = lines.findIndex((l) => l.startsWith('* Write the progress file at every milestone'));
    assert.notEqual(progress, -1, `${path}: the progress bullet`);
    assert.match(lines[progress], /The round's last line is its final marker/, `${path}: the marker is the last line`);
    const receipt = lines.findIndex((l) => /\bread receipt\b/.test(l));
    assert.ok(receipt > progress, `${path}: the receipt bullet after the marker is defined`);
    assert.match(lines[receipt], /^\* Before the round's final marker\b/, `${path}: "${lines[receipt].slice(0, 80)}"`);
    for (const s of sentences(lines.join('\n'))) {
      assert.doesNotMatch(s, /\bafter (the|its) (round's )?(final )?marker\b/i, `${path}: nothing written after the marker: "${s}"`);
    }
  }
  const fix = section(read(`${KIT}/briefings.md`), '## Fix', '## Auditor', 'briefings Fix');
  assert.match(section(fix, '## Progress and delivery', '```', 'Fix delivery'), /ending with its own line `State: final · fix <round>`/, 'Fix template: the section ends with its marker');
});

// Runs watch-round.mjs on a file and plays timed appends while it waits; resolves
// with the exit code, the output and the file's text at the exit. No clock is
// compared: the order of the appends is what the case reads.
function watchWhile(file, steps) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, KIT, 'scripts/watch-round.mjs'), '--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05']);
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timers = steps.map(([delay, action]) => setTimeout(action, delay));
    const guard = setTimeout(() => child.kill(), 20_000);
    child.on('exit', (code) => {
      for (const timer of [...timers, guard]) clearTimeout(timer);
      done({ code, out, atExit: existsSync(file) ? readFileSync(file, 'utf8') : null });
    });
  });
}

// Finding C2, by behavior. Contract: a fix round's receipt, in the form the
// executor role gives it (both forms: everything read whole, and a document
// not read whole), written into the progress file before the marker, does not
// end the watch; the marker after it does. The receipt's lines are built from
// the role's own text, so a label the role changes to something the watcher
// reads as a marker breaks this case. Regression: a receipt label or line form
// that watch-round counts as a final marker, or a watcher loosened to read one.
// The executor's tests read the role's text and never run the watcher.
test('watch-round: the executor receipt written before the marker does not end the round; the marker does', async () => {
  const bullet = discipline(EXECUTOR_PLACES[0]).split('\n').find((l) => /\bread receipt\b/.test(l));
  const forms = [...bullet.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  for (const form of ['Read in full: <n> of <m>', '- <path> (<lines> lines)', 'Not read whole: none', 'Not read whole:', '- <path>: <why>']) {
    assert.ok(forms.includes(form), `executor role: the receipt form "${form}" (forms: ${JSON.stringify(forms)})`);
  }
  const fill = (form) => form.replace('<n>', '10').replace('<m>', '11').replace('<path>', '.vibeflow/conventions.md').replace('<lines>', '529').replace('<why>', 'stopped at line 300, then read the final section');
  const receipt = [fill('Read in full: <n> of <m>'), fill('- <path> (<lines> lines)'), fill('Not read whole:'), fill('- <path>: <why>'), '', fill('Read in full: <n> of <m>').replace('10 of', '11 of'), fill('- <path> (<lines> lines)'), fill('Not read whole: none')];
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-leitura-3-reaudit-3-'));
  try {
    const file = join(dir, 'feature-part.md');
    writeFileSync(file, ['# feature · part · progress', '## Milestone 1', '* done', '', 'State: final', ''].join('\n'));
    const result = await watchWhile(file, [
      [300, () => appendFileSync(file, ['', '## Fix 1', '* fixed the finding', '', ...receipt, ''].join('\n'))],
      [900, () => appendFileSync(file, '\nState: final · fix 1\n')],
    ]);
    assert.equal(result.code, 0, result.out);
    assert.ok(result.atExit.includes('State: final · fix 1'), `the receipt ended the watch before the marker: ${result.out}`);
    const last = result.atExit.trimEnd().split('\n').at(-1);
    assert.equal(last, 'State: final · fix 1', 'the marker is the last line, after the receipt');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Finding C1, open gap (low, cause spec). Contract: the receipt says "read
// whole" only for a document whose every line was read, as the reading rule
// asks (keep reading from where the read stopped). Today the criterion is
// reaching the last line ("a document read to its last line over more than one
// read counts as read whole"): a session that read lines 1 to 300 and then the
// last section of a 529-line document reached its last line over two reads, and
// by the letter of the sentence counts it as read whole. The case turns green
// when the criterion sentence says the reads leave no gap.
test('receipt: the criterion counts as whole only reads that leave no gap', { todo: 'open gap: "to its last line over more than one read" admits a read that skips the middle' }, () => {
  const paths = [];
  for (const workflow of CONSUMERS) paths.push(...Object.values(editions(workflow)));
  paths.push(...EXECUTOR_PLACES, ...AUDITOR_PLACES);
  for (const path of paths) {
    const criterion = sentences(read(path)).filter((s) => /over more than one read/.test(s));
    assert.ok(criterion.length > 0, `${path}: the criterion`);
    for (const s of criterion) {
      assert.match(s, /\bno gap\b|without a gap|every line|each line|consecutive|from where (it|the previous read) stopped|from its first line/, `${path}: "${s}"`);
    }
  }
});
