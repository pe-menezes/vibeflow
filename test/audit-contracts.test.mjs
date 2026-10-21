// Contracts of the independent audit: the three audit editions, the auditor
// role and its Claude Code agent. Each assertion pins a literal the loop,
// `watch-round.mjs`, `stats` or the smoke harness reads, or a rule the audit
// workflow states, so a weaker wording in one edition fails here instead of
// drifting silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KIT = 'plugins/vibeflow/skills/implement/loop';
const ROLE = `${KIT}/roles/auditor.md`;
const AGENT = 'plugins/vibeflow/agents/auditor.md';

const EDITIONS = {
  shared: 'plugins/vibeflow/skills/audit/SKILL.md',
  cursor: 'cursor/skills/vibeflow-audit/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-audit.prompt.md',
};

// Where each edition reaches the kit, and what it tells the user when the kit
// is missing.
const KIT_PATH = {
  shared: '${CLAUDE_SKILL_DIR}/../implement/loop/',
  cursor: '.cursor/skills/vibeflow-implement/loop/',
  copilot: '.github/vibeflow/loop/',
};
const INSTALL_HINT = {
  shared: /updating the Vibeflow plugin installs it/,
  cursor: /`npx setup-vibeflow@latest --cursor --force`/,
  copilot: /`npx setup-vibeflow@latest --copilot --force`/,
};

const FINDING_LINE =
  '- [<id>] <severity> · <cause> · confidence <high|medium|low> — <what> — evidence: <file:line or failing test> — probe: <path::case | report only>';
const COVERED_GAP =
  'a proof gap that the auditor\'s own probe already closes, with the probe entering the suite with its three pruning answers, is reported as `closed-by-probe` and does not hold the verdict by itself';

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

// Prompts wrap prose at ~80 columns, so phrase contracts run on a copy with
// every run of whitespace collapsed to one space; structure checks use the raw
// text.
const flat = (text) => text.replace(/\s+/g, ' ');

function count(haystack, needle) {
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) n += 1;
  return n;
}

// The first fenced block after a heading.
function fenceAfter(content, heading) {
  const at = content.indexOf(heading);
  if (at === -1) return '';
  const match = /```[^\n]*\n([\s\S]*?)\n```/.exec(content.slice(at));
  return match ? match[1] : '';
}

function forEachEdition(run) {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const raw = read(path);
    run(flat(raw), edition, raw);
  }
}

// ------------------------------------------------------------ review package

test('audit builds or reads a review package and refuses to pass over an empty one', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /`--package <path>`/, `${edition}: --package flag`);
    assert.ok(content.includes(`${KIT_PATH[edition]}scripts/review-package.mjs`), `${edition}: review-package.mjs at the host's kit path`);
    assert.match(content, /`\.vibeflow\/reviews\/<feature-slug>-round-0\.md`/, `${edition}: package written into .vibeflow/reviews/`);
    assert.match(content, /\*\*Read the diff from the review package\*\*/, `${edition}: the Critical Gate reads the package's diff`);
    assert.doesNotMatch(content, /\*\*Compute the real diff\*\*/, `${edition}: the gate no longer computes its own diff`);
    assert.match(content, /empty package[^.]*`\*\*Verdict: FAIL\*\*`[^.]*"nothing to audit"[^.]*never PASS/i,
      `${edition}: an empty package ends the audit with FAIL, never PASS`);
    assert.equal(count(content, '"nothing to audit"'), 1, `${edition}: the empty-package rule is stated once`);
    assert.match(content, /exits 1[^.]*empty/i, `${edition}: exit 1 of review-package reads as empty`);
    assert.match(content, /`Review package: none \(kit not installed\)`/, `${edition}: fallback header value`);
    assert.match(content, INSTALL_HINT[edition], `${edition}: install hint for the host`);
    assert.match(content, /kit not installed[^.]*computes? the diff as (before|today)|computes? the diff as (before|today)[^.]*kit not installed/i,
      `${edition}: without the kit, the diff is computed as before`);
  });
});

test('--base names the base, and a standalone audit over committed work runs as before instead of failing', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /`--base <ref>`/, `${edition}: --base flag`);
    assert.match(content, /`Review package: none \(no uncommitted or branch change; --base <ref> audits committed work\)`/,
      `${edition}: header value of the standalone audit over committed work`);
    assert.match(content, /already committed on the default branch[^.]*runs over the code as before/i,
      `${edition}: the standalone audit over committed work runs over the code`);
    assert.match(content, /Critical Gate section says (that )?no diff was scanned/i, `${edition}: the gate says no diff was scanned`);
    const rule = /- An empty package[\s\S]*?proven nothing\./.exec(content)?.[0] ?? '';
    for (const expected of [/a loop part/, /a given `--package`/, /a given `--base <ref>`/, /a re-audit/]) {
      assert.match(rule, expected, `${edition}: the empty-package rule names ${expected}`);
    }
  });
});

test('the package is built before the first write and the loop artifacts never count as a change', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /before the report's first write/i, `${edition}: package before the first write`);
    assert.match(content, /`loop\/`, `briefings\/`, `progress\/`, `reviews\/`, `audits\/`/, `${edition}: the artifact folders`);
    assert.match(content, /never count as a change/i, `${edition}: artifacts never count as a change`);
  });
});

test('Node.js 18+ is checked before the kit, and exit 1 is empty only with the EMPTY PACKAGE marker', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /`node --version`/, `${edition}: checks the Node version`);
    assert.match(content, /`Review package: none \(Node\.js 18\+ not found\)`/, `${edition}: header value without Node 18`);
    assert.match(content, /Exit 1 reads as empty only when the file it wrote carries the EMPTY PACKAGE marker/,
      `${edition}: exit 1 needs the marker`);
    assert.match(content, /any other failure[^.]*is an error[^.]*quote/i, `${edition}: any other failure is an error, quoted`);
  });
});

// ------------------------------------------------------------ header, stages

test('the report carries the loop header, a pending verdict until the last stage, and the parsed sections', () => {
  forEachEdition((content, edition, raw) => {
    const template = fenceAfter(raw, '## Output format');
    for (const line of [
      'Independence: fresh session | same session',
      'Round: audit | reaudit <n>',
      'Stage: <k>/<total> <name> | final',
      'Review package: <path> | none (<reason>)',
      'Base: <sha>',
      '**Verdict: PASS | PARTIAL | FAIL**',
      '### DoD Checklist',
      '### Pattern Compliance',
      '### Critical Gate',
      '### Findings',
      '### Sabotage',
      '### Probes',
      '### Follow-ups',
    ]) {
      assert.ok(template.split('\n').some((l) => l.trim() === line), `${edition}: report template line "${line}"`);
    }
    assert.match(content, /rewrit\w+ the report at the end of every stage/i, `${edition}: partial report at every stage`);
    assert.match(content, /`\*\*Verdict: pending\*\*` until the last write/, `${edition}: pending verdict until the last write`);
    assert.match(content, /last write sets `Stage: final`/, `${edition}: the last write sets Stage: final`);
    assert.match(content, /stay literally in English[^.]*`watch-round\.mjs`[^.]*`stats`/i,
      `${edition}: header labels stay literal in English, with the reason`);
    assert.match(content, /`Independence: same session`[^.]*instead of refusing/i, `${edition}: same session is recorded, not refused`);
  });
});

// --------------------------------------------------------- findings, verdict

test('every finding uses the finding line, and the verdict maps severity and cause', () => {
  forEachEdition((content, edition) => {
    assert.equal(count(content, FINDING_LINE), 1, `${edition}: the finding line, word for word, once`);
    assert.match(content, /`defect` \(wrong behavior\)/, `${edition}: defect defined`);
    assert.match(content, /`risk-gap` \(code right, proof missing, in risk code\)/, `${edition}: risk-gap defined`);
    assert.match(content, /`low` \(anything else\)/, `${edition}: low defined`);
    for (const cause of ['spec', 'implementation', 'proof', 'fix']) {
      assert.match(content, new RegExp(`\`${cause}\` \\(`), `${edition}: cause ${cause} defined`);
    }
    assert.match(content, /open `defect` or `risk-gap` keeps the verdict below PASS/, `${edition}: open defect or risk-gap blocks PASS`);
    assert.match(content, /`low` finding goes to `### Follow-ups` and does not block/, `${edition}: low does not block`);
    assert.match(content, /`spec`-cause finding goes to the human or to a recorded spec amendment, never straight to a fix/,
      `${edition}: spec cause routed away from the fix`);
    assert.equal(count(content, COVERED_GAP), 1, `${edition}: the covered-gap rule, word for word, once`);
  });
});

// -------------------------------------------------------- proof proportional

test('proof scales with risk: scenarios, sabotage only in risk code, undone from a hashed copy', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /read the code and test scenarios/i, `${edition}: reads code and tests scenarios`);
    assert.match(content, /each tested scenario becomes a probe case/i, `${edition}: scenario becomes a probe case`);
    assert.match(content, /`Risk code:`/, `${edition}: the spec's Risk code line`);
    assert.match(content, /money and totals, credentials and permissions, deleting or overwriting data, date and time boundaries/,
      `${edition}: the four risk categories`);
    assert.match(content, /no `Risk code:` line[^.]*four categories[^.]*say(ing)? so/i, `${edition}: inferred risk code is said`);
    assert.match(content, /`Risk code: none`[^.]*accepted but checked/i, `${edition}: Risk code: none is checked`);
    assert.match(content, /`spec`-cause finding for the missed risk code[^.]*sabotages? there anyway/i,
      `${edition}: missed risk code is a spec finding and still sabotaged`);
    assert.match(content, /mutation tool[^.]*runs? first/i, `${edition}: the mutation tool runs before hand sabotage`);
    assert.match(content, /undone from a copy verified by hash/i, `${edition}: undo from a hashed copy`);
    assert.match(content, /`git checkout`, `git restore`, `git stash` and `git reset` are forbidden while work is uncommitted/,
      `${edition}: git undo commands forbidden`);
    assert.match(content, /each sabotage runs only the tests of that code/i, `${edition}: scoped tests per sabotage`);
    assert.match(content, /full suite runs once at the end/i, `${edition}: full suite once`);
    assert.match(content, /every sabotage and every survivor/i, `${edition}: sabotages and survivors listed`);
  });
});

test('a sabotage is recorded before it is applied, a retry restores it first, and a standalone audit spares uncommitted files', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /before applying a sabotage, write it into the report[^.]*the file, the path of its copy under `\.vibeflow\/audits\/`[^.]*hash/i,
      `${edition}: the sabotage is written in the report before it is applied`);
    assert.match(content, /restores? every sabotage (it|the report) records? as in progress[^.]*before anything else/i,
      `${edition}: a retry restores an in-progress sabotage first`);
    assert.match(content, /standalone audit sabotages only files without uncommitted changes[^.]*lists the others as not sabotaged, with the reason/i,
      `${edition}: a standalone audit spares files with uncommitted changes`);
  });
});

// An audit run by hand keeps the 1.15 footprint plus the report's new fields.
test('a standalone audit writes the probe file and sabotages only with --probes; a loop part runs both', () => {
  forEachEdition((content, edition, raw) => {
    assert.match(content, /standalone audit \(no loop briefing\)[^.]*writes the probe file and sabotages only with `--probes`/i,
      `${edition}: the rule, with what makes an audit standalone`);
    assert.match(content, /loop part \(briefing present\) runs both/i, `${edition}: a loop part runs both as written`);
    const step6 = /6\. \*\*Sabotage, only in risk code\*\*[\s\S]*?7\. \*\*Probes\*\*/.exec(content)?.[0] ?? '';
    assert.match(step6, /standalone audit without `--probes`[^.]*records? `Sabotage: skipped \(standalone audit; --probes runs it\)`[^.]*skips? the stage/i,
      `${edition}: without --probes, sabotage is skipped and recorded`);
    assert.match(step6, /With `--probes`, a standalone audit sabotages only files without uncommitted changes/,
      `${edition}: the uncommitted-files rule holds inside --probes`);
    const step7 = /7\. \*\*Probes\*\*[\s\S]*?8\. When/.exec(content)?.[0] ?? '';
    assert.match(step7, /standalone audit without `--probes` writes no probe file[^.]*lists? under `### Probes` the probe cases it would write, as code/i,
      `${edition}: without --probes, the probe cases are listed as code instead of written`);
    const template = fenceAfter(raw, '## Output format');
    const sabotage = /### Sabotage\n([\s\S]*?)\n### Probes/.exec(template)?.[1] ?? '';
    assert.ok(sabotage.split('\n').some((line) => line.includes('Sabotage: skipped (standalone audit; --probes runs it)')),
      `${edition}: the template carries the skipped line`);
    const probes = /### Probes\n([\s\S]*?)\n### Follow-ups/.exec(template)?.[1] ?? '';
    assert.match(probes, /would write \(standalone, no `--probes`\)/, `${edition}: the template carries the listed probe case`);
    const reaudit = /## Re-audit mode[\s\S]*?## Consolidation mode/.exec(content)?.[0] ?? '';
    assert.match(reaudit, /standalone re-audit follows the `--probes` rule/i, `${edition}: the re-audit follows the same rule`);
  });
});

// -------------------------------------------------------- probes and reaudit

test('behavior probes go to the suite with three answers, state probes stay in the report', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /`<test dir>\/audit\/<feature>-<part>\.test\.<ext>`/, `${edition}: probe path`);
    assert.match(content, /pinned by content/i, `${edition}: probes pin by content`);
    assert.match(content, /the contract it protects, the plausible regression that breaks it and why the implementer's tests miss it/,
      `${edition}: the three pruning answers`);
    assert.match(content, /state probe[^.]*stays? in the report/i, `${edition}: state probes stay in the report`);
    assert.match(content, /diff against the base, today's version, a doc sentence, a line number, the real clock/,
      `${edition}: what a state probe pins`);
    assert.match(content, /check-probes\.mjs[^.]*before the final stage/i, `${edition}: check-probes before the final stage`);
    assert.match(content, /old audit probes[^.]*duplicate implementer tests or pin state[^.]*removal[^.]*reason/i,
      `${edition}: old probes listed for removal with the reason`);
  });
});

test('a probe of an open finding carries the expected-failure marker, and check-probes reads the probe folder used', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /probe that reproduces an open finding carries the test framework's expected-failure marker naming the finding/i,
      `${edition}: expected-failure marker on a probe of an open finding`);
    assert.match(content, /`todo` in node:test, `xfail` in pytest, `test\.failing` in Jest/, `${edition}: the marker per framework`);
    assert.match(content, /never turns the project's suite red/i, `${edition}: the audit never turns the suite red`);
    assert.match(content, /fix that closes the finding removes the marker/i, `${edition}: the fix removes the marker`);
    assert.match(content, /check-probes\.mjs <project root> --base <base> --dir <probe dir>/, `${edition}: check-probes with --dir`);
    assert.match(content, /how many probe files it read/i, `${edition}: the report states how many probe files were read`);
  });
});

test('the re-audit number is the fix round, and new probes go to the audit\'s probe file', () => {
  forEachEdition((content, edition) => {
    const reaudit = /## Re-audit mode[\s\S]*?## Consolidation mode/.exec(content)?.[0] ?? '';
    assert.match(reaudit, /`<n>` is the fix round \(the briefing's number; standalone, one more than the re-audit reports already there\)/,
      `${edition}: where <n> comes from`);
    assert.match(reaudit, /appends? its new probes to the audit's probe file/i, `${edition}: new probes go to the audit's probe file`);
  });
});

test('audit --reaudit audits the fix diff only and writes its own report', () => {
  forEachEdition((content, edition) => {
    assert.match(content, /`--reaudit <round-commit>`/, `${edition}: --reaudit flag`);
    assert.match(content, /review-package\.mjs <project root> <round-commit>/, `${edition}: the package starts at the round commit`);
    assert.match(content, /the fix diff only/i, `${edition}: fix diff only`);
    assert.match(content, /runs? the suite and the audit's probes/i, `${edition}: suite and probes`);
    assert.match(content, /closes or keeps each open finding with its proof/i, `${edition}: each open finding judged with proof`);
    assert.match(content, /new defects in the fix diff only/i, `${edition}: new defects only in the fix diff`);
    assert.match(content, /full audit only when the fix left the findings' scope, saying why/i, `${edition}: full audit only out of scope`);
    assert.match(content, /`<feature>-<part>-reaudit-<n>\.md`/, `${edition}: re-audit report path`);
  });
});

// ------------------------------------------------------------ role and agent

function frontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  assert.ok(match, 'file must start with YAML frontmatter');
  return { block: match[1], body: content.slice(match[0].length) };
}

test('the auditor role exists once, and the Claude agent body is byte-identical to it', () => {
  const role = read(ROLE);
  const flatRole = flat(role);
  assert.doesNotMatch(role, /^---\n/, 'the role file has no front matter');
  assert.match(flatRole, /read the briefing first/i, 'role: briefing first');
  for (const path of Object.values(EDITIONS)) {
    const host = path.replace(/^plugins\/vibeflow\//, '').replace(/^cursor\//, '.cursor/').replace(/^copilot\/github\//, '.github/');
    assert.ok(role.includes(host), `role points at the audit workflow ${host}`);
  }
  assert.match(flatRole, /write only the report and the probe file/i, 'role: writes only report and probes');
  assert.match(flatRole, /never fix/i, 'role: never fixes');
  assert.match(flatRole, /no git write commands/i, 'role: no git writes');
  assert.match(flatRole, /rewrite the report at the end of every stage/i, 'role: partial report at every stage');
  assert.match(flatRole, /## Final answer/, 'role: final answer format');
  assert.match(flatRole, /`Stage: final`/, 'role: the final marker');
  assert.match(flatRole, /`\$\{CLAUDE_SKILL_DIR\}` in a workflow file stands for the directory of that SKILL\.md/,
    'role: how an agent that reads the workflow itself resolves ${CLAUDE_SKILL_DIR}');

  const agent = read(AGENT);
  const { block, body } = frontmatter(agent);
  assert.equal(body, role, 'agent body after the front matter is byte-identical to roles/auditor.md');
  assert.match(block, /^name: auditor$/m, 'agent name');
  assert.match(block, /^description: /m, 'agent description');
  const tools = /^tools:\s*(.+)$/m.exec(block);
  assert.ok(tools, 'agent declares its tools (an agent without the field inherits every tool, Agent included)');
  const names = tools[1].split(',').map((tool) => tool.trim().replace(/\(.*$/, ''));
  for (const spawner of ['Agent', 'Task', 'Skill']) {
    assert.ok(!names.some((name) => name.toLowerCase() === spawner.toLowerCase()), `agent tools exclude ${spawner}`);
  }
});

test('every kit script the audit editions name exists, and the kit lists the role', () => {
  forEachEdition((content, edition) => {
    const named = new Set([...content.matchAll(/\b([a-z][a-z-]*\.mjs)\b/g)].map((m) => m[1]));
    assert.ok(named.has('review-package.mjs') && named.has('check-probes.mjs'), `${edition}: names the two kit scripts`);
    for (const script of named) {
      assert.ok(existsSync(join(ROOT, KIT, 'scripts', script)), `${edition}: ${script} exists in the kit`);
    }
  });
  assert.match(read(`${KIT}/README.md`), /`roles\/auditor\.md`/, 'kit README lists the role');
  assert.ok(JSON.parse(read(`${KIT}/manifest.json`)).files.includes('roles/auditor.md'), 'manifest lists the role');
});

// The audit entry of CONTRACTS in test/distributions.test.mjs, copied here, so a
// rewrite that loses one fails here too.
const AUDIT_CONTRACTS = [
  /report every finding/i,
  /consolidate-hotfixes/i,
  /critical gate/i,
  /honor overrides|vibeflow:allow/i,
  /definition of done|\bdod\b/i,
];

test('the existing audit contracts still match in every edition', () => {
  forEachEdition((content, edition, raw) => {
    for (const contract of AUDIT_CONTRACTS) assert.match(raw, contract, `${edition}: ${contract}`);
  });
});

// ----------------------------------------------------------------- protected

// sha256 of each protected block, taken from the 1.15.0 release with `git show`
// and kept here because the CI checks out with depth 1 and has no history to
// read. A block runs from its first marker to the end of its last.
const PROTECTED = {
  'consolidate-hotfixes intro': ['With `--consolidate-hotfixes` in the input', 'jump to Consolidation mode below.'],
  'Critical Gate catalog, overrides and verdict mapping': ['b. **Match each changed line', 'treat it as an override.'],
  'Critical Gate verdict rule': ['- Any unresolved CRITICAL or HIGH Critical Gate finding', 'written justification.'],
  'hotfix docs line': ['When `.vibeflow/hotfixes/` holds hotfix docs', 'no line.'],
  'consolidation mode': ['## Consolidation mode — `--consolidate-hotfixes`', 'Sections with nothing to list are omitted.'],
};
const SAME_IN_ALL = {
  'consolidate-hotfixes intro': '842eadffe75eef86521d97fa76c7ad4af72a3ead3020709c50f90523e747c5e5',
  'Critical Gate catalog, overrides and verdict mapping': 'f494b97572b9a4ea780d0be40555b81f2849d1affa30dd572a69fa79adb579f8',
  'Critical Gate verdict rule': 'dca100f57b2b1ee4f3d11a81f43d401b229a860d4f0a5f6488f8f02b864a6dd1',
  'consolidation mode': 'afbcb932c561bc47f51242dddf75ab29fecaba849fdd3bed2c1665e56f826d0f',
};
const BASE_HASHES = {
  shared: { ...SAME_IN_ALL, 'hotfix docs line': '82219c5fad79e2397427b556c9c46e180e550bffb7b34388234cc901465166dd' },
  cursor: { ...SAME_IN_ALL, 'hotfix docs line': 'b24ab1a17445a54707d39783f56c3f98185d69ffa162cd04fb2f87d59965d728' },
  copilot: { ...SAME_IN_ALL, 'hotfix docs line': 'c0813af2c89600a113c9ac7f060432de96b3fb462f3cf10d16e4951dc06c4aba' },
};

test('the Critical Gate catalog, its verdict mapping and --consolidate-hotfixes are byte-identical to the 1.15.0 release', () => {
  forEachEdition((content, edition, raw) => {
    for (const [name, [start, end]] of Object.entries(PROTECTED)) {
      const from = raw.indexOf(start);
      assert.ok(from !== -1, `${edition}: block "${name}" starts`);
      assert.equal(raw.indexOf(start, from + 1), -1, `${edition}: block "${name}" starts once`);
      const to = raw.indexOf(end, from);
      assert.ok(to !== -1, `${edition}: block "${name}" ends`);
      const hash = createHash('sha256').update(raw.slice(from, to + end.length)).digest('hex');
      assert.equal(hash, BASE_HASHES[edition][name], `${edition}: block "${name}" changed since the 1.15.0 release`);
    }
  });
});

test('the shared audit stays under 500 lines', () => {
  assert.ok(read(EDITIONS.shared).split('\n').length < 500);
});
