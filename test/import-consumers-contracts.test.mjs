// Contracts of the consumers of `teach --from`: gen-spec picks imported
// entries from each source's registry, analyze leaves the imported folders and
// the sources block alone and checks the disk against the index, and audit
// cites the source of an imported document it finds a deviation from. Each
// assertion pins a literal of that contract (a heading, a marker, a field
// name, a glob), in the three editions, so a weaker wording in one of them
// fails here instead of drifting silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// The paragraph that starts with a given literal, up to the next blank line.
function paragraph(content, start) {
  const at = content.indexOf(start);
  if (at === -1) return '';
  const end = content.indexOf('\n\n', at);
  return content.slice(at, end === -1 ? undefined : end);
}

// The raw text from one literal up to the next occurrence of another. Used
// where a section holds a fenced template whose own headings would cut
// section() short. Empty when either literal is absent.
function between(content, from, to) {
  const start = content.indexOf(from);
  if (start === -1) return '';
  const end = content.indexOf(to, start + from.length);
  return end === -1 ? '' : content.slice(start, end);
}

// The first fenced block after a heading.
function fenceAfter(content, heading) {
  const at = content.indexOf(heading);
  if (at === -1) return '';
  const match = /```[^\n]*\n([\s\S]*?)\n```/.exec(content.slice(at));
  return match ? match[1] : '';
}

const flat = (text) => text.replace(/\s+/g, ' ');

function forEachEdition(workflow, run) {
  for (const [edition, path] of Object.entries(editions(workflow))) {
    const raw = read(path);
    run(flat(raw), `${edition}/${workflow}`, raw);
  }
}

// The line gen-spec writes in Applicable Patterns for an imported entry (I4).
const IMPORTED_LINE =
  '- patterns/external-<repo-name>/<entry-name>.md — imported from <repo-name> (<source_file> @ <sha7>): <why it applies';

test('gen-spec picks imported entries from each source registry, after planning the files', () => {
  forEachEdition('gen-spec', (content, label, raw) => {
    const before = flat(section(raw, '## Before writing the spec'));
    assert.ok(before, `${label}: ## Before writing the spec section`);
    assert.match(before, /`## Imported Sources`/, `${label}: reads the Imported Sources block`);
    assert.match(before, /vibeflow:sources:start/, `${label}: names the sources markers`);
    assert.match(before, /`patterns\/external-<repo-name>\/registry\.md`/, `${label}: opens each source registry`);
    assert.match(before, /`kind` `pattern` or `convention`/, `${label}: only pattern and convention entries`);
    assert.match(before, /`workflow`[^.]*never chosen/i, `${label}: a workflow entry is never chosen`);
    assert.match(before, /glob in its `paths` matches the path of a planned file, whether that file exists yet or not/i,
      `${label}: (a) a paths glob matches a planned file, existing or not`);
    assert.match(before, /no `paths`[^.]*`tags` or `description` match the feature's subject/i,
      `${label}: (b) without paths, tags or description match the subject`);
    assert.match(before, /No `## Imported Sources` block[^.]*nothing (else )?changes/i,
      `${label}: without the block the selection is today's`);

    // The choice happens after the files are planned (step 3).
    const planned = before.indexOf('files the feature creates or changes');
    const choice = before.indexOf('never chosen');
    assert.ok(planned !== -1 && choice > planned, `${label}: the imported entries are picked after the files are planned`);
  });
});

test('gen-spec lists every applicable imported entry outside the 3–5 cut, the imported rule as the norm', () => {
  const lines = [];
  forEachEdition('gen-spec', (content, label, raw) => {
    const spec = section(raw, '## The spec');
    const at = spec.indexOf(IMPORTED_LINE);
    assert.ok(at !== -1, `${label}: the imported line format in The spec`);
    lines.push(spec.slice(at, spec.indexOf('\n', at)));
    const flatSpec = flat(spec);
    assert.match(flatSpec, /outside the 3[–-]5 cut/i, `${label}: imported entries sit outside the 3–5 cut`);
    assert.match(flatSpec, /imported rule is the norm[^.]*local[^.]*example/i,
      `${label}: the imported rule is the norm, the local pattern the example`);
    assert.match(flatSpec, /divergence[^.]*`?Technical Decisions/i, `${label}: the divergence goes to Technical Decisions`);
    assert.match(flat(section(raw, '## Before writing the spec')), /outside the 3[–-]5 cut/i,
      `${label}: the cut is named where the choice happens`);
  });
  assert.equal(new Set(lines).size, 1, 'the imported line is the same text in the three editions');
});

test('gen-spec still only reads', () => {
  const raw = read(editions('gen-spec').shared);
  assert.match(raw, /^allowed-tools: Read, Grep, Glob, WebSearch, WebFetch$/m, 'shared/gen-spec: allowed-tools unchanged');
});

test('analyze leaves imported sources as they are in every mode that writes', () => {
  forEachEdition('analyze', (content, label, raw) => {
    assert.doesNotMatch(content, /Imported pattern protection/, `${label}: the same-name skip is gone`);
    assert.doesNotMatch(content, /imported version exists/i, `${label}: no skip log line`);
    assert.doesNotMatch(content, /ignore existing `\.vibeflow\/`\./, `${label}: --fresh no longer ignores everything`);

    const rule = flat(paragraph(raw, '**Imported sources.**'));
    assert.ok(rule, `${label}: an Imported sources rule in Phase 0`);
    assert.match(rule, /incremental, `--fresh`, `--scope` and `--satellite`/, `${label}: every mode that writes`);
    assert.match(rule, /`patterns\/external-\*\/`/, `${label}: the imported folders`);
    assert.match(rule, /`<!-- vibeflow:sources:start -->`/, `${label}: the sources block markers`);
    assert.match(rule, /`teach --from`/, `${label}: they belong to teach --from`);
    assert.match(rule, /`--fresh`[^.]*rebuilds everything else/i, `${label}: --fresh rebuilds everything else`);
    assert.ok(raw.indexOf('**Imported sources.**') < raw.indexOf('## Phase 1:'), `${label}: the rule lives in Phase 0`);

    const satellite = flat(section(raw, '## Satellite analysis mode (`--satellite <url>`)'));
    assert.match(satellite, /`patterns\/external-\*\/`/, `${label}: satellite leaves the imported folders alone`);
  });
});

test('analyze builds the Pattern Registry and Pattern Docs Available from the root docs only', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const generation = flat(paragraph(raw, '**Pattern Registry generation.**'));
    assert.match(generation, /only[^.]*`patterns\/\*\.md` at the root/i, `${label}: registry from root docs only`);
    assert.match(generation, /`patterns\/external-\*\/`[^.]*`## Imported Sources`/,
      `${label}: imported docs are indexed through Imported Sources, not the registry`);

    const template = fenceAfter(raw, '### index.md format');
    const order = ['## Pattern Registry', '## Imported Sources', '<!-- vibeflow:sources:start -->',
      '<!-- vibeflow:sources:end -->', '## Pattern Docs Available'].map((s) => template.indexOf(s));
    assert.ok(order.every((i, k) => i !== -1 && (k === 0 || i > order[k - 1])),
      `${label}: the index.md template keeps Imported Sources between the registry and the docs list`);
    assert.match(template, /## Pattern Docs Available\n<list each local `?\.vibeflow\/patterns\/\*\.md`? at the root/,
      `${label}: Pattern Docs Available lists only the local docs`);

    const scoped = flat(between(raw, '## Scoped analysis mode (`--scope <path>`)', '## Satellite analysis mode'));
    assert.doesNotMatch(scoped, /from all pattern doc frontmatters/i, `${label}: scope no longer reads every doc`);
    assert.match(scoped, /`patterns\/\*\.md` at the root/, `${label}: scope regenerates from root docs`);
  });
});

test('analyze closes every writing mode with a disk check against the index', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const check = flat(paragraph(raw, '**Disk check against the index.**'));
    assert.ok(check, `${label}: a disk check paragraph`);
    assert.match(check, /every `patterns\/\*\.md` at the root[^.;]*Pattern Registry/i, `${label}: local docs in the registry`);
    assert.match(check, /every `patterns\/external-\*\/` folder[^.;]*`vibeflow:sources`/i, `${label}: each folder in the sources block`);
    assert.match(check, /every `\.md` in it except `registry\.md`[^.;]*registry/i, `${label}: each imported doc in its registry`);
    assert.match(check, /never indexed/i, `${label}: catches a local doc created and never indexed`);
    assert.match(check, /with the file/i, `${label}: a divergence names the file`);
    assert.match(check, /without fixing[^.]*`teach`/i, `${label}: never fixes what belongs to teach`);

    const phase4 = between(raw, '## Phase 4: Compile', '## Phase 5:');
    assert.ok(phase4.includes('**Disk check against the index.**'), `${label}: the check closes Phase 4`);
    const scoped = flat(between(raw, '## Scoped analysis mode (`--scope <path>`)', '## Satellite analysis mode'));
    assert.match(scoped, /disk check against the index/i, `${label}: --scope runs the check`);
    assert.match(flat(section(raw, '### Report')), /disk check/i, `${label}: scoped report carries the result`);
    assert.match(flat(section(raw, '## After saving, report to the user:')), /disk check/i,
      `${label}: final report carries the result`);
  });
});

test('audit cites the imported document and its source_file on a deviation', () => {
  forEachEdition('audit', (content, label, raw) => {
    const review = flat(paragraph(raw, '**B. Pattern compliance**'));
    assert.match(review, /imported/i, `${label}: pattern compliance covers imported documents`);
    assert.match(review, /`source_file`/, `${label}: the finding names source_file`);
    assert.match(review, /`patterns\/external-<repo-name>\/<entry-name>\.md`/, `${label}: the finding names the document`);

    const output = fenceAfter(raw, '## Output format');
    const compliance = output.slice(output.indexOf('### Pattern Compliance'), output.indexOf('### Convention Violations'));
    assert.match(compliance, /DEVIATION: [^\n]*imported from <repo-name> \(<source_file>\)/,
      `${label}: the report line for an imported deviation cites its source`);
  });
});
