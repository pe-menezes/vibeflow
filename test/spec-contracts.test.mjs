// Contracts of spec hardening: gen-spec, discover and analyze carry the same
// rules in every edition. Each assertion pins a literal the loop or the audit
// reads (a heading, a marker, a limit), so a weaker wording in one edition
// fails here instead of drifting silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

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

// The text under a Markdown heading, up to the next heading of the same or a
// higher level. Empty when the heading is absent.
function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return '';
  const level = /^#+/.exec(heading)[0].length;
  const end = lines.findIndex(
    (line, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

// The first fenced block after a heading.
function fenceAfter(content, heading) {
  const at = content.indexOf(heading);
  if (at === -1) return '';
  const match = /```[^\n]*\n([\s\S]*?)\n```/.exec(content.slice(at));
  return match ? match[1] : '';
}

// Prompts wrap prose at ~80 columns, so phrase contracts run on a copy with
// every run of whitespace collapsed to one space; structure checks (sections,
// fences, order) use the raw text.
const flat = (text) => text.replace(/\s+/g, ' ');

function forEachEdition(workflow, run) {
  for (const [edition, path] of Object.entries(editions(workflow))) {
    const raw = read(path);
    run(flat(raw), `${edition}/${workflow}`, raw);
  }
}

test('gen-spec records clarifications and caps open markers', () => {
  forEachEdition('gen-spec', (content, label) => {
    assert.match(content, /## Clarifications/, `${label}: Clarifications section`);
    assert.match(content, /at most 5 questions per session/i, `${label}: 5-question cap`);
    assert.match(content, /carr(y|ies|ied)[^.]*`## Clarifications`[^.]*PRD|PRD[^.]*`## Clarifications`[^.]*carr(y|ies|ied)/i,
      `${label}: carries PRD clarifications`);
    assert.match(content, /\[NEEDS CLARIFICATION: /, `${label}: marker literal`);
    assert.match(content, /at most 3 open/i, `${label}: 3-marker cap`);
    assert.match(content, /more than 3[^.]*ask[^.]*before saving/i, `${label}: more than 3 asks before saving`);
    assert.doesNotMatch(content, /flag it with a TODO/i, `${label}: TODO flag replaced by the marker`);
  });
});

test('gen-spec offers EARS scenarios and property checks as fields of a check', () => {
  forEachEdition('gen-spec', (content, label) => {
    assert.match(content, /`Scenarios:`/, `${label}: Scenarios field`);
    assert.match(content, /1 to 3/, `${label}: 1 to 3 scenario lines`);
    assert.match(content, /WHEN <condition> THE SYSTEM SHALL <behavior>/, `${label}: EARS form`);
    assert.match(content, /red test/i, `${label}: scenarios become the red test`);
    assert.match(content, /for any <input space>, <invariant>/, `${label}: property form`);
    assert.match(content, /oracle/i, `${label}: property names its oracle`);
    assert.match(content, /property-testing library/i, `${label}: properties only with a library`);
    assert.match(content, /never extra checks/i, `${label}: fields never count as checks`);
    assert.match(content, /3[–-]7 checks/i, `${label}: DoD stays 3–7`);
  });
});

test('gen-spec lists risk code inside Risks, in its four categories', () => {
  forEachEdition('gen-spec', (content, label) => {
    assert.match(content, /`Risk code:`/, `${label}: Risk code field`);
    assert.match(content, /inside `## Risks`/, `${label}: Risk code lives inside Risks`);
    for (const category of [
      /money and totals/i,
      /credentials and permissions/i,
      /deleting or overwriting data/i,
      /date and time boundaries/i,
    ]) {
      assert.match(content, category, `${label}: risk category ${category}`);
    }
    assert.match(content, /sabotag/i, `${label}: the audit sabotages risk code`);
  });
});

test('gen-spec self-checks the draft before saving, one round of at most 2 questions', () => {
  forEachEdition('gen-spec', (content, label, raw) => {
    const selfCheck = flat(section(raw, '## Self-check'));
    assert.ok(selfCheck, `${label}: ## Self-check section`);
    assert.match(selfCheck, /binary/i, `${label}: every check binary`);
    assert.match(selfCheck, /functional check[^.]*names its test[^.]*`Scenarios:`/i,
      `${label}: functional check names its test or carries a scenario`);
    assert.match(selfCheck, /\[NEEDS CLARIFICATION\][^.]*count/i, `${label}: markers counted`);
    assert.match(selfCheck, /up to 2 targeted questions in one round/i, `${label}: 2 questions, one round`);
    assert.match(selfCheck, /PRD Validation Gate/, `${label}: same rhythm as the PRD gate`);

    const order = ['## Self-check', '## Spec splitting', 'Save the spec to'].map((s) => content.indexOf(s));
    assert.ok(order.every((i, k) => i !== -1 && (k === 0 || i > order[k - 1])),
      `${label}: self-check runs before splitting and saving`);

    const gate = flat(section(raw, '### PRD Validation Gate'));
    assert.match(gate, /Five checks before generating/, `${label}: PRD gate keeps its five checks`);
    assert.match(gate, /ask up to 2\s+targeted\s+questions about the failures/i, `${label}: PRD gate asks up to 2 questions`);
  });
});

test('discover records the decisive questions under Clarifications in the PRD', () => {
  forEachEdition('discover', (content, label, raw) => {
    const template = fenceAfter(raw, '## PRD generation');
    assert.match(template, /^## Clarifications$/m, `${label}: PRD template has Clarifications`);
    assert.ok(template.indexOf('## Clarifications') < template.indexOf('## Open Questions'),
      `${label}: Clarifications before Open Questions`);
    assert.match(content, /decisive questions/i, `${label}: only the decisive questions`);
    assert.match(content, /gen-spec[^.]*carries them into the spec/i, `${label}: gen-spec carries them`);
  });
});

test('analyze writes tests and pitfalls into index.md inside the auto markers', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const template = fenceAfter(raw, '### index.md format');
    const marks = ['<!-- vibeflow:auto:start -->', '## Tests', '## Pitfalls', '<!-- vibeflow:auto:end -->']
      .map((s) => template.indexOf(s));
    assert.ok(marks.every((i, k) => i !== -1 && (k === 0 || i > marks[k - 1])),
      `${label}: Tests and Pitfalls inside the auto markers of the index.md template`);
    assert.match(template, /Full suite:/, `${label}: full-suite command`);
    assert.match(template, /Affected only:/, `${label}: affected-tests command`);
    assert.match(template, /unmeasured/, `${label}: unmeasured when not run`);
    assert.match(template, /source:/, `${label}: each pitfall carries its source`);

    assert.match(content, /by file, package or tag/i, `${label}: affected tests by file, package or tag`);
    assert.match(content, /measured time/i, `${label}: measured time when run`);
    assert.match(content, /decisions\.md[^.]*CI configuration[^.]*(revert|fix)/i,
      `${label}: pitfall sources`);
    assert.match(raw, /\*\*index\.md\*\*[^\n]*Tests and Pitfalls[^\n]*(refresh|regenerat)/i,
      `${label}: incremental runs refresh the block`);
  });
});

// The paragraph that starts with a given literal, up to the next blank line.
function paragraph(content, start) {
  const at = content.indexOf(start);
  if (at === -1) return '';
  const end = content.indexOf('\n\n', at);
  return content.slice(at, end === -1 ? undefined : end);
}

test('gen-spec self-check rule 2 applies only with a test runner, and the marker cap lives in one place', () => {
  forEachEdition('gen-spec', (content, label, raw) => {
    const selfCheck = flat(section(raw, '## Self-check'));
    assert.match(selfCheck, /2\. Where the project has a detectable test runner, every functional check names its test/,
      `${label}: rule 2 conditioned on a detectable runner`);
    assert.doesNotMatch(selfCheck, /at most 3/i, `${label}: self-check points at the cap instead of restating it`);
    assert.match(selfCheck, /\[NEEDS CLARIFICATION\][^.]*counted against the cap above/i,
      `${label}: self-check points at the cap`);
    assert.equal((content.match(/at most 3 open/gi) ?? []).length, 1, `${label}: the 3-marker cap stated once`);
  });
});

test('gen-spec saves with more than 3 open markers only after the one round, recommending discover', () => {
  forEachEdition('gen-spec', (content, label, raw) => {
    const selfCheck = flat(section(raw, '## Self-check'));
    assert.match(selfCheck, /one question can cover more than one marker/i, `${label}: one question, several markers`);
    assert.match(selfCheck, /markers still open after it stay in the spec and are named in your reply[^.]*more than 3 still open[^.]*recommends running `discover` before `implement`/i,
      `${label}: more than 3 left after the round → saved, listed, discover recommended`);
    assert.match(selfCheck, /never opens a second round/i, `${label}: still one round`);
  });
});

test('analyze incremental: an upgrade or a tests-only change refreshes the Tests and Pitfalls block', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const phase0 = flat(paragraph(raw, '**Incremental mode.**'));
    assert.match(phase0, /Tests and Pitfalls block is due when `index\.md` lacks it/i,
      `${label}: upgrade without code change makes the block due`);
    assert.match(phase0, /lacks it[^.]*or when a test file, the CI configuration or the test runner's configuration changed/i,
      `${label}: test, CI or runner changes make the block due`);
    assert.match(phase0, /even when those changes need no pattern reanalysis/i,
      `${label}: block refresh independent of pattern reanalysis`);
    assert.match(phase0, /Nothing changed and the block is not due → report "No changes detected/,
      `${label}: "up to date" only when the block is not due`);
    assert.match(phase0, /block is due but nothing else changed → regenerate only the block/i,
      `${label}: block-only run instead of stopping`);
    assert.doesNotMatch(content, /regenerated on every run/i, `${label}: no unconditional regeneration`);
  });
});

// A project's suite can start containers, call services or run for many
// minutes, so analyze records the two test commands and runs them only when
// the user passes --measure. The Tests bullet is the same text in every
// edition.
test('analyze runs the test commands only with --measure', () => {
  const bullets = [];
  forEachEdition('analyze', (content, label, raw) => {
    const from = raw.indexOf('- *Tests* —');
    const to = raw.indexOf('- *Pitfalls* —', from);
    assert.ok(from !== -1 && to > from, `${label}: a Tests bullet followed by a Pitfalls bullet`);
    const tests = flat(raw.slice(from, to));
    bullets.push(tests);
    assert.match(tests, /Record both commands without running them\./,
      `${label}: the commands are recorded, not run`);
    assert.match(tests, /Only with `--measure`, run each one once and record the measured time and the date\./,
      `${label}: --measure runs each command once and records time and date`);
    assert.match(tests, /Without it, keep the measured time and date already recorded; a command never measured is marked `unmeasured`\./,
      `${label}: without --measure the last measurement stays and a never-measured command is unmeasured`);
    assert.doesNotMatch(content, /local and safe/i, `${label}: no judgment call on whether a run is safe`);
    assert.doesNotMatch(content, /run it once/i, `${label}: no unconditional run`);

    // The flag is listed with the other flags, with its reason.
    const listing = label.startsWith('shared/')
      ? flat(section(raw, '## Description and examples'))
      : flat(paragraph(raw, '**Usage:**'));
    assert.match(listing, /`(analyze )?--measure`[^.]*recorded[^.]*container[^.]*service[^.]*many minutes/i,
      `${label}: --measure listed with the other flags, with why it is opt-in`);
    assert.match(content, /flags in the [^(]*\(`--fresh`[^)]*`--measure`[^)]*\)/,
      `${label}: Phase 0 reads --measure with the other flags`);
    assert.match(content, /`--measure` composes with every mode[^.]*changes nothing else about which phases run or when the block is due/i,
      `${label}: --measure does not change which phases run or when the block is due`);
  });
  assert.equal(new Set(bullets).size, 1, 'the Tests bullet is the same text in the three editions');
});

// A date boundary. `git log --since` with a bare date counts from the current
// time of day on that date, not from midnight (observed on git 2.50.1), so
// the incremental check would miss the commits made earlier that day. The
// command is taken from each edition and run against a repository whose two
// commits sit one minute on each side of midnight of a fixed date, so the
// answer depends on the text and never on the clock.
test('analyze incremental: git log --since starts at midnight of the Analyzed date', () => {
  const date = '2020-01-15';
  forEachEdition('analyze', (content, label, raw) => {
    const phase0 = paragraph(raw, '**Incremental mode.**');
    const command = /`(git log --since=[^`]*)`/.exec(phase0);
    assert.ok(command, `${label}: the incremental check names its git log command`);
    const repo = mkdtempSync(join(tmpdir(), 'vibeflow-since-'));
    try {
      const env = { PATH: process.env.PATH, HOME: repo, TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1' };
      const git = (args, extra = {}) => {
        const result = spawnSync('git', args, { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
        assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
        return result.stdout;
      };
      git(['init', '-q']);
      const commit = (file, when) => {
        writeFileSync(join(repo, file), `${file}\n`);
        git(['add', file]);
        git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', file],
          { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
      };
      commit('before-midnight.txt', '2020-01-14 23:59:00');
      commit('after-midnight.txt', `${date} 00:01:00`);
      const result = spawnSync('sh', ['-c', command[1].replaceAll('<date>', date)], { cwd: repo, env, encoding: 'utf8' });
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      const files = result.stdout.split('\n').filter(Boolean);
      assert.deepEqual(files, ['after-midnight.txt'], `${label}: a commit at 00:01 of the Analyzed date counts, one at 23:59 the day before does not`);
      assert.match(command[1], /--since="<date> 00:00"/, `${label}: the date goes with an explicit time`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

// In the block-only clause, `Analyzed: <date>` can read as the old date read
// from index.md; the clause itself says Analyzed moves to today.
test('analyze block-only run says in its own clause that Analyzed moves to today', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const phase0 = flat(paragraph(raw, '**Incremental mode.**'));
    const clause = /block is due but nothing else changed → (.*?) report "/i.exec(phase0);
    assert.ok(clause, `${label}: a block-only path in Phase 0`);
    assert.match(clause[1], /`Analyzed:`[^,;]*today's date/, `${label}: the clause moves Analyzed to today's date`);
    assert.doesNotMatch(clause[1], /`Analyzed: <date>`/, `${label}: no <date> that reads as the old date`);
  });
});
