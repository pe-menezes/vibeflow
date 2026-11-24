// The Critical Gate describes behaviours, not languages. In each of the three
// audit editions, step 4 must not choose what to scan by a file's type, item b
// carries its three rules (every changed file is scanned, a word is not the
// behaviour, say what was scanned), item b's sentence on when a rule fires is
// the measured direction-and-scope part followed by one clause saying any
// language or format counts, and nothing else (checked by inclusion, against
// rewrites that narrow it by the file), DAT101 covers the records a condition
// selects and leaves out one record deleted by its key and what is held in
// memory, the Security and Data domains list no
// language extension, the catalog keeps 38 rules in 6 domains, and the output
// format carries a `Scanned:` line and the one-finding-per-line note.
// Item b leaves out of the scan only binary and media files, checked by
// inclusion on the list that follows the sentence's colon, against widenings
// that add a lockfile, a generated file, a third-party folder or any other
// category; a file a tool generated is scanned. DAT102 covers personal data that
// goes out unmasked and a person's value written as a literal, and says that a
// field, column or pattern that only names the data is not this, checked
// against the earlier line and against rewrites that drop or invert either
// clause. When step 1 ran over the code, the `No diff scanned`
// line is named in item b and takes the place of the `Scanned:` line, and the
// section does not say Clean, in item b and in the output note. Every finding
// example of the output format carries the severity its rule has in the
// catalog, and every rule keeps the id, severity and scope it had in v1.20.0.
// The assertions pin the contract, not the wording, so a rewrite of the
// technology domains keeps passing as long as it keeps the contract; the one
// exception is the trigger sentence, whose measured part is pinned by its words.
// The Database, Infrastructure, Kubernetes and Config tables describe
// behaviours, their "where" says another tool counts, and the four read the
// same in the three editions; DS106 sends its line to DAT101 too and a DELETE
// with a condition to DAT101 alone; DAT101 negates each of its two exclusions
// on its own; DAT102 names its four outputs. Item b's opening paragraph is the
// second exception, pinned word for word with its spaces folded. The checks
// that hold by meaning prove their force on the measured row, by mutations and
// faithful rewrites, and the edition cases apply only the check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, extractOutputFormat, extractStep } from './fixtures/gate-languages/gate-prompt.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};

const SEVERITIES = new Set(['CRITICAL', 'HIGH', 'WARNING', 'INFO']);
const SCOPES = new Set(['a', 'r', 'b']);

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function forEachEdition(check) {
  for (const [edition, path] of Object.entries(EDITIONS)) check(read(path), edition);
}

function gateStep(raw, edition) {
  const step = extractStep(raw);
  assert.ok(step, `${edition}: the Critical Gate step is found`);
  return step;
}

// Item b of step 4: from its "b." line to the "c." line of the same list.
function itemB(step, edition) {
  const from = step.findIndex((line) => /^\s+b\.\s+\*\*Match each changed line/.test(line));
  assert.ok(from >= 0, `${edition}: item b starts`);
  const indent = step[from].match(/^\s*/)[0];
  const to = step.findIndex((line, i) => i > from && line.startsWith(`${indent}c. `));
  assert.ok(to > from, `${edition}: item b ends at item c`);
  return step.slice(from, to);
}

// The bold titles of item b's bullets, in order.
function itemBRules(lines) {
  return lines
    .map((line) => line.match(/^\s+-\s+\*\*([^*]+)\*\*/))
    .filter(Boolean)
    .map((match) => match[1]);
}

// The catalog: each domain line (`_Name_ — ...`) with the rows of the table
// under it, read as id, severity, scope and the table's fourth header.
function catalog(step) {
  const domains = [];
  let current = null;
  for (const line of step) {
    const domain = line.match(/^\s+_([^_]+)_\s+—\s+(.*)$/);
    if (domain) {
      current = { name: domain[1], description: domain[2], header: null, rules: [] };
      domains.push(current);
      continue;
    }
    if (!current) continue;
    const cells = line.trim().startsWith('|') ? line.trim().slice(1, -1).split('|').map((cell) => cell.trim()) : null;
    if (!cells) continue;
    if (cells[0] === 'ID') {
      current.header = cells;
      continue;
    }
    if (/^-+$/.test(cells[0])) continue;
    current.rules.push({ id: cells[0], severity: cells[1], scope: cells[2] });
  }
  return domains;
}

function domain(domains, name, edition) {
  const found = domains.find((entry) => entry.name === name);
  assert.ok(found, `${edition}: domain ${name} is in the catalog`);
  return found;
}

// An extension of a source language written as a glob or a dotted suffix:
// `*.py`, `.ts`, `*.{js,ts}`.
const EXTENSION = /(^|[\s`(,;])\*?\.(?:[a-z][a-z0-9]{0,5}|\{[^}]*\})(?=[\s`),;]|$)/i;

test('the extension pattern catches a listed extension and leaves prose alone', () => {
  for (const sample of ['files: source (`*.py,*.js`)', 'files: `*.tf`', 'in .ts files', 'globs `*.{js,ts}`']) {
    assert.match(sample, EXTENSION, sample);
  }
  for (const sample of ['where: application code, scripts and configuration, in any language', 'e.g. a Node.js app']) {
    assert.doesNotMatch(sample, EXTENSION, sample);
  }
});

test('item b fires a rule on what the line does, never on the file type', () => {
  forEachEdition((raw, edition) => {
    const text = itemB(gateStep(raw, edition), edition).join('\n');
    assert.doesNotMatch(text, /target types/i, `${edition}: item b still names the rule's target types`);
    assert.doesNotMatch(text, /\bthe file matches\b/i, `${edition}: item b still conditions a rule on the file`);
    assert.match(text, /what the rule describes/i, `${edition}: item b fires on the behaviour`);
    assert.match(text, /examples?\b/i, `${edition}: item b reads the names in parentheses as examples`);
  });
});

// The sentence of item b that says when a rule fires, with its line breaks
// folded: the first sentence of item b with "A rule fires", from those words on
// (the bold title before them ends in a period the sentence split does not see).
function triggerSentence(step, edition) {
  const found = sentences(itemB(step, edition)).find((sentence) => /\bA rule fires\b/.test(sentence));
  assert.ok(found, `${edition}: item b says when a rule fires`);
  return found.slice(found.indexOf('A rule fires'));
}

// The part of the trigger sentence that gives the direction, the scope and the
// behaviour. It is pinned by its words because the sentence was measured with a
// model: a rewrite of this part has to be measured again before it lands here.
const DIRECTION_AND_SCOPE =
  "A rule fires when the diff line's direction matches its `scope` (a=added, r=removed, b=both) and the line does what the rule describes";
// The clauses that may close the sentence, each saying that any language or
// format counts: the measured one and two harmless rewrites of it.
const ANY_LANGUAGE_CLAUSES = {
  measured: ', in whatever language or format the file is written.',
  R1: ', whatever the language or the format the file is written in.',
  R2: ', in any language or format.',
};

const fold = (text) => text.replace(/\s+/g, ' ').trim();

// The trigger contract, by inclusion: with its spaces folded, the sentence is
// the direction-and-scope part followed by one any-language clause, and
// nothing else. Any condition on the file, before or after the behaviour, or a
// missing clause, makes it something else.
function firesOnBehaviourInAnyLanguage(sentence) {
  const text = fold(sentence);
  return Object.values(ANY_LANGUAGE_CLAUSES).some((clause) => text === DIRECTION_AND_SCOPE + clause);
}

// Narrowing rewrites, applied to the sentence read from an edition: each one
// takes some files out of the rule, or drops the any-language clause.
const BEHAVIOUR = 'does what the rule describes';
const withEnding = (ending) => (text) => text.slice(0, text.indexOf(BEHAVIOUR) + BEHAVIOUR.length) + ending;
const beforeTheEnd = (addition) => (text) => text.replace(/\.$/, addition);
const MUTATIONS = {
  M1: withEnding(", provided the file's language is Python."),
  M2: withEnding(" AND the file matches the rule's target types."),
  M3: withEnding(', in the languages the catalog names.'),
  M4: withEnding(", when the file's extension is listed under the rule's domain."),
  M5: withEnding('.'),
  M6: beforeTheEnd(', except in generated files.'),
  X1: beforeTheEnd(", for files under the rule's domain."),
  X2: (text) => text.replace(/^A rule fires when\b/, 'A rule fires, in source files, when'),
  X3: beforeTheEnd(', as long as it is source code.'),
  X4: withEnding(", in any language or format the rule's domain names."),
  X5: beforeTheEnd(', in source files.'),
};
const REWRITES = {
  R1: withEnding(ANY_LANGUAGE_CLAUSES.R1),
  R2: withEnding(ANY_LANGUAGE_CLAUSES.R2),
};

test('item b fires a rule on what the line does in any language, and no clause narrows it by the file', () => {
  const checkSentence = (sentence, where) => {
    assert.ok(firesOnBehaviourInAnyLanguage(sentence), `${where}: the trigger sentence passes the check: ${sentence}`);
    const text = fold(sentence);
    for (const [name, mutate] of Object.entries(MUTATIONS)) {
      const mutated = mutate(text);
      assert.notEqual(mutated, text, `${where}: ${name} changes the sentence`);
      assert.equal(firesOnBehaviourInAnyLanguage(mutated), false, `${where}: ${name} is rejected: ${mutated}`);
    }
    for (const [name, rewrite] of Object.entries(REWRITES)) {
      const rewritten = rewrite(text);
      assert.ok(firesOnBehaviourInAnyLanguage(rewritten), `${where}: ${name} is accepted: ${rewritten}`);
    }
  };
  const diffText = 'diff --git a/app/run.sh b/app/run.sh\n+rm -rf "$DIR"\n';
  forEachEdition((raw, edition) => {
    checkSentence(triggerSentence(gateStep(raw, edition), edition), edition);
    const prompt = buildPrompt({ skillText: raw, skillName: 'SKILL.md', diffText });
    checkSentence(triggerSentence(gateStep(prompt, `${edition} request`), `${edition} request`), `${edition} request`);
  });
});

test('item b carries three rules: every file is scanned, a word is not the behaviour, say what was scanned', () => {
  forEachEdition((raw, edition) => {
    const lines = itemB(gateStep(raw, edition), edition);
    const rules = itemBRules(lines);
    assert.equal(rules.length, 3, `${edition}: item b has three rules, found ${JSON.stringify(rules)}`);
    assert.match(rules[0], /every changed file is scanned/i, `${edition}: first rule`);
    assert.match(rules[1], /a word is not the behaviour/i, `${edition}: second rule`);
    assert.match(rules[2], /say what was scanned/i, `${edition}: third rule`);
    const text = lines.join('\n');
    assert.match(text, /comment/i, `${edition}: a comment does not fire`);
    assert.match(text, /test name/i, `${edition}: a test name does not fire`);
    assert.match(text, /`Scanned:`/, `${edition}: item b names the Scanned: line`);
  });
});

test('every domain line says where, as a guide, and Security and Data list no language extension', () => {
  forEachEdition((raw, edition) => {
    const domains = catalog(gateStep(raw, edition));
    for (const entry of domains) {
      assert.match(entry.description, /^where:/, `${edition}: domain ${entry.name} opens with "where:"`);
    }
    for (const name of ['Security', 'Data']) {
      const entry = domain(domains, name, edition);
      assert.doesNotMatch(entry.description, EXTENSION, `${edition}: domain ${name} lists an extension`);
      assert.equal(entry.header?.[3], 'Behaviour', `${edition}: the ${name} table describes behaviours`);
    }
  });
});

test('the catalog keeps 38 rules in 6 domains, with unique ids and valid severity and scope', () => {
  const byEdition = {};
  forEachEdition((raw, edition) => {
    const domains = catalog(gateStep(raw, edition));
    assert.equal(domains.length, 6, `${edition}: six domains`);
    const rules = domains.flatMap((entry) => entry.rules);
    assert.equal(rules.length, 38, `${edition}: 38 rules`);
    const ids = rules.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length, `${edition}: rule ids are unique`);
    for (const rule of rules) {
      assert.match(rule.id, /^[A-Z][A-Z0-9]*\d{3}$/, `${edition}: id ${rule.id}`);
      assert.ok(SEVERITIES.has(rule.severity), `${edition}: ${rule.id} severity ${rule.severity}`);
      assert.ok(SCOPES.has(rule.scope), `${edition}: ${rule.id} scope ${rule.scope}`);
    }
    byEdition[edition] = rules.map((rule) => `${rule.id} ${rule.severity} ${rule.scope}`);
  });
  assert.deepEqual(byEdition.cursor, byEdition.shared, 'cursor keeps the same ids, severities and scopes');
  assert.deepEqual(byEdition.copilot, byEdition.shared, 'copilot keeps the same ids, severities and scopes');
});

// The output lines of the `### Critical Gate` section must carry the Scanned:
// line right after the Left out line, and the one-finding-per-line note after
// the last finding example.
function checkOutputLines(lines, where) {
  const leftOut = lines.findIndex((line) => line.startsWith('Left out of the package:'));
  assert.ok(leftOut >= 0, `${where}: the Left out line is there`);
  const scanned = lines[leftOut + 1] ?? '';
  assert.match(scanned, /^Scanned: /, `${where}: the Scanned: line comes right after the Left out line`);
  assert.match(scanned, /not scanned: <path> \(<why>\)/, `${where}: the Scanned: line names each file left out and why`);
  assert.match(scanned, /\| none$/, `${where}: the Scanned: line has a "none" form`);
  assert.equal(lines.filter((line) => line.startsWith('Scanned:')).length, 1, `${where}: one Scanned: line`);
  const findings = lines.map((line, i) => (/^- \S+ [A-Z]+ \[[A-Z0-9]+\]/.test(line) ? i : -1)).filter((i) => i >= 0);
  assert.ok(findings.length > 0, `${where}: the format shows finding lines`);
  const note = lines.findIndex((line) => /^\(one finding per line\b/.test(line));
  assert.ok(note > findings.at(-1), `${where}: the one-finding-per-line note follows the finding examples`);
  assert.match(lines[note], /two findings/, `${where}: a rule on two lines is two findings`);
}

test('the output format carries the Scanned: line after the Left out line, and one finding per line', () => {
  forEachEdition((raw, edition) => {
    const lines = extractOutputFormat(raw);
    assert.ok(lines, `${edition}: the ### Critical Gate output section is found`);
    checkOutputLines(lines, edition);
  });
});

// The sentences of a block of prose, with its line breaks folded.
function sentences(lines) {
  return lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// The lines of one bullet of item b, from its bold title to the next bullet.
function itemBRule(lines, title, edition) {
  const from = lines.findIndex((line) => new RegExp(`^\\s+-\\s+\\*\\*${title}`, 'i').test(line));
  assert.ok(from >= 0, `${edition}: item b has the rule "${title}"`);
  const next = lines.findIndex((line, i) => i > from && /^\s+-\s+\*\*/.test(line));
  return lines.slice(from, next > from ? next : lines.length);
}

// A sentence that takes files out of the scan, unless it says "never".
const OUT_OF_SCAN = /\b(leave out|left out|not scanned|skip\w*|exclud\w*|ignor\w*|omit\w*|out of the scan)\b/i;
const outOfScan = (prose) => prose.filter((sentence) => OUT_OF_SCAN.test(sentence) && !/\bnever\b/i.test(sentence));

// The out-of-scan contract, by inclusion: the sentence lists what it takes out
// after its colon, and every item of that list is binary files or media files.
// A lockfile, a generated file, a third-party folder or any other category in
// the list makes it something else.
function leavesOutOnlyBinaryAndMedia(sentence) {
  const colon = sentence.indexOf(':');
  if (colon < 0) return false;
  const items = sentence
    .slice(colon + 1)
    .replace(/\.$/, '')
    .split(/,|\band\b/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 && items.every((item) => /^(binary|media)( files)?$/i.test(item));
}

// Widenings of the list, applied to the sentence read from an edition: each
// one takes out of the scan a file that can hold a rule.
const WIDENINGS = {
  lockfile: (text) => text.replace(/\.$/, ', and lockfiles.'),
  generated: (text) => text.replace(/\.$/, ', and generated files.'),
  'third-party folder': (text) => text.replace(/\.$/, ', and vendor directories.'),
  'invented category': (text) => text.replace(/\.$/, ', and snapshot fixtures.'),
};

test('item b leaves out only what cannot hold a rule, and a generated file is scanned', () => {
  forEachEdition((raw, edition) => {
    const prose = sentences(itemBRule(itemB(gateStep(raw, edition), edition), 'Every changed file is scanned', edition));
    const leaveOut = outOfScan(prose);
    assert.ok(leaveOut.length > 0, `${edition}: item b says what is left out of the scan`);
    for (const sentence of leaveOut) {
      assert.ok(leavesOutOnlyBinaryAndMedia(sentence), `${edition}: item b takes out of the scan more than binary and media files: ${sentence}`);
      for (const [name, widen] of Object.entries(WIDENINGS)) {
        const widened = widen(sentence);
        assert.notEqual(widened, sentence, `${edition}: the ${name} widening changes the sentence`);
        assert.equal(leavesOutOnlyBinaryAndMedia(widened), false, `${edition}: the ${name} widening is rejected: ${widened}`);
      }
    }
    assert.ok(
      prose.some((sentence) => /generated/i.test(sentence) && /\bscanned\b/i.test(sentence) && !/\b(not scanned|leave out|left out)\b/i.test(sentence)),
      `${edition}: item b says a generated file is scanned`,
    );
  });
});

test('the No diff scanned line is named in item b and takes the place of the Scanned: line', () => {
  forEachEdition((raw, edition) => {
    const rule = itemBRule(itemB(gateStep(raw, edition), edition), 'Say what was scanned', edition).join('\n');
    assert.match(rule, /`No diff scanned`/, `${edition}: "Say what was scanned" names the No diff scanned line`);
    const lines = extractOutputFormat(raw);
    assert.ok(lines, `${edition}: the ### Critical Gate output section is found`);
    const note = lines.find((line) => line.startsWith('(') && line.includes('No diff scanned'));
    assert.ok(note, `${edition}: the output format has a note with the No diff scanned line`);
    const after = note.slice(note.indexOf('No diff scanned'));
    assert.match(after, /^[^;]*\b(place of|instead of|replaces|stands in for)\b[^;]*`Scanned:` line/i, `${edition}: the note says No diff scanned takes the place of the Scanned: line`);
  });
});

// A negation that reaches the word Clean in the same clause, before it, or a
// "not" or "never" at most two words after it ("Clean" is not written), as the
// audit probe on the same contract accepts. The name of the No diff scanned
// line is taken out first, so its own "No" does not count.
const NO_CLEAN = /\b(no|not|never|nor|without)\b[^;]*\bClean\b|\bClean\b"?(?:\s+[A-Za-z]+){0,2}\s+(not|never)\b/i;

test('the no-Clean pattern accepts a negation before or right after Clean, and rejects Clean said to follow', () => {
  for (const sample of [
    'the `` line stands in place of the `Scanned:` line, and the section does not say "Clean": nothing was scanned.',
    'the `` line stands in place of the `Scanned:` line, and "Clean" is not written: nothing was scanned.',
    'the `` line stands in place of the `Scanned:` line, and "Clean" is never written: nothing was scanned.',
  ]) {
    assert.match(sample, NO_CLEAN, sample);
  }
  for (const sample of [
    'the `` line stands in place of the `Scanned:` line, and the section says "Clean" after it.',
    'the `` line stands in place of the `Scanned:` line, and a "Clean" line follows, not a finding line.',
    'the `` line stands in place of the `Scanned:` line, and "Clean" is written: nothing was scanned.',
  ]) {
    assert.doesNotMatch(sample, NO_CLEAN, sample);
  }
});

test('with no diff, the section does not say Clean, in item b and in the output note', () => {
  forEachEdition((raw, edition) => {
    const rule = sentences(itemBRule(itemB(gateStep(raw, edition), edition), 'Say what was scanned', edition));
    const noDiff = rule.filter((sentence) => sentence.includes('No diff scanned'));
    assert.ok(noDiff.length > 0, `${edition}: "Say what was scanned" has a sentence on the No diff scanned line`);
    assert.ok(
      noDiff.some((sentence) => NO_CLEAN.test(sentence.replaceAll('No diff scanned', ''))),
      `${edition}: "Say what was scanned" says the section does not say Clean when step 1 ran over the code`,
    );
    const note = extractOutputFormat(raw).find((line) => line.startsWith('(') && line.includes('No diff scanned'));
    assert.ok(note, `${edition}: the output format has a note with the No diff scanned line`);
    const clause = note.slice(note.indexOf('No diff scanned') + 'No diff scanned'.length).split(';')[0];
    assert.match(clause, NO_CLEAN, `${edition}: the note says no finding or Clean line follows No diff scanned`);
  });
});

test('every finding example of the output format carries the severity its rule has in the catalog', () => {
  forEachEdition((raw, edition) => {
    const rules = new Map(catalog(gateStep(raw, edition)).flatMap((entry) => entry.rules).map((rule) => [rule.id, rule]));
    const findings = extractOutputFormat(raw)
      .map((line) => line.match(/^- \S+ ([A-Z]+) \[([A-Z0-9]+)\]/))
      .filter(Boolean);
    assert.ok(findings.length > 0, `${edition}: the format shows finding lines`);
    for (const [line, severity, id] of findings) {
      assert.ok(rules.has(id), `${edition}: ${id} is a rule of the catalog: ${line}`);
      if (severity === 'ALLOWED') continue;
      assert.equal(severity, rules.get(id).severity, `${edition}: ${id} is ${rules.get(id).severity} in the catalog: ${line}`);
    }
  });
});

// Id, severity and scope of every rule, as of v1.20.0. A rewrite of the
// technology domains keeps these three fields; this table is the reference.
const RULES = {
  DS101: 'CRITICAL a', DS102: 'CRITICAL a', DS103: 'CRITICAL a', DS104: 'HIGH a',
  DS105: 'HIGH a', DS106: 'HIGH a', DS108: 'WARNING a', DS110: 'INFO a',
  SEC101: 'CRITICAL r', SEC102: 'CRITICAL r', SEC103: 'HIGH r', SEC104: 'CRITICAL a',
  SEC105: 'HIGH a', SEC106: 'HIGH a', SEC107: 'WARNING r', SEC108: 'WARNING a',
  IAC101: 'CRITICAL a', IAC102: 'CRITICAL a', IAC103: 'HIGH b', IAC104: 'HIGH r',
  IAC105: 'WARNING a', IAC106: 'WARNING a',
  K8S101: 'HIGH a', K8S102: 'HIGH a', K8S103: 'HIGH a', K8S104: 'HIGH a',
  K8S105: 'WARNING a', K8S106: 'WARNING a',
  CFG101: 'HIGH a', CFG102: 'WARNING a', CFG103: 'WARNING a', CFG104: 'WARNING a', CFG105: 'INFO r',
  DAT101: 'CRITICAL a', DAT102: 'HIGH a', DAT103: 'HIGH r', DAT104: 'WARNING a', DAT105: 'WARNING r',
};

test('every rule keeps its id, severity and scope', () => {
  forEachEdition((raw, edition) => {
    const found = Object.fromEntries(
      catalog(gateStep(raw, edition)).flatMap((entry) => entry.rules).map((rule) => [rule.id, `${rule.severity} ${rule.scope}`]),
    );
    assert.deepEqual(found, RULES, `${edition}: the catalog's ids, severities and scopes`);
  });
});

// The behaviour cell of one rule's row in the catalog.
function ruleBehaviour(step, id, edition) {
  const row = step.find((line) => line.trim().startsWith(`| ${id} |`));
  assert.ok(row, `${edition}: ${id} is in the catalog`);
  return row.trim().slice(1, -1).split('|')[3].trim();
}

test('DAT101 covers the records a condition selects, and leaves out one record by its key and what is held in memory', () => {
  forEachEdition((raw, edition) => {
    const behaviour = ruleBehaviour(gateStep(raw, edition), 'DAT101', edition);
    const clauses = behaviour.split(';');
    assert.match(behaviour, /\b(condition|filter)\b[^;]*\b(selects?|matches)\b/i, `${edition}: DAT101 covers the records a condition selects: ${behaviour}`);
    assert.doesNotMatch(behaviour, /\b(no|not|without|unfiltered)\b[^;,]*\b(condition|filter|where)\b/i, `${edition}: DAT101 takes a delete with a condition out of the rule: ${behaviour}`);
    assert.ok(
      clauses.some((clause) => /\bkey\b/i.test(clause) && /\b(not|nor|never)\b/i.test(clause)),
      `${edition}: DAT101 says one record deleted by its key is not this: ${behaviour}`,
    );
    assert.ok(
      clauses.some((clause) => /\bmemory\b/i.test(clause) && /\b(not|nor|never)\b/i.test(clause)),
      `${edition}: DAT101 says emptying what is held in memory is not this: ${behaviour}`,
    );
  });
});

// The DAT102 contract: the behaviour covers personal data that goes out
// unmasked and a person's value written as a literal, in clauses that do not
// negate them, and says that a field, column or pattern that only names the
// data is not this.
function exposesDataAndLiteralValue(behaviour) {
  const clauses = behaviour.split(';');
  const negation = /\b(no|not|never|nor|without)\b/i;
  const goesOut = clauses.some((clause) => /\bunmasked\b/i.test(clause) && /\b(goes out|sent|exposed)\b[^;]*\b(response|log)\b/i.test(clause) && !negation.test(clause));
  const literal = clauses.some((clause) => /\bvalue\b[^;]*\bliteral\b/i.test(clause) && !negation.test(clause));
  const onlyNames = clauses.some((clause) => /\bonly names?\b[^;:]*\b(not|never|nor)\b/i.test(clause));
  return goesOut && literal && onlyNames;
}

// Rewrites of the measured DAT102 cell, as proof that the check holds: the
// earlier line, which only had the data going out, the literal clause gone,
// the naming exclusion gone, the exclusion turned into an inclusion, and the
// literal negated. The cell names the personal data before the exclusion, so
// the exclusion may end the cell's prose with no colon after it.
const DAT102_MUTATIONS = {
  'branch line': (text) => text.replace(/ is exposed unmasked: .*?\bis not this:? ?/, ' goes out unmasked in a response, a log, an export or a notification: '),
  'no literal': (text) => text.replace(/, or [^;]*\bliteral\b[^;]*/, ''),
  'no naming exclusion': (text) => text.replace(/; [^;]*\bonly names\b[^;]*?\bis not this\b/, ''),
  'exclusion as inclusion': (text) => text.replace(/\bonly names the data is not this\b/, 'only names the data is also this'),
  'literal negated': (text) => text.replace(/\bvalue is written as a literal\b/, 'value is never written as a literal'),
};

test('DAT102 covers data that goes out unmasked and a value written as a literal, and leaves out what only names the data', () => {
  forEachEdition((raw, edition) => {
    const behaviour = ruleBehaviour(gateStep(raw, edition), 'DAT102', edition);
    assert.ok(exposesDataAndLiteralValue(behaviour), `${edition}: DAT102 covers the data that goes out and the literal value, and not what only names it: ${behaviour}`);
    for (const [name, mutate] of Object.entries(DAT102_MUTATIONS)) {
      const mutated = mutate(behaviour);
      assert.notEqual(mutated, behaviour, `${edition}: the "${name}" rewrite changes the line`);
      assert.equal(exposesDataAndLiteralValue(mutated), false, `${edition}: the "${name}" rewrite is rejected: ${mutated}`);
    }
  });
});

test('gate-prompt builds, from each edition, a request that carries the two lines', () => {
  const diffText = 'diff --git a/app/run.sh b/app/run.sh\n+rm -rf "$DIR"\n';
  forEachEdition((raw, edition) => {
    const prompt = buildPrompt({ skillText: raw, skillName: 'SKILL.md', diffText });
    const lines = prompt.split('\n');
    const from = lines.indexOf('## Output format');
    const to = lines.indexOf('## Diff');
    assert.ok(from >= 0 && to > from, `${edition}: the request has its output format`);
    checkOutputLines(lines.slice(from, to), `${edition} request`);
    assert.ok(prompt.includes('**Every changed file is scanned.**'), `${edition} request: carries item b's rules`);
  });
});

// --- the technology domains describe behaviours ----------------------------

const TECH_DOMAINS = ['Database', 'Infrastructure (IaC)', 'Kubernetes', 'Config'];
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One domain of the catalog: its "where" line and its table, up to the blank
// line that closes it, each line trimmed.
function domainBlock(step, name, edition) {
  const from = step.findIndex((line) => new RegExp(`^\\s+_${escapeRegExp(name)}_\\s+—`).test(line));
  assert.ok(from >= 0, `${edition}: domain ${name} is in the catalog`);
  const end = step.findIndex((line, i) => i > from && line.trim() === '');
  return step.slice(from, end > from ? end : step.length).map((line) => line.trim());
}

// A "where" that says the same setting in another tool, framework, format or
// platform counts, and narrows nothing.
const ANOTHER_TOOL_COUNTS = /\b(?:any|another|other)\s+(?:tool|framework|format|container platform|platform)s?\b/i;
const NARROWS = /\b(?:only|never|not|except|unless)\b/i;

test('the database, infrastructure, Kubernetes and config domains describe behaviours, say another tool counts, and read the same in the three editions', () => {
  const blocks = {};
  forEachEdition((raw, edition) => {
    const step = gateStep(raw, edition);
    const domains = catalog(step);
    for (const name of TECH_DOMAINS) {
      const entry = domain(domains, name, edition);
      assert.equal(entry.header?.[3], 'Behaviour', `${edition}: the ${name} table describes behaviours`);
      assert.match(entry.description, ANOTHER_TOOL_COUNTS, `${edition}: the ${name} "where" says another tool counts: ${entry.description}`);
      assert.doesNotMatch(entry.description, NARROWS, `${edition}: the ${name} "where" narrows the domain: ${entry.description}`);
      for (const rule of entry.rules) {
        const behaviour = ruleBehaviour(step, rule.id, edition);
        assert.doesNotMatch(behaviour, /^`/, `${edition}: ${rule.id} opens with a name, not a behaviour: ${behaviour}`);
      }
    }
    blocks[edition] = TECH_DOMAINS.map((name) => domainBlock(step, name, edition));
  });
  assert.deepEqual(blocks.cursor, blocks.shared, 'cursor: the four technology domains differ from the shared edition');
  assert.deepEqual(blocks.copilot, blocks.shared, 'copilot: the four technology domains differ from the shared edition');
});

// The DS106 contract, by meaning: the line that deletes every row with no
// condition is also DAT101, and a `DELETE` whose condition selects rows is
// DAT101 alone, never DS106. Code marks are dropped first; "with no
// condition" and "no WHERE" describe the DS106 line itself and are not a
// condition.
const NEGATED = /\b(?:no|not|never|nor|neither|none)\b|n't\b/i;
const CONDITION = /\b(?:condition|where|filter\w*)\b/i;
const NO_CONDITION = /\b(?:with|has|having|carries)\s+no\s+(?:condition|where|filter)\b/gi;
function ds106SendsDeletesToDat101(behaviour) {
  const prose = behaviour.replace(/`([^`]*)`/g, '$1');
  const clauses = prose
    .split(/;|,\s*(?=(?:and|but)\b)/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const conditioned = (clause) => CONDITION.test(clause.replace(NO_CONDITION, ''));
  const also = clauses.some(
    (clause) => /\bDAT101\b/.test(clause) && /\b(?:also|as well|too)\b/i.test(clause) && !NEGATED.test(clause) && !conditioned(clause),
  );
  const alone = (clause) => {
    const rest = clause.replace(/\b(?:not|never)\s+(?:also\s+)?DS106\b/gi, '');
    const saysAlone = rest !== clause || /\b(?:alone|only)\b/i.test(rest);
    return saysAlone && /\bDAT101\b/.test(rest) && !/\bDS106\b|\bthis\b/i.test(rest) && !NEGATED.test(rest);
  };
  const withCondition = clauses.filter(conditioned);
  return also && withCondition.length > 0 && withCondition.every(alone);
}

// A check proves its force on a sample: each mutation changes the sample and
// is rejected, each faithful rewrite changes it and is accepted. The edition
// cases below apply only the check, so a faithful rewrite of the catalog keeps
// passing.
function proveCheck(check, sample, mutations, rewrites) {
  assert.ok(check(sample), `the sample passes the check: ${sample}`);
  for (const [name, mutate] of Object.entries(mutations)) {
    const mutated = mutate(sample);
    assert.notEqual(mutated, sample, `the "${name}" rewrite changes the sample`);
    assert.equal(check(mutated), false, `the "${name}" rewrite is rejected: ${mutated}`);
  }
  for (const [name, rewrite] of Object.entries(rewrites)) {
    const rewritten = rewrite(sample);
    assert.notEqual(rewritten, sample, `the "${name}" rewrite changes the sample`);
    assert.ok(check(rewritten), `the "${name}" rewrite is accepted: ${rewritten}`);
  }
}

// The DS106 row as it was measured with a model, the sample of its check.
const DS106_SAMPLE =
  'every row of a table is deleted by a `DELETE` with no condition (`DELETE FROM <table>` with no `WHERE`); the same line is also DAT101, and a `DELETE` whose condition selects many rows is DAT101 alone';

const DS106_MUTATIONS = {
  'not DAT101': (text) => text.replace('is also DAT101', 'is not DAT101'),
  'never DAT101': (text) => text.replace('is also DAT101', 'is never DAT101'),
  'DAT101 dropped': (text) => text.replace('the same line is also DAT101, and ', ''),
  'condition to DS106': (text) => text.replace('is DAT101 alone', 'is DS106 alone'),
  'condition is also this': (text) => text.replace('is DAT101 alone', 'is also this'),
  'condition is both': (text) => text.replace('is DAT101 alone', 'is DAT101 and DS106'),
  'condition not DAT101': (text) => text.replace('is DAT101 alone', 'is not DAT101'),
  'condition dropped': (text) => text.replace(/, and a `DELETE` whose condition[^;]*$/, ''),
};
const DS106_REWRITES = {
  'as well, only': (text) => text.replace('is also DAT101', 'is DAT101 as well').replace('is DAT101 alone', 'is only DAT101'),
  'fires, not DS106': (text) =>
    text.replace(/; the same line .*$/, '; that line also fires DAT101; a `DELETE` with a condition that selects many rows fires DAT101 and not DS106'),
};

test('the DS106 check rejects a row that inverts either clause, and accepts faithful rewrites', () => {
  proveCheck(ds106SendsDeletesToDat101, DS106_SAMPLE, DS106_MUTATIONS, DS106_REWRITES);
});

test('DS106 says the same line is also DAT101, and a DELETE whose condition selects many rows is DAT101 alone, in the three editions', () => {
  forEachEdition((raw, edition) => {
    const behaviour = ruleBehaviour(gateStep(raw, edition), 'DS106', edition);
    assert.ok(ds106SendsDeletesToDat101(behaviour), `${edition}: DS106 sends the line to DAT101 too, and the condition to DAT101 alone: ${behaviour}`);
  });
});

// --- item b's opening paragraph, word for word -----------------------------

// The opening paragraph of item b, from the trigger sentence to the end of the
// paragraph. It was measured with a model as a whole, so it is pinned by its
// words, with its spaces folded: a new sentence in it, or a sentence changed or
// dropped, has to be measured again before it lands here.
const ITEM_B_TITLE = 'b. **Match each changed line against the Rules Catalog below.**';
const ITEM_B_OPENING =
  "A rule fires when the diff line's direction matches its `scope` (a=added, r=removed, b=both) and the line does what the rule describes, in whatever language or format the file is written. The catalog describes behaviours. The names in parentheses are examples from a few ecosystems, never the list of what counts: the same behaviour under another name, in another language, fires the same rule.";

// The paragraph of item b before its first bullet, with its spaces folded.
function itemBParagraph(lines) {
  const firstBullet = lines.findIndex((line) => /^\s+-\s+\*\*/.test(line));
  return fold(lines.slice(0, firstBullet > 0 ? firstBullet : lines.length).join(' '));
}
const isMeasuredOpening = (paragraph) => fold(paragraph) === `${ITEM_B_TITLE} ${ITEM_B_OPENING}`;

const OPENING_MUTATIONS = {
  'sentence added at the end': (text) => `${text} Generated files are skipped.`,
  'sentence added in the middle': (text) => text.replace('The catalog describes behaviours.', 'The catalog describes behaviours. Only source files count.'),
  'sentence added before the trigger': (text) => text.replace('A rule fires', 'Read the file type first. A rule fires'),
  'sentence dropped': (text) => text.replace(' The catalog describes behaviours.', ''),
  'examples narrowed': (text) => text.replace('examples from a few ecosystems', 'the ecosystems that count'),
};

test('item b opens with its measured paragraph, word for word: a new wording of it has to be measured with a model again', () => {
  forEachEdition((raw, edition) => {
    const paragraph = itemBParagraph(itemB(gateStep(raw, edition), edition));
    assert.ok(isMeasuredOpening(paragraph), `${edition}: item b's opening paragraph is not the measured one: ${paragraph}`);
    for (const [name, mutate] of Object.entries(OPENING_MUTATIONS)) {
      const mutated = mutate(paragraph);
      assert.notEqual(mutated, paragraph, `${edition}: the "${name}" rewrite changes the paragraph`);
      assert.equal(isMeasuredOpening(mutated), false, `${edition}: the "${name}" rewrite is rejected: ${mutated}`);
    }
    const rewrapped = paragraph.replaceAll(', ', ',\n      ').replaceAll('. ', '.  ');
    assert.ok(isMeasuredOpening(rewrapped), `${edition}: the paragraph rewrapped is still the measured one`);
  });
});

// --- DAT101's two exclusions, each said on its own --------------------------

// DAT101 leaves out one record deleted by its key and emptying what is held in
// memory, and each of the two is negated in its own part of the row (cut at a
// semicolon and at a comma before "nor", "and", "but" or "while"), so a row
// that inverts one of them while the other keeps its negation is rejected.
const EXCLUDES = /\b(?:not|nor|never|neither)\b|n't\b/i;
function dat101ExcludesKeyAndMemory(behaviour) {
  const parts = behaviour
    .replace(/\s*\([^()]*\)$/, '')
    .split(/;|,(?=\s*(?:nor|and|but|while)\b)/)
    .map((part) => part.trim());
  const key = parts.some((part) => /\bkey\b/i.test(part) && !/\bmemory\b/i.test(part) && EXCLUDES.test(part));
  const memory = parts.some((part) => /\bmemory\b/i.test(part) && !/\bkey\b/i.test(part) && EXCLUDES.test(part));
  return key && memory;
}

const DAT101_MUTATIONS = {
  'key inverted': (text) => text.replace('by its key is not this', 'by its key is this'),
  'key is also this': (text) => text.replace('by its key is not this', 'by its key is also this'),
  'memory inverted': (text) => text.replace(', nor is emptying', ', and so is emptying'),
  'memory joined to the key': (text) => text.replace(', nor is emptying', ', as is emptying'),
  'memory dropped': (text) => text.replace(/, nor is emptying[^;(]*/, ''),
};
const DAT101_REWRITES = {
  'two sentences': (text) => text.replace(/, nor is emptying ([^;(]*?held in memory)/, '; emptying $1 is not this either'),
  neither: (text) => text.replace(', nor is emptying', ', and neither is emptying'),
};

// The DAT101 row as it was measured with a model, the sample of its check.
const DAT101_SAMPLE =
  'many stored records are deleted in one operation: every record of a table, collection or store, or all those a condition selects, by a query, an ORM call or a file command; one record deleted by its key is not this, nor is emptying a list, map or cache held in memory (`delete_all`, `destroy_all`, `removeAll`, `bulk_delete`, `purge`)';

test('the DAT101 exclusion check rejects a row that inverts either exclusion, and accepts faithful rewrites', () => {
  proveCheck(dat101ExcludesKeyAndMemory, DAT101_SAMPLE, DAT101_MUTATIONS, DAT101_REWRITES);
});

test('DAT101 says, each on its own, that one record deleted by its key and emptying what is held in memory are not this', () => {
  forEachEdition((raw, edition) => {
    const behaviour = ruleBehaviour(gateStep(raw, edition), 'DAT101', edition);
    assert.ok(dat101ExcludesKeyAndMemory(behaviour), `${edition}: DAT101 leaves out one record by its key and what is held in memory: ${behaviour}`);
  });
});

// --- DAT102's outputs -------------------------------------------------------

// DAT102 names every way the data goes out: a response, a log, an export and a
// notification, each one bare (a qualifier on one narrows it), with no "only",
// "except" or "unless" between "goes out" and the literal clause.
const OUTPUTS = ['response', 'log', 'export', 'notification'];
function dat102ListsEveryOutput(behaviour) {
  const prose = behaviour.replace(/`[^`]*`/g, 'CODE');
  const from = prose.search(/\bgoes out\b/i);
  if (from < 0) return false;
  const rest = prose.slice(from);
  const to = rest.search(/\bliteral\b|;/i);
  const span = to > 0 ? rest.slice(0, to) : rest;
  if (/\b(?:only|except|unless|but not)\b/i.test(span)) return false;
  const items = span
    .replace(/^goes out\s+\w+\s+/i, '')
    .split(/,|\bor\b|\band\b/)
    .map((item) => item.trim().replace(/^(?:in|to|through|by|as)\s+/i, '').replace(/^(?:an?|the)\s+/i, ''));
  return OUTPUTS.every((output) => items.includes(output));
}

const OUTPUT_MUTATIONS = {
  'export dropped': (text) => text.replace('a log, an export or a notification', 'a log or a notification'),
  'notification dropped': (text) => text.replace('an export or a notification', 'or an export'),
  'response and log only': (text) => text.replace('a response, a log, an export or a notification', 'a response or a log'),
  'notification qualified': (text) => text.replace('or a notification', 'or a notification sent to a third party'),
  'only in production': (text) => text.replace('goes out in a response', 'goes out only in a production response'),
};
const OUTPUT_REWRITES = {
  'list widened': (text) => text.replace(' or a notification', ', a notification or a message queue'),
  'reordered': (text) => text.replace('a response, a log, an export or a notification', 'a log, a response, a notification or an export'),
};

// The DAT102 row as it was measured with a model, the sample of its checks.
const DAT102_SAMPLE =
  "personal data (a national or tax identifier, a passport number, a payment card number) is exposed unmasked: it goes out in a response, a log, an export or a notification, or a person's value is written as a literal in code, configuration or a data file; a field, column or pattern that only names the data is not this (`ssn`, `cpf`, `cnpj`, `passport_number`, `credit_card`, `card_number`)";

test('the DAT102 output check rejects a narrowed list, and accepts a reordered or widened one', () => {
  proveCheck(dat102ListsEveryOutput, DAT102_SAMPLE, OUTPUT_MUTATIONS, OUTPUT_REWRITES);
});

test('DAT102 names every way the data goes out: a response, a log, an export and a notification', () => {
  forEachEdition((raw, edition) => {
    const behaviour = ruleBehaviour(gateStep(raw, edition), 'DAT102', edition);
    assert.ok(dat102ListsEveryOutput(behaviour), `${edition}: DAT102 names a response, a log, an export and a notification: ${behaviour}`);
  });
});
