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

// A negation that reaches the word Clean in the same clause. The name of the
// No diff scanned line is taken out first, so its own "No" does not count.
const NO_CLEAN = /\b(no|not|never|nor|without)\b[^;]*\bClean\b/i;

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
// literal negated.
const DAT102_MUTATIONS = {
  'branch line': (text) => text.replace(/ is exposed unmasked: .*? is not this: /, ' goes out unmasked in a response, a log, an export or a notification: '),
  'no literal': (text) => text.replace(/, or [^;]*\bliteral\b[^;]*/, ''),
  'no naming exclusion': (text) => text.replace(/; [^;:]*\bonly names\b[^:]*:/, ':'),
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
