// Behavior probes from the independent audit of part 2b-2 of the language-agnostic work: the
// Database, Infrastructure, Kubernetes and Config domains of the Critical Gate catalog describe
// behaviours in the three editions of the audit. Behavior only, pinned by content and by meaning,
// never by line number or by the whole wording of a row. Each check first proves its force on a
// sample (mutations rejected, faithful rewrites accepted), then runs on the three editions. Each
// edition case states, as comments, the contract it protects, the plausible regression that breaks
// it, and why the implementer's tests did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractOutputFormat, extractStep } from '../fixtures/gate-languages/gate-prompt.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};
const editions = () =>
  Object.entries(EDITIONS).map(([edition, path]) => {
    const step = extractStep(readFileSync(join(ROOT, path), 'utf8'));
    assert.ok(step, `${edition}: the Critical Gate step`);
    return [edition, step];
  });

// The whole behaviour cell of a rule, parentheses included.
function cell(step, id) {
  const row = step.find((line) => line.trim().startsWith(`| ${id} |`));
  assert.ok(row, `${id} is in the catalog`);
  return row.trim().slice(1, -1).split('|')[3].trim();
}

// The text after the dash of a domain line (`_Name_ — where: ...`).
function where(step, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = step.find((entry) => new RegExp(`^\\s+_${escaped}_\\s+—`).test(entry));
  assert.ok(line, `domain ${name} is in the catalog`);
  return line.slice(line.indexOf('—') + 1).trim();
}

// A check proves its force on a sample: the sample passes, each mutation changes it and is
// rejected, each faithful rewrite changes it and is accepted.
function proveCheck(check, sample, mutations, rewrites) {
  assert.ok(check(sample), `the sample passes: ${sample}`);
  for (const [name, mutate] of Object.entries(mutations)) {
    const mutated = mutate(sample);
    assert.notEqual(mutated, sample, `"${name}" changes the sample`);
    assert.equal(check(mutated), false, `"${name}" is rejected: ${mutated}`);
  }
  for (const [name, rewrite] of Object.entries(rewrites)) {
    const rewritten = rewrite(sample);
    assert.notEqual(rewritten, sample, `"${name}" changes the sample`);
    assert.ok(check(rewritten), `"${name}" is accepted: ${rewritten}`);
  }
}

// --- each technology row keeps the v1.20.0 trigger among its examples -------------------------

// What the v1.20.0 catalog wrote as the trigger of each of the 25 technology rules, cut into the
// terms a row must still carry (a string is matched in any case; a RegExp as written). `iam_user`
// of IAC103 is left out: the row names "a user" in its prose instead.
const TRIGGERS_1_20 = {
  DS101: ['DROP DATABASE'],
  DS102: ['DROP TABLE'],
  DS103: ['TRUNCATE'],
  DS104: ['DROP COLUMN'],
  DS105: ['ALTER TABLE … DROP'],
  DS106: ['DELETE FROM <table>', 'WHERE'],
  DS108: ['RENAME TABLE', 'ALTER TABLE … RENAME'],
  DS110: ['ALTER TABLE … MODIFY'],
  IAC101: ['force_destroy = true'],
  IAC102: ['prevent_destroy = false'],
  IAC103: ['iam_policy', 'iam_role', 'aws_iam'],
  IAC104: ['security group', 'firewall rule', 'network ACL'],
  IAC105: ['0.0.0.0/0'],
  IAC106: ['publicly_accessible', 'public_access = true'],
  K8S101: ['privileged: true'],
  K8S102: ['hostPath:'],
  K8S103: ['runAsUser: 0'],
  K8S104: ['runAsNonRoot: false'],
  K8S105: ['SYS_ADMIN', 'NET_ADMIN', /\bALL\b/],
  K8S106: ['hostNetwork: true'],
  CFG101: ['Access-Control-Allow-Origin: *'],
  CFG102: ['debug = true'],
  CFG103: [/\bdebug\b/i, /\btrace\b/i],
  CFG104: ['22', '3389', '5432', '3306', '6379', '27017', '9200', '11211'].map((port) => new RegExp(`\\b${port}\\b`)),
  CFG105: [/\btimeouts?\b/i],
};
const carries = (text, term) => (term instanceof RegExp ? term.test(text) : text.toLowerCase().includes(term.toLowerCase()));
const missingTriggers = (id, behaviour) => TRIGGERS_1_20[id].filter((term) => !carries(behaviour, term)).map(String);

test('probe: the v1.20.0 trigger check finds a dropped term and accepts the term in another place of the row', () => {
  const sample = 'a table is dropped, by SQL or by a migration call (`DROP TABLE`, `drop_table`, `migrations.DeleteModel`, `dropTable`)';
  assert.deepEqual(missingTriggers('DS102', sample), []);
  assert.deepEqual(missingTriggers('DS102', sample.replace('`DROP TABLE`, ', '')), ['DROP TABLE']);
  assert.deepEqual(missingTriggers('DS102', 'a table is dropped (`drop table`, `drop_table`)'), []);
  const ports = 'a sensitive port is exposed: remote access or a database, cache or search port (22, 3389, 5432, 3306, 6379, 27017, 9200, 11211)';
  assert.deepEqual(missingTriggers('CFG104', ports), []);
  assert.deepEqual(missingTriggers('CFG104', ports.replace('22, ', '')), ['/\\b22\\b/']);
  assert.deepEqual(missingTriggers('K8S105', 'a dangerous capability (`SYS_ADMIN`, `NET_ADMIN`, under `cap_add`); dropping all is not this'), ['/\\bALL\\b/']);
});

// Contract: each of the 25 technology rows describes the behaviour with the v1.20.0 trigger kept
// among its examples (spec, part 2b-2, what the text changes, item 1: "with the 1.20.0 word among
// the examples of more than one tool"), so every line the v1.20.0 caught by its word is still
// named by the row, in each of the three editions.
// Breaks when: a rewrite of a row drops the v1.20.0 term while describing the behaviour in other
// words (DS102 without `DROP TABLE`, K8S103 without `runAsUser: 0`): the narrowing class that made
// DAT101 stop firing on a filtered mass delete in the 2a text (28 of 36 calls in v1.20.0, 0 of 36).
// Both survived a mutation of the three editions.
// Missed by the implementer's tests because: the domain case checks the table header, the "where"
// line and that a cell does not open with a code mark; nothing reads the examples of a row.
test('probe: every technology row keeps its v1.20.0 trigger among its examples, in the three editions', () => {
  for (const [edition, step] of editions()) {
    for (const id of Object.keys(TRIGGERS_1_20)) {
      const behaviour = cell(step, id);
      assert.deepEqual(missingTriggers(id, behaviour), [], `${edition}: ${id} no longer names its v1.20.0 trigger: ${behaviour}`);
    }
  }
});

// --- each technology "where" says another tool counts ------------------------------------------

// A "where" that says, as an inclusion, that another tool, framework, format or platform counts:
// "in any tool", "of any framework", "or any other platform", or "<another/other/any> ... counts";
// and has no clause that sets something apart.
const IN_ANY = /\b(?:in|of|or)\s+any\s+(?:other\s+)?(?:[\w-]+\s+)?(?:tools?|frameworks?|formats?|platforms?)\b/i;
const ANOTHER_COUNTS = /\b(?:another|other|any)\b[^;,]*\b(?:tools?|frameworks?|formats?|platforms?)\s+counts?\b/i;
const SETS_APART = /\b(?:only|never|not|no|nor|except|unless|but|ignored?|skipped?|excluded?|out of scope)\b|n't\b/i;
const whereSaysAnotherToolCounts = (text) => (IN_ANY.test(text) || ANOTHER_COUNTS.test(text)) && !SETS_APART.test(text);

const WHERE_SAMPLE = 'where: Kubernetes manifests and the templates that produce them; the same setting in another container platform counts';
test('probe: the "where" check rejects another tool named only to be set apart, and accepts an inclusion in other words', () => {
  proveCheck(
    whereSaysAnotherToolCounts,
    WHERE_SAMPLE,
    {
      ignored: (text) => text.replace('platform counts', 'platform is ignored'),
      skipped: (text) => text.replace('platform counts', 'platform is skipped'),
      'out of scope': (text) => text.replace('platform counts', 'platform is out of scope'),
      'does not count': (text) => text.replace('platform counts', 'platform does not count'),
      'clause gone': (text) => text.replace('; the same setting in another container platform counts', ''),
      'except one': (text) => text.replace('platform counts', 'platform counts, except Compose'),
    },
    {
      'any other': (text) => text.replace('; the same setting in another container platform counts', ', or any other container platform'),
      'counts too': (text) => text.replace('the same setting in another container platform counts', 'a setting in any other container platform counts too'),
    },
  );
  assert.equal(whereSaysAnotherToolCounts('where: infrastructure declarations in Terraform; CloudFormation and Pulumi shown, the same setting in another tool is skipped'), false);
  assert.equal(whereSaysAnotherToolCounts('where: configuration in any format, Dockerfiles, server configuration and configuration set in code'), true);
});

// Contract: the "where" line of each of the four technology domains says, as an inclusion, that
// the same setting in another tool, framework, format or platform counts, and sets nothing apart
// (spec, part 2b-2, test 1: "the where line of each one says another tool counts"), in each of the
// three editions.
// Breaks when: a rewrite keeps the words "another tool" but sets it apart ("the same setting in
// another container platform is ignored", "in Terraform; ... another tool is skipped"); both
// survived a mutation of the three editions.
// Missed by the implementer's tests because: their domain case asks only that "any/another/other"
// sits next to "tool/framework/format/platform" somewhere in the line, and rejects only "only",
// "never", "not", "except" and "unless".
test('probe: each technology "where" says another tool counts, as an inclusion, in the three editions', () => {
  for (const [edition, step] of editions()) {
    for (const name of ['Database', 'Infrastructure (IaC)', 'Kubernetes', 'Config']) {
      const text = where(step, name);
      assert.ok(whereSaysAnotherToolCounts(text), `${edition}: the ${name} "where" does not say another tool counts: ${text}`);
    }
  }
});

// --- DS106 sends to DAT101 alone only a DELETE whose condition selects many rows ----------------

// The clauses of the DS106 row that are about a DELETE with a condition and send it to DAT101
// ("with no condition" and "no WHERE" describe the DS106 line itself and are not a condition), and
// whether each of them says the condition selects many rows.
const MANY = /\b(?:many|several|multiple|more than one|a (?:set|batch|range) of|all)\b/i;
function ds106SendsOnlyManyRowsToDat101(behaviour) {
  const prose = behaviour.replace(/`([^`]*)`/g, '$1').replace(/\b(?:with|has|having)\s+no\s+(?:condition|where|filter)\b/gi, '');
  const clauses = prose.split(/;|,\s*(?=(?:and|but)\b)/).map((clause) => clause.trim());
  const conditioned = clauses.filter((clause) => /\bDAT101\b/.test(clause) && /\b(?:condition|where|filter\w*)\b/i.test(clause));
  return conditioned.length > 0 && conditioned.every((clause) => MANY.test(clause));
}

const DS106_SAMPLE =
  'every row of a table is deleted by a `DELETE` with no condition (`DELETE FROM <table>` with no `WHERE`); the same line is also DAT101, and a `DELETE` whose condition selects many rows is DAT101 alone';
test('probe: the DS106 check rejects a condition that sends any DELETE to DAT101, and accepts the same rule in other words', () => {
  proveCheck(
    ds106SendsOnlyManyRowsToDat101,
    DS106_SAMPLE,
    {
      'many dropped': (text) => text.replace('selects many rows', 'selects rows'),
      'one or more': (text) => text.replace('selects many rows', 'selects one or more rows'),
      'any condition': (text) => text.replace('a `DELETE` whose condition selects many rows', 'a `DELETE` with any condition'),
      'clause dropped': (text) => text.replace(/, and a `DELETE` whose condition[^;]*$/, ''),
    },
    {
      'more than one': (text) => text.replace('selects many rows', 'selects more than one row'),
      'fires, not DS106': (text) => text.replace(/; the same line .*$/, '; that line also fires DAT101; a `DELETE` with a condition that selects many rows fires DAT101 and not DS106'),
    },
  );
});

// Contract: in the three editions, DS106 sends to DAT101 alone only a `DELETE` whose condition
// selects many rows (spec, part 2b-2, test 2: "the condition that selects many rows is DAT101
// alone"), in line with DAT101, which says one record deleted by its key is not this.
// Breaks when: "many" falls out of the clause ("a `DELETE` whose condition selects rows is DAT101
// alone"), and a `DELETE ... WHERE id = $1`, a control of the fixture, becomes a CRITICAL DAT101
// against DAT101's own exclusion; this survived a mutation of the three editions.
// Missed by the implementer's tests because: their DS106 check asks that the conditioned clause say
// DAT101 "alone" or "only" and not DS106, and never reads how many rows the condition selects.
test('probe: DS106 sends to DAT101 alone only a DELETE whose condition selects many rows, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const behaviour = cell(step, 'DS106');
    assert.ok(ds106SendsOnlyManyRowsToDat101(behaviour), `${edition}: DS106 sends a DELETE with a condition to DAT101 without saying it selects many rows: ${behaviour}`);
  }
});

// --- the two container exclusions: a bind mount of a project folder, and a dropped capability ---

// K8S102: every hostPath volume, and outside Kubernetes a bind mount only of a system path of the
// host (named as such, or listed as /etc and /proc), never any bind mount or any host path.
function k8s102KeepsBindMountsToSystemPaths(behaviour) {
  const clauses = behaviour.split(/;|,\s*or\b/).map((clause) => clause.trim());
  const hostPath = clauses.some((clause) => /hostPath/.test(clause) && !/\b(?:not|never|nor|no)\b|n't\b/i.test(clause));
  const binds = clauses.filter((clause) => /\bbind[- ]mounts?\b/i.test(clause));
  const systemOnly = binds.every(
    (clause) =>
      (/\bsystem\b/i.test(clause) || (/\/etc\b/.test(clause) && /\/proc\b/.test(clause))) &&
      !/\bany\s+(?:bind[- ]mount|host\s+(?:path|folder|directory)|path|folder|directory)\b/i.test(clause),
  );
  return hostPath && systemOnly;
}

// K8S105: a clause says that dropping a capability is not this.
const k8s105LeavesOutADrop = (behaviour) =>
  behaviour.split(';').some((clause) => /\bdrop\w*\b[^;]*\bcapabilit/i.test(clause) && /\b(?:not|never|nor)\b|n't\b/i.test(clause));

const K8S102_SAMPLE =
  "a container mounts the disk of the node or host it runs on: any `hostPath:` volume, or a bind mount of a system path of the host such as the root, `/etc`, `/proc` or the container runtime's socket";
const K8S105_SAMPLE =
  'a container is given a dangerous capability (`SYS_ADMIN`, `NET_ADMIN`, `ALL`, under `capabilities: add`, `cap_add` or `--cap-add`); dropping a capability is not this';
test('probe: the container checks reject a bind mount of any host path and a dropped exclusion, and accept the same rules in other words', () => {
  proveCheck(
    k8s102KeepsBindMountsToSystemPaths,
    K8S102_SAMPLE,
    {
      'any bind mount': (text) => text.replace(/a bind mount of a system path[^;]*$/, 'any bind mount of a host folder'),
      'any host path with examples': (text) => text.replace('a bind mount of a system path of the host such as', 'a bind mount of any host path, such as'),
      'hostPath dropped': (text) => text.replace('any `hostPath:` volume, or ', ''),
    },
    {
      'listed paths': (text) => text.replace('a bind mount of a system path of the host such as the root,', 'a bind mount of the host root,'),
      'system directory': (text) => text.replace('a system path of the host', 'a system directory of the host'),
    },
  );
  proveCheck(
    k8s105LeavesOutADrop,
    K8S105_SAMPLE,
    {
      'exclusion gone': (text) => text.replace('; dropping a capability is not this', ''),
      'exclusion inverted': (text) => text.replace('dropping a capability is not this', 'dropping a capability is this too'),
    },
    {
      'never this': (text) => text.replace('dropping a capability is not this', 'a dropped capability is never this'),
      'isn\'t': (text) => text.replace('is not this', "isn't this"),
    },
  );
});

// Contract: outside Kubernetes, K8S102 fires on a bind mount of a system path of the host only, and
// K8S105 says that dropping a capability is not this, in each of the three editions: the two
// exclusions that keep common, legitimate container lines (a project folder bind-mounted in a
// `docker-compose.yml`, `cap_drop: [ALL]`) from firing a HIGH or a WARNING now that the domain says
// another container platform counts, while every `hostPath:` volume still fires as in v1.20.0.
// Breaks when: K8S102 is widened to "any bind mount of a host folder", or the K8S105 exclusion
// falls out; both survived a mutation of the three editions.
// Missed by the implementer's tests because: none of their cases reads the K8S102 or the K8S105 row.
test('probe: K8S102 fires on a bind mount of a system path only and K8S105 leaves out a dropped capability, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const k8s102 = cell(step, 'K8S102');
    assert.ok(k8s102KeepsBindMountsToSystemPaths(k8s102), `${edition}: K8S102 fires on a bind mount other than of a system path, or lost hostPath: ${k8s102}`);
    const k8s105 = cell(step, 'K8S105');
    assert.ok(k8s105LeavesOutADrop(k8s105), `${edition}: K8S105 no longer says that dropping a capability is not this: ${k8s105}`);
  }
});

// --- the catalog header: a line you cannot tell about fires -----------------------------------

// The header of the catalog, from "**Rules Catalog" to the first blank line, and whether its
// clause on a doubtful line says the line fires, with no negation.
function catalogHeader(step) {
  const from = step.findIndex((line) => /\*\*Rules Catalog\b/.test(line));
  assert.ok(from >= 0, 'the catalog header');
  const to = step.findIndex((line, i) => i > from && line.trim() === '');
  return step.slice(from, to > from ? to : step.length).join(' ').replace(/\s+/g, ' ');
}
function headerFiresInDoubt(header) {
  const doubt = header.split(/[.;]/).filter((clause) => /\b(?:cannot tell|cannot place|in doubt|unsure)\b/i.test(clause));
  return doubt.length > 0 && doubt.every((clause) => /\bfires?\b/i.test(clause) && !/\b(?:not|never|no|nor)\b|n't\b/i.test(clause));
}

const HEADER_SAMPLE =
  '**Rules Catalog (~40 rules, 6 domains).** Each rule is a behaviour. A domain\'s "where" says where that behaviour usually lives, as a guide and never as a filter. Item b says when a rule fires: on what a line does, in any language, and not on a mention; when you cannot tell, the line fires.';
test('probe: the header check rejects a doubtful line that does not fire, and accepts the earlier wording', () => {
  proveCheck(
    headerFiresInDoubt,
    HEADER_SAMPLE,
    {
      'does not fire': (text) => text.replace('the line fires.', 'the line does not fire.'),
      skipped: (text) => text.replace('the line fires.', 'skip the line.'),
      'clause gone': (text) => text.replace('; when you cannot tell, the line fires.', '.'),
    },
    {
      'earlier wording': (text) => text.replace('when you cannot tell, the line fires.', 'a line you cannot place fires.'),
      'in doubt': (text) => text.replace('when you cannot tell, the line fires.', 'in doubt, the line fires.'),
    },
  );
});

// Contract: the catalog header, which the hotfix skills apply by reference without item b, says
// that a line you cannot tell about fires (spec, part 2b-2, what the text changes, item 3, R3 of
// the 2a reaudit 2), in each of the three editions.
// Breaks when: the clause turns ("when you cannot tell, the line does not fire.") or falls out;
// the turned clause survived a mutation of the three editions.
// Missed by the implementer's tests because: the doubt rule is held only in item b (by an earlier
// probe); no case reads the catalog header.
test('probe: the catalog header says a line you cannot tell about fires, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const header = catalogHeader(step);
    assert.ok(headerFiresInDoubt(header), `${edition}: the catalog header does not say a doubtful line fires: ${header}`);
  }
});

// --- with no diff, "Clean" is negated in its own predicate --------------------------------------

// Whether every "Clean" in a piece of prose is negated: a "no", "not", "never", "nor" or "without"
// at most three words before it in the same phrase, not itself a condition ("with no finding"); or
// a "not" or "never" that is Clean's own predicate right after it ("Clean" is not written, "Clean"
// does not follow, a "Clean" line never follows), and not a negation of something else that comes
// after it ("Clean" but not a finding line). Code spans are folded first.
function cleanNegatedInItsPredicate(text) {
  const prose = text.replace(/`[^`]*`/g, 'CODE');
  const found = [...prose.matchAll(/"?\bClean\b"?/g)];
  if (found.length === 0) return false;
  return found.every((match) => {
    const before = prose.slice(0, match.index).split(/[,:;.]/).at(-1).trim().split(/\s+/).filter(Boolean);
    const window = before.slice(-4);
    const at = window.findLastIndex((word) => /^(?:no|not|never|nor|without)$/i.test(word));
    const negatedBefore = at >= 0 && !/^with$/i.test(at > 0 ? window[at - 1] : before[before.length - window.length - 1] ?? '');
    const after = prose.slice(match.index + match[0].length);
    const negatedAfter = /^\s*(?:line\s+)?(?:is|was|does|will|shall)?\s*(?:not|never)\b/i.test(after);
    return negatedBefore || negatedAfter;
  });
}

test('probe: the strict Clean check rejects Clean followed by a negation of something else, and accepts Clean negated in its predicate', () => {
  for (const sample of [
    'the CODE line stands in place of the CODE line, and the section says "Clean" but not a finding line: nothing was scanned.',
    'the CODE line stands in place of the CODE line, and the section says "Clean" and never a finding line.',
    'the CODE line stands in place of the CODE line, and the section says "Clean" after it.',
    'stands in place of the `Scanned:` line, and with no finding the section says "Clean"',
  ]) {
    assert.equal(cleanNegatedInItsPredicate(sample), false, sample);
  }
  for (const sample of [
    'the `No diff scanned` line stands in place of the `Scanned:` line, and the section does not say "Clean": nothing was scanned.',
    'stands in place of the `Scanned:` line, and "Clean" is not written: nothing was scanned.',
    'stands in place of the `Scanned:` line, and "Clean" is never written: nothing was scanned.',
    ' — <why>." takes the place of the `Scanned:` line and no finding or "Clean" line follows: nothing was scanned)',
    ' — <why>." takes the place of the `Scanned:` line, and a "Clean" line never follows: nothing was scanned)',
  ]) {
    assert.equal(cleanNegatedInItsPredicate(sample), true, sample);
  }
});

// Contract: when step 1 ran over the code, the Critical Gate section writes no "Clean" after the
// `No diff scanned` line, and item b's sentence on that line and the output note's clause after it
// negate "Clean" itself, in each of the three editions (a measured defect of the 2a text: "Clean"
// after `No diff scanned` in 6 calls of 6, Sonnet and Opus).
// Breaks when: item b says 'the section says "Clean" but not a finding line' (Clean written, the
// negation on something else); this survived a mutation of the three editions against the
// implementer's case and the earlier audit probe on the same contract, and the implementer's case
// as it was before this part rejected it.
// Missed by the implementer's tests because: the pattern this part gave their case (to accept
// '"Clean" is not written') takes any "not" or "never" up to two words after "Clean" as its
// negation, whatever it negates; the earlier probe reads the three words after it the same way.
test('probe: with no diff, item b and the output note negate Clean in its own predicate, in the three editions', () => {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const raw = readFileSync(join(ROOT, path), 'utf8');
    const step = extractStep(raw);
    const from = step.findIndex((line) => line.includes('**Say what was scanned.**'));
    const to = step.findIndex((line, i) => i > from && /^\s+c\.\s/.test(line));
    assert.ok(from >= 0 && to > from, `${edition}: item b's "Say what was scanned"`);
    const said = step.slice(from, to).join(' ').replace(/\s+/g, ' ').split(/(?<=\.)\s+/).filter((sentence) => sentence.includes('No diff scanned'));
    assert.ok(said.length > 0, `${edition}: item b has a sentence on the No diff scanned line`);
    for (const sentence of said) {
      assert.ok(cleanNegatedInItsPredicate(sentence), `${edition}: item b lets "Clean" be written with no diff: ${sentence}`);
    }
    const note = extractOutputFormat(raw).find((line) => line.startsWith('(') && line.includes('No diff scanned'));
    assert.ok(note, `${edition}: the output format has the note with the No diff scanned line`);
    const clause = note.slice(note.indexOf('No diff scanned') + 'No diff scanned'.length).split(';')[0];
    assert.ok(cleanNegatedInItsPredicate(clause), `${edition}: the output note lets "Clean" follow No diff scanned: ${clause}`);
  }
});

// --- reaudit 1: the two exclusions the fix measured (CFG104 firewall rule, K8S103 Dockerfile) ---

// CFG104: the places list still names a port mapping, an `EXPOSE` and a service with no address
// condition; the "any address" condition sits on the firewall rule only; and every clause that sets
// a private range or another group apart speaks of a rule, never of a port, a mapping, an `EXPOSE`
// or a service.
const ANY_ADDRESS = /\b(?:any|every) (?:address|source|IP)\b|\banywhere\b|0\.0\.0\.0\/0|\bthe (?:whole )?internet\b/i;
const NEGATED = /\b(?:not|never|nor)\b|n't\b/i;
function cfg104NarrowsTheFirewallRuleOnly(behaviour) {
  const [places, ...rest] = behaviour.split(';');
  const mapping = places.search(/\bport mappings?\b/i);
  const firewall = places.search(/\bfirewall\b/i);
  const any = places.search(ANY_ADDRESS);
  const placesOk =
    mapping >= 0 && /`?EXPOSE`?/.test(places) && /\bservices?\b/i.test(places) && firewall >= 0 && any > firewall && !ANY_ADDRESS.test(places.slice(0, mapping));
  const apart = rest.filter((clause) => NEGATED.test(clause) && /\bprivate\b/i.test(clause));
  const apartOk =
    apart.length > 0 &&
    apart.every((clause) => /\bgroups?\b/i.test(clause) && /\brules?\b/i.test(clause) && !/\b(?:port mappings?|mappings?|services?|EXPOSE|ports?)\b/i.test(clause));
  return placesOk && apartOk;
}

// K8S103: a clause on the Dockerfile says the last `USER` (of the final stage) is the one that
// counts, and a clause on the Dockerfile sets apart, with a negation, only a switch to root that a
// later `USER` takes back; no Dockerfile clause sets a `USER root` apart without that.
function k8s103KeepsTheLastDockerfileUser(behaviour) {
  const docker = behaviour.split(';').filter((clause) => /\bDockerfiles?\b/.test(clause));
  const last = docker.some((clause) => /\blast\b[^;]*`?USER`?/.test(clause));
  const back = docker.filter((clause) => NEGATED.test(clause));
  return last && back.length > 0 && back.every((clause) => /\b(?:back|later|switch\w*|another)\b/i.test(clause) && /\blast\b|\bback\b|\blater\b/i.test(clause));
}

const CFG104_SAMPLE =
  'a sensitive port is exposed or published, in a port mapping, an `EXPOSE`, a service, or a firewall rule that opens it to any address: remote access or a database, cache or search port (22, 3389, 5432, 3306, 6379, 27017, 9200, 11211); a rule that admits only a private range or another group is not this';
const K8S103_SAMPLE =
  'a container runs as the root user (`runAsUser: 0`, `user: "0"`, `user: root`); in a Dockerfile only the last `USER` of the final stage counts, so switching to root for a build step and back is not this';
test('probe: the CFG104 and K8S103 checks reject a narrowed or dropped exclusion, and accept the same rules in other words', () => {
  proveCheck(
    cfg104NarrowsTheFirewallRuleOnly,
    CFG104_SAMPLE,
    {
      'exclusion gone': (text) => text.replace('; a rule that admits only a private range or another group is not this', ''),
      'any port set apart': (text) => text.replace('a rule that admits only', 'a port that admits only'),
      'mapping set apart': (text) => text.replace('a rule that admits only', 'a port mapping, a service or a rule that admits only'),
      'any address on every place': (text) =>
        text.replace('is exposed or published, in a port mapping, an `EXPOSE`, a service, or a firewall rule that opens it to any address:', 'is exposed or published to any address, in a port mapping, an `EXPOSE`, a service, or a firewall rule:'),
      'firewall condition gone': (text) => text.replace(' that opens it to any address:', ':'),
      'EXPOSE gone': (text) => text.replace(' an `EXPOSE`,', ''),
    },
    {
      'audit wording': (text) => text.replace('a rule that admits only a private range or another group is not this', 'a firewall rule that lets it in only from a private range or another security group is not this'),
      'open to 0.0.0.0/0': (text) => text.replace('a firewall rule that opens it to any address:', 'a firewall rule open to any address (`0.0.0.0/0`):'),
    },
  );
  proveCheck(
    k8s103KeepsTheLastDockerfileUser,
    K8S103_SAMPLE,
    {
      'clause gone': (text) => text.replace(/; in a Dockerfile.*$/, ''),
      'every Dockerfile root set apart': (text) => text.replace(/; in a Dockerfile.*$/, '; a `USER root` in a Dockerfile is not this'),
      'first USER': (text) => text.replace('only the last `USER`', 'only the first `USER`'),
      'switch back counts': (text) => text.replace('and back is not this', 'and back is this too'),
    },
    {
      'counts only when last': (text) =>
        text.replace(/; in a Dockerfile.*$/, '; in a Dockerfile a `USER root` counts only when it is the last `USER` of the final stage, and a build step run as root before switching back is not this'),
      'colon form': (text) => text.replace(/; in a Dockerfile.*$/, '; a Dockerfile counts by its last `USER` in the final stage: switching to root for a build step and back is not this'),
    },
  );
});

// Contract: CFG104 keeps firing on a sensitive port in a port mapping, an `EXPOSE` or a service, and
// on a firewall rule that opens it to any address, and sets apart only a firewall rule that admits a
// private range or another group (T1 of the 2b-2 audit, measured by the orchestrator on 24/11: the
// two group rules 0 of 6 with the fix, as in v1.20.0, and the `5432:5432` control 6 of 6), in the
// three editions.
// Breaks when: the exclusion falls out (the measured regression, 6 of 6 and 4 of 6), or is widened
// from the rule to the port, the mapping or the service, or the "any address" condition moves onto
// every place, which drops `EXPOSE 5432` (a planted case of the gate-tech fixture) and a mapping
// bound to a private host; each survives the implementer's tests and the earlier audit probes.
// Missed by the implementer's tests because: none of their cases reads the CFG104 row, and the
// earlier probe of the v1.20.0 trigger only checks that the eight ports are named.
test('probe: CFG104 sets apart only a firewall rule that admits a private range or another group, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const behaviour = cell(step, 'CFG104');
    assert.ok(cfg104NarrowsTheFirewallRuleOnly(behaviour), `${edition}: CFG104 lost a place, or sets apart more than a private firewall rule: ${behaviour}`);
  }
});

// Contract: K8S103 fires on a Dockerfile whose last `USER` of the final stage is root, and sets apart
// only a switch to root for a build step that a later `USER` takes back (T2 of the 2b-2 audit,
// measured on 24/11: the build step 0 of 6 with the fix, 1 of 6 before), in the three editions.
// Breaks when: the Dockerfile clause falls out (the measured false positive comes back), or becomes
// "a `USER root` in a Dockerfile is not this", or names the first `USER`: a Dockerfile that ends
// in `USER root` would no longer fire; each survives the implementer's tests and the earlier audit
// probes.
// Missed by the implementer's tests because: none of their cases reads the K8S103 row past its
// examples, and the earlier probe of the v1.20.0 trigger only checks `runAsUser: 0`.
test('probe: K8S103 counts the last USER of a Dockerfile and sets apart only a switch back, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const behaviour = cell(step, 'K8S103');
    assert.ok(k8s103KeepsTheLastDockerfileUser(behaviour), `${edition}: K8S103 no longer counts the last USER of a Dockerfile, or sets apart more than a switch back: ${behaviour}`);
  }
});
