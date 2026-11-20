// The Critical Gate describes behaviours, not languages. In each of the three
// audit editions, step 4 must not choose what to scan by a file's type, item b
// carries its three rules (every changed file is scanned, a word is not the
// behaviour, say what was scanned), the Security and Data domains list no
// language extension, the catalog keeps 38 rules in 6 domains, and the output
// format carries a `Scanned:` line and the one-finding-per-line note.
// Item b leaves out of the scan only what cannot hold a rule, and a file a tool
// generated is scanned. When step 1 ran over the code, the `No diff scanned`
// line is named in item b and takes the place of the `Scanned:` line, and the
// section does not say Clean, in item b and in the output note. Every finding
// example of the output format carries the severity its rule has in the
// catalog, and every rule keeps the id, severity and scope it had in v1.20.0.
// The assertions pin the contract, not the wording, so a rewrite of the
// technology domains keeps passing as long as it keeps the contract.
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

test('item b leaves out only what cannot hold a rule, and a generated file is scanned', () => {
  forEachEdition((raw, edition) => {
    const prose = sentences(itemBRule(itemB(gateStep(raw, edition), edition), 'Every changed file is scanned', edition));
    const leaveOut = prose.filter((sentence) => /\bleave out\b/i.test(sentence));
    assert.ok(leaveOut.length > 0, `${edition}: item b says what is left out of the scan`);
    for (const sentence of leaveOut) {
      assert.doesNotMatch(sentence, /generated|vendored|third[- ]party/i, `${edition}: a generated or third-party file is left out: ${sentence}`);
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
