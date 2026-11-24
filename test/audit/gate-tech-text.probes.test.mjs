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
// terms a row must still carry (a string is matched in any case; a RegExp as written): every
// example the v1.20.0 row wrote, in the four domains. `destroy = true` of IAC101 is its own
// example, apart from `force_destroy = true`, which holds it as a part of a longer word.
const TRIGGERS_1_20 = {
  DS101: ['DROP DATABASE'],
  DS102: ['DROP TABLE'],
  DS103: ['TRUNCATE', 'TRUNCATE TABLE'],
  DS104: ['DROP COLUMN'],
  DS105: ['ALTER TABLE … DROP'],
  DS106: ['DELETE FROM <table>', 'WHERE'],
  DS108: ['RENAME TABLE', 'ALTER TABLE … RENAME'],
  DS110: ['ALTER TABLE … MODIFY'],
  IAC101: ['force_destroy = true', /(?<![\w])destroy = true\b/],
  IAC102: ['prevent_destroy = false'],
  IAC103: ['iam_policy', 'iam_role', 'iam_user', 'aws_iam'],
  IAC104: ['security group', 'firewall rule', 'network ACL'],
  IAC105: ['cidr_blocks = ["0.0.0.0/0"]'],
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
  // `destroy = true` inside `force_destroy = true` is not the standalone v1.20.0 example.
  const destroy = 'a resource is destroyed with its data (`force_destroy = true`, `destroy = true`, `forceDestroy: true`)';
  assert.deepEqual(missingTriggers('IAC101', destroy), []);
  assert.deepEqual(missingTriggers('IAC101', destroy.replace('`destroy = true`, ', '')), ['/(?<![\\w])destroy = true\\b/']);
  const iam = 'a role, a policy or a user changes (`aws_iam_role`, `iam_policy`, `iam_user`)';
  assert.deepEqual(missingTriggers('IAC103', iam), []);
  assert.deepEqual(missingTriggers('IAC103', iam.replace(', `iam_user`', '')), ['iam_user']);
});

// Contract: each of the 25 technology rows describes the behaviour with the v1.20.0 trigger kept
// among its examples (spec, part 2b-2, what the text changes, item 1: "with the 1.20.0 word among
// the examples of more than one tool"), so every line the v1.20.0 caught by its word is still
// named by the row, in each of the three editions.
// Breaks when: a rewrite of a row drops the v1.20.0 term while describing the behaviour in other
// words (DS102 without `DROP TABLE`, K8S103 without `runAsUser: 0`): the narrowing class that made
// DAT101 stop firing on a filtered mass delete in the 2a text (28 of 36 calls in v1.20.0, 0 of 36).
// Both survived a mutation of the three editions. The earlier list of this probe left out two
// v1.20.0 examples, and the 2b-2 text had already dropped both (`destroy = true` of IAC101 and
// `iam_user` of IAC103, review 1 of PR 69): the list now holds every example of the four domains.
// Missed by the implementer's tests because: the domain case checks the table header, the "where"
// line and that a cell does not open with a code mark; nothing reads the examples of a row.
// Made stronger by the fact in fix 3 of part 2b (written authorization in the briefing).
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

// The one thing a technology "where" may set apart, measured in the second fix round of part 2b-2
// (a `Base.metadata.drop_all(engine)` in the teardown of a `conftest.py` went from DS102 in 6 of 6
// to 0 of 6): a sentence of its own, in the Database "where", that says the tables of a test
// database, created or dropped in a test's setup or teardown, are not the domain's behaviour. The
// sentence names no database but a test database, and no tool, framework, format, platform,
// migration, SQL, file, code, script or other place, and says neither "only", "except", "unless",
// "but", "nor" nor "never"; so it cannot carry a narrowing by the tool or a wider exclusion.
const OTHER_PLACE =
  /\b(?:tools?|frameworks?|formats?|platforms?|migrations?|SQL|files?|code|scripts?|seeds?|jobs?|production|staging|any|every|all|other|another|anywhere|elsewhere|whatever)\b/i;
function setsApartTestDatabaseTablesOnly(sentence) {
  const rest = sentence.replace(/\btest databases?\b/gi, 'TESTDB');
  return (
    /\bTESTDB\b/.test(rest) &&
    !/\bdatabases?\b/i.test(rest) &&
    /\btables?\b/i.test(rest) &&
    /\btest(?:'s|s)?\b/i.test(rest) &&
    /\b(?:setup|set-up|teardown|tear-down)\b/i.test(rest) &&
    /\b(?:is not|are not|does not count|do not count)\b|\b(?:isn't|aren't)/i.test(rest) &&
    !OTHER_PLACE.test(rest) &&
    !/\b(?:only|except|unless|but|nor|never)\b/i.test(rest)
  );
}
// The Database "where" with that one sentence left out, when it stands as a sentence of its own;
// joined to the inclusion by a semicolon or a comma it stays, and its "not" is a narrowing.
const withoutTestDatabaseSentence = (text) =>
  text
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !setsApartTestDatabaseTablesOnly(sentence))
    .join(' ');
const databaseWhereSaysAnotherToolCounts = (text) => whereSaysAnotherToolCounts(withoutTestDatabaseSentence(text));

const DATABASE_WHERE_SAMPLE =
  "where: SQL in `.sql` files, in migrations of any framework and inside code; a schema change written as a migration call counts as its SQL. Creating or dropping the tables of a test database in a test's setup or teardown is not this domain's behaviour";
test('probe: the Database "where" check accepts the test-database sentence of its own and nothing wider, and still rejects another tool set apart', () => {
  proveCheck(
    databaseWhereSaysAnotherToolCounts,
    DATABASE_WHERE_SAMPLE,
    {
      // the six of the "where" check, on the clause that says another framework counts
      ignored: (text) => text.replace('of any framework', 'of any framework, which are ignored,'),
      skipped: (text) => text.replace('of any framework', 'of any framework, which are skipped,'),
      'out of scope': (text) => text.replace('of any framework', 'of any framework, which are out of scope,'),
      'does not count': (text) => text.replace('counts as its SQL', 'does not count as its SQL'),
      'clause gone': (text) => text.replace(', in migrations of any framework and inside code', ' and inside code'),
      'except one': (text) => text.replace('of any framework', 'of any framework except Rails'),
      // the test-database sentence made wider, or not a sentence of its own
      'joined by a semicolon': (text) => text.replace('its SQL. Creating', 'its SQL; creating'),
      'any database': (text) => text.replace('of a test database', 'of any database'),
      'test or production': (text) => text.replace('of a test database', 'of a test or production database'),
      'or in a migration': (text) => text.replace("setup or teardown is", 'setup or teardown, or in a migration, is'),
      'by any framework': (text) => text.replace("setup or teardown is", 'setup or teardown by any framework is'),
      anywhere: (text) => text.replace("in a test's setup or teardown", 'anywhere, as in a test setup or teardown,'),
      'except production': (text) => text.replace("this domain's behaviour", "this domain's behaviour, except in production"),
    },
    {
      'other words': (text) =>
        text.replace(
          "Creating or dropping the tables of a test database in a test's setup or teardown is not this domain's behaviour",
          "Dropping the tables of a test database in a test's teardown, or creating them in its setup, does not count as this domain's behaviour",
        ),
      'sentence gone': (text) => text.replace(/\. Creating or dropping[^.]*$/, ''),
    },
  );
  // The sentence counts only in the Database "where": the other domains keep the plain check.
  assert.equal(
    whereSaysAnotherToolCounts(
      "where: Kubernetes manifests and the templates that produce them; the same setting in another container platform counts. Creating or dropping the tables of a test database in a test's setup or teardown is not this domain's behaviour",
    ),
    false,
  );
});

// Contract: the "where" line of each of the four technology domains says, as an inclusion, that
// the same setting in another tool, framework, format or platform counts, and sets nothing apart
// (spec, part 2b-2, test 1: "the where line of each one says another tool counts"), in each of the
// three editions; the one exception is the measured sentence of its own in the Database "where"
// that sets apart the tables of a test database in a test's setup or teardown (spec, "Conserto 2
// da parte 2b-2"), and that sentence sets apart nothing wider.
// Breaks when: a rewrite keeps the words "another tool" but sets it apart ("the same setting in
// another container platform is ignored", "in Terraform; ... another tool is skipped"); both
// survived a mutation of the three editions. Or the test-database sentence grows into a narrowing
// by the tool or a wider exclusion ("of any database", "or in a migration", "by any framework").
// Missed by the implementer's tests because: their domain case asks only that "any/another/other"
// sits next to "tool/framework/format/platform" somewhere in the line, rejects only "only",
// "never", "not", "except" and "unless", and leaves out of that check any Database sentence that
// speaks of a test, a setup or teardown and a table, so "the tables of any database in a test's
// teardown are not this" passes it.
// Rewritten by the fact in re-audit 2 of part 2b-2 (written authorization in the briefing): the
// earlier form refused any "not" in the whole line, the measured sentence included.
test('probe: each technology "where" says another tool counts, as an inclusion, in the three editions', () => {
  for (const [edition, step] of editions()) {
    for (const name of ['Database', 'Infrastructure (IaC)', 'Kubernetes', 'Config']) {
      const text = where(step, name);
      const check = name === 'Database' ? databaseWhereSaysAnotherToolCounts : whereSaysAnotherToolCounts;
      assert.ok(check(text), `${edition}: the ${name} "where" does not say another tool counts: ${text}`);
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

// K8S103: a clause on the Dockerfile says the last `USER` is the one that counts, and that the
// stage that counts is the final one: every stage it names is the final (or last) stage, or the
// stage the final one is built from, whose user it inherits; and a clause on the Dockerfile sets
// apart, with a negation, only a switch to root that a later `USER` takes back; no Dockerfile
// clause sets a `USER root` apart without that.
const OTHER_STAGE = /\b(?:first|any|every|each|some|one|earlier|earliest|intermediate|build|builder|base|previous|other|another|single|non-final)\s+stages?\b/i;
function k8s103KeepsTheLastDockerfileUser(behaviour) {
  const docker = behaviour.split(';').filter((clause) => /\bDockerfiles?\b/.test(clause));
  const last = docker.some((clause) => /\blast\b[^;]*`?USER`?/.test(clause));
  const finalStage = docker.some((clause) => /\b(?:final|last)\s+stage\b/i.test(clause)) && !docker.some((clause) => OTHER_STAGE.test(clause));
  const inherited = docker.some((clause) => /\binherit\w*\b/i.test(clause) && !NEGATED.test(clause.slice(0, clause.search(/\binherit/i))));
  const back = docker.filter((clause) => NEGATED.test(clause));
  return (
    last &&
    finalStage &&
    inherited &&
    back.length > 0 &&
    back.every((clause) => /\b(?:back|later|switch\w*|another)\b/i.test(clause) && /\blast\b|\bback\b|\blater\b/i.test(clause))
  );
}

const CFG104_SAMPLE =
  'a sensitive port is exposed or published, in a port mapping, an `EXPOSE`, a service, or a firewall rule that opens it to any address: remote access or a database, cache or search port (22, 3389, 5432, 3306, 6379, 27017, 9200, 11211); a rule that admits only a private range or another group is not this';
const K8S103_SAMPLE =
  'a container runs as the root user (`runAsUser: 0`, `user: "0"`, `user: root`); in a Dockerfile what counts is the user the final stage runs as (its last `USER`, or the one it inherits from the stage it is built from), so switching to root for a build step and back is not this';
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
      'first USER': (text) => text.replace('its last `USER`', 'its first `USER`'),
      'switch back counts': (text) => text.replace('and back is not this', 'and back is this too'),
      // the stage that counts is no longer the final one (review 1 of PR 69)
      'first stage': (text) => text.replace('the final stage', 'the first stage'),
      'any stage': (text) => text.replace('the final stage', 'any stage'),
      'build stage': (text) => text.replace('the final stage', 'the build stage'),
      'stage gone': (text) => text.replace('the user the final stage runs as', 'the user it runs as'),
      // the user the final stage inherits no longer counts (a `USER root` in the stage it is built from)
      'inherited gone': (text) => text.replace(', or the one it inherits from the stage it is built from', ''),
      'inherited set apart': (text) => text.replace('or the one it inherits from', 'not the one it inherits from'),
      'the old wording': (text) => text.replace(/; in a Dockerfile.*$/, '; in a Dockerfile only the last `USER` of the final stage counts, so switching to root for a build step and back is not this'),
    },
    {
      'counts only when last': (text) =>
        text.replace(
          /; in a Dockerfile.*$/,
          '; in a Dockerfile a `USER root` counts only when it is the last `USER` of the final stage or is inherited by it from the stage it is built from, and a build step run as root before switching back is not this',
        ),
      'colon form': (text) =>
        text.replace(/; in a Dockerfile.*$/, '; a Dockerfile counts by the user of its final stage, its own last `USER` or the one it inherits: switching to root for a build step and back is not this'),
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

// Contract: K8S103 fires on a Dockerfile whose final stage runs as root, by its own last `USER` or
// by the one it inherits from the stage it is built from, and sets apart only a switch to root for
// a build step that a later `USER` takes back (T2 of the 2b-2 audit, measured on 24/11: the build
// step 0 of 6 with the fix, 1 of 6 before; review 1 of PR 69: a `USER root` added to the stage a
// final `FROM build AS runtime` inherits, caught by the text of fix 3), in the three editions.
// Breaks when: the Dockerfile clause falls out (the measured false positive comes back), or becomes
// "a `USER root` in a Dockerfile is not this", or names the first `USER`: a Dockerfile that ends
// in `USER root` would no longer fire; or the stage that counts stops being the final one ("first
// stage", the mutation of the review, passed the earlier check in the three editions); or the
// inherited user falls out ("only the last `USER` of the final stage counts", the 2b-2 wording).
// Missed by the implementer's tests because: none of their cases reads the K8S103 row past its
// examples, and the earlier probe of the v1.20.0 trigger only checks `runAsUser: 0`.
// Made stronger by the fact in fix 3 of part 2b (written authorization in the briefing).
test('probe: K8S103 counts the last USER of a Dockerfile and sets apart only a switch back, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const behaviour = cell(step, 'K8S103');
    assert.ok(
      k8s103KeepsTheLastDockerfileUser(behaviour),
      `${edition}: K8S103 no longer counts the user of the final stage of a Dockerfile (its last USER or the one it inherits), or sets apart more than a switch back: ${behaviour}`,
    );
  }
});

// --- B1 of re-audit 2 of part 2b-2: a lock on the two measured fixes of its fix round 2 ---------

// The Database "where" holds, as a sentence of its own, the one measured exclusion: the tables of a
// test database (created, emptied or dropped) in a test's setup or teardown.
const whereSetsApartTestDatabase = (text) => text.split(/(?<=\.)\s+/).some((sentence) => setsApartTestDatabaseTablesOnly(sentence));

// DS102 says nothing of a test: the exclusion lives in the "where", not in a rule.
const ds102SaysNothingOfATest = (behaviour) => !/\btests?\b|\btest(?:'s|ing)\b/i.test(behaviour);

// DAT101 sets apart, in a clause with a negation, emptying a test database in a test's setup or
// teardown, and nothing wider: no other database, no other place, no "only", "except", "unless" or
// "but". The list of examples at the end of the row is left out of the reading.
function dat101SetsApartTestDatabaseOnly(behaviour) {
  const prose = behaviour.replace(/\s*\([^()]*`[^()]*\)\s*$/, '');
  const clauses = prose.split(/;|,\s*(?=(?:nor|and|or|but)\b)/).map((clause) => clause.trim());
  const apart = clauses.filter((clause) => /\btest(?:'s|s)?\b/i.test(clause));
  return (
    apart.length > 0 &&
    apart.every((clause) => {
      const rest = clause.replace(/\btest databases?\b/gi, 'TESTDB');
      return (
        /\bTESTDB\b/.test(rest) &&
        !/\bdatabases?\b/i.test(rest) &&
        /\b(?:setup|set-up|teardown|tear-down)\b/i.test(rest) &&
        NEGATED.test(rest) &&
        !/\bthis too\b/i.test(rest) &&
        !OTHER_PLACE.test(rest) &&
        !/\b(?:only|except|unless|but)\b/i.test(rest)
      );
    })
  );
}

const DATABASE_WHERE_FIX3 =
  "where: SQL in `.sql` files, in migrations of any framework and inside code; a schema change written as a migration call counts as its SQL. Creating, emptying or dropping a test database or its tables in a test's setup or teardown is not this domain's behaviour";
const DS102_SAMPLE = 'a table is dropped, by SQL, a migration or any schema call (`DROP TABLE`, `drop_table`, `migrations.DeleteModel`, `dropTable`)';
const DAT101_SAMPLE =
  "many stored records are deleted in one operation: every record of a table, collection or store, or all those a condition selects, by a query, an ORM call or a file command; one record deleted by its key is not this, nor is emptying a list, map or cache held in memory, nor emptying a test database in a test's setup or teardown (`delete_all`, `destroy_all`, `removeAll`, `bulk_delete`, `purge`)";
test('probe: the test-database checks reject the exclusion taken out, widened or moved into a rule, and accept it in other words', () => {
  proveCheck(
    whereSetsApartTestDatabase,
    DATABASE_WHERE_FIX3,
    {
      'sentence gone': (text) => text.replace(/\. Creating, emptying[^.]*$/, ''),
      'any database': (text) => text.replace('a test database or its tables', 'any database or its tables'),
      'test or production': (text) => text.replace('a test database or its tables', 'a test or production database or its tables'),
      'joined by a semicolon': (text) => text.replace('its SQL. Creating', 'its SQL; creating'),
      'or in a migration': (text) => text.replace('setup or teardown is', 'setup or teardown, or in a migration, is'),
      anywhere: (text) => text.replace("in a test's setup or teardown", 'anywhere, as in a test setup or teardown,'),
    },
    {
      'the 2b-2 sentence': (text) =>
        text.replace(
          "Creating, emptying or dropping a test database or its tables in a test's setup or teardown is not this domain's behaviour",
          "Creating or dropping the tables of a test database in a test's setup or teardown is not this domain's behaviour",
        ),
      'other words': (text) =>
        text.replace(
          "Creating, emptying or dropping a test database or its tables in a test's setup or teardown is not this domain's behaviour",
          "A test database, or the tables of one, created, emptied or dropped in a test's setup or teardown does not count as this domain's behaviour",
        ),
    },
  );
  proveCheck(
    ds102SaysNothingOfATest,
    DS102_SAMPLE,
    {
      'a test file': (text) => text.replace(/\)$/, '); a table dropped in a test file is not this'),
      'in a test': (text) => text.replace('a table is dropped,', 'a table is dropped outside a test,'),
    },
    {
      'other words': (text) => text.replace('a table is dropped, by SQL, a migration or any schema call', 'a table is dropped by SQL, by a migration or by any schema call'),
    },
  );
  proveCheck(
    dat101SetsApartTestDatabaseOnly,
    DAT101_SAMPLE,
    {
      'exclusion gone': (text) => text.replace(", nor emptying a test database in a test's setup or teardown", ''),
      'any database': (text) => text.replace('nor emptying a test database in', 'nor emptying any database in'),
      'test or production': (text) => text.replace('a test database in', 'a test or production database in'),
      anywhere: (text) => text.replace("nor emptying a test database in a test's setup or teardown", 'nor emptying a test database anywhere'),
      'inverted': (text) => text.replace("nor emptying a test database in a test's setup or teardown", "and emptying a test database in a test's setup or teardown is this too"),
      'every test file': (text) => text.replace("nor emptying a test database in a test's setup or teardown", 'nor a delete in any test file'),
    },
    {
      'its own clause': (text) =>
        text.replace(", nor emptying a test database in a test's setup or teardown (", "; emptying a test database in a test's setup or teardown is not this either ("),
      'teardown only': (text) => text.replace("in a test's setup or teardown", "in the setup or teardown of a test"),
    },
  );
});

// Contract: the Database "where" keeps, as a sentence of its own, the measured exclusion of a test
// database created, emptied or dropped in a test's setup or teardown (fix 2 of part 2b-2, N3: a
// `drop_all` in a `conftest.py` went from DS102 in 6 of 6 to 0 of 6; widened to emptying in fix 3,
// B2), DAT101 sets apart emptying a test database in a test's setup or teardown and nothing wider
// (fix 3, B2), and DS102 says nothing of a test, in each of the three editions.
// Breaks when: the sentence is taken out of the Database "where" or the exclusion out of DAT101
// (the measured false positive on a test teardown comes back), or either one is widened to another
// database or another place, or the exclusion moves into DS102 as "a test file"; the earlier where
// probe accepts the sentence taken out (its "sentence gone" rewrite), and the four catalog text
// files passed with it taken out, 80 of 80 (re-audit 2 of part 2b-2, B1).
// Missed by the implementer's tests because: their domain case leaves out of its check any Database
// sentence that speaks of a test, and no case reads DAT101 past its two earlier exclusions.
test('probe: the Database "where" and DAT101 set apart a test database in a test setup or teardown, and nothing wider, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const text = where(step, 'Database');
    assert.ok(whereSetsApartTestDatabase(text), `${edition}: the Database "where" lost its test-database sentence, or widened it: ${text}`);
    const ds102 = cell(step, 'DS102');
    assert.ok(ds102SaysNothingOfATest(ds102), `${edition}: DS102 speaks of a test: ${ds102}`);
    const dat101 = cell(step, 'DAT101');
    assert.ok(dat101SetsApartTestDatabaseOnly(dat101), `${edition}: DAT101 lost the test-database exclusion, or widened it: ${dat101}`);
  }
});

// K8S104: every example that names `RunAsAny` names it on `runAsUser`, and a clause outside the
// examples, with a negation, sets apart `RunAsAny` for groups and for SELinux, and not for a user.
function k8s104NamesTheUserRunAsAny(behaviour) {
  const open = behaviour.indexOf('(');
  const close = behaviour.indexOf(')', open);
  if (open < 0 || close < 0) return false;
  const examples = behaviour.slice(open + 1, close).split(',').filter((example) => /RunAsAny/.test(example));
  const named = examples.length > 0 && examples.every((example) => /runAsUser/.test(example));
  const apart = `${behaviour.slice(0, open)} ${behaviour.slice(close + 1)}`.split(';').filter((clause) => /RunAsAny/.test(clause));
  const apartOk =
    apart.length > 0 &&
    apart.every((clause) => NEGATED.test(clause) && /groups?/i.test(clause) && /selinux/i.test(clause) && !/\busers?\b|runAsUser/i.test(clause) && !/\bthis too\b/i.test(clause));
  return named && apartOk;
}

const K8S104_SAMPLE =
  'the check that keeps a workload from running as root is turned off (`runAsNonRoot: false`, an OpenShift SCC whose `runAsUser` is `type: RunAsAny`, `pod-security.kubernetes.io/enforce: privileged`); `RunAsAny` for groups or SELinux is not this';
test('probe: the K8S104 check rejects a bare RunAsAny and a lost or widened exclusion, and accepts the same rule in other words', () => {
  proveCheck(
    k8s104NamesTheUserRunAsAny,
    K8S104_SAMPLE,
    {
      'bare RunAsAny': (text) => text.replace('an OpenShift SCC whose `runAsUser` is `type: RunAsAny`', '`type: RunAsAny`'),
      'exclusion gone': (text) => text.replace('; `RunAsAny` for groups or SELinux is not this', ''),
      'every RunAsAny set apart': (text) => text.replace('`RunAsAny` for groups or SELinux is not this', '`RunAsAny` is not this'),
      'users set apart too': (text) => text.replace('for groups or SELinux', 'for users, groups or SELinux'),
      'SELinux gone': (text) => text.replace('for groups or SELinux', 'for groups'),
      'inverted': (text) => text.replace('is not this', 'is this too'),
    },
    {
      'nested form': (text) => text.replace('an OpenShift SCC whose `runAsUser` is `type: RunAsAny`', 'an SCC with `runAsUser: { type: RunAsAny }`'),
      'field names': (text) => text.replace('`RunAsAny` for groups or SELinux is not this', 'a `RunAsAny` on `fsGroup`, `supplementalGroups` or `seLinuxContext` is not this'),
    },
  );
});

// Contract: K8S104 names, as its example, an OpenShift SCC whose `runAsUser` is `RunAsAny`, and
// sets apart `RunAsAny` for groups and SELinux (fix 2 of part 2b-2, N1: an SCC with
// `runAsUser: MustRunAsNonRoot` and groups in `RunAsAny` went from 1 of 6 to 0 of 6, and the planted
// `scc-indexer.yaml` stays K8S104 in 12 of 12), in each of the three editions.
// Breaks when: the example goes back to a bare `type: RunAsAny` (the 2b-2 draft 3 wording), or the
// exclusion falls out, loses SELinux, or is widened to every `RunAsAny` or to a user; the four
// catalog text files passed with K8S104 back at draft 3, 80 of 80 (re-audit 2 of part 2b-2, B1).
// Missed by the implementer's tests because: none of their cases reads the K8S104 row past its
// v1.20.0 example `runAsNonRoot: false`.
test('probe: K8S104 names RunAsAny on runAsUser and sets apart RunAsAny for groups and SELinux, in the three editions', () => {
  for (const [edition, step] of editions()) {
    const behaviour = cell(step, 'K8S104');
    assert.ok(k8s104NamesTheUserRunAsAny(behaviour), `${edition}: K8S104 names a bare RunAsAny, or lost or widened its exclusion: ${behaviour}`);
  }
});
