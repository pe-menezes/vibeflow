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
    // (c), amendment of round 1: an entry that loads in every session at its
    // source is always applicable.
    assert.match(before,
      /\(c\) the document's `source_file` is under `\.claude\/rules\/` and the entry has no `paths`, or the entry has `alwaysApply: true`/,
      `${label}: (c) a rule without paths, or alwaysApply: true`);
    assert.match(before, /always applicable/i, `${label}: (c) is always applicable`);

    // A5: without a registry, the fallback reads the local docs only.
    assert.doesNotMatch(before, /fall back to reading all pattern docs/i, `${label}: the fallback no longer reads every doc`);
    assert.match(before,
      /no registry, fall back to reading the local pattern docs only, the `patterns\/\*\.md` at the root and the `patterns\/satellite-\*\/\*\.md`/i,
      `${label}: the fallback reads the root and satellite docs`);
    // S5b: the 3–5 cut never takes in an imported entry.
    for (const s of sentences(before)) {
      if (/top 3[–-]5 matches/.test(s)) assert.doesNotMatch(s, /import/i, `${label}: imported entries inside the cut: "${s}"`);
    }

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
    const line = spec.slice(at, spec.indexOf('\n', at));
    lines.push(line);
    assert.match(line, /<why it applies: the glob that matched and the file, the subject, or always on>`$/,
      `${label}: the line names the criterion, always on included`);
    assert.ok(spec.includes('`Imported entries that apply: <N> (<g> by glob, <s> by subject, <a> always on)`'),
      `${label}: Applicable Patterns counts the imported entries by criterion`);
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

// Sentences of a flattened text. A period inside a path or a file name
// (`index.md`, `.vibeflow/`) is not followed by a space, so it does not split.
function sentences(text) {
  return flat(text).split(/(?<=[.!?])\s+/);
}

// The local docs the Pattern Registry and Pattern Docs Available cover: the
// root and what --satellite merged. Only the imported folders stay out (I5,
// amendment of round 1).
const LOCAL_DOCS = /`(\.vibeflow\/)?patterns\/\*\.md` at the root and `(\.vibeflow\/)?patterns\/satellite-\*\/\*\.md`/;

// Verbs that write to, drop, replace or skip a document.
const WRITES = /\b(delet|remov|wip|eras|clear|discard|overwrit|rewrit|replac|regenerat|rebuil|enrich|add|updat|skip)\w*/i;
const DROPS = /\b(delet|remov|wip|eras|clear|discard|ignor|overwrit)\w*/i;

test('analyze builds the Pattern Registry and Pattern Docs Available from the root and satellite docs, never the imported ones', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const generation = flat(paragraph(raw, '**Pattern Registry generation.**'));
    assert.match(generation, LOCAL_DOCS, `${label}: registry from the root and satellite docs`);
    assert.doesNotMatch(generation, /local docs only/i, `${label}: the registry is no longer root only`);
    assert.match(generation, /Only the docs in `patterns\/external-\*\/` stay out of both/,
      `${label}: only the imported folders stay out`);
    assert.match(generation, /`## Imported Sources` and their own `registry\.md`/,
      `${label}: imported docs are indexed through Imported Sources, not the registry`);
    // S3e: no sentence of the paragraph takes an imported doc into the registry.
    for (const s of sentences(generation)) {
      if (!/external-|imported/i.test(s)) continue;
      assert.doesNotMatch(s, /\b(add|includ|entr|list)\w*/i, `${label}: a registry sentence takes in imported docs: "${s}"`);
    }

    const template = fenceAfter(raw, '### index.md format');
    const order = ['## Pattern Registry', '## Imported Sources', '<!-- vibeflow:sources:start -->',
      '<!-- vibeflow:sources:end -->', '## Pattern Docs Available'].map((s) => template.indexOf(s));
    assert.ok(order.every((i, k) => i !== -1 && (k === 0 || i > order[k - 1])),
      `${label}: the index.md template keeps Imported Sources between the registry and the docs list`);
    const docsLine = template.slice(template.indexOf('## Pattern Docs Available')).split('\n')[1];
    assert.match(docsLine, LOCAL_DOCS, `${label}: Pattern Docs Available lists the root and satellite docs`);
    assert.match(docsLine, /never `patterns\/external-\*\/`/, `${label}: Pattern Docs Available leaves the imported docs out`);

    const structure = fenceAfter(raw, '### The `.vibeflow/` structure');
    const indexLine = structure.split('\n').find((line) => line.includes('index.md'));
    assert.ok(indexLine, `${label}: index.md in the structure`);
    assert.doesNotMatch(indexLine, /list of all pattern docs/i, `${label}: the structure comment no longer claims every doc`);

    const scoped = flat(between(raw, '## Scoped analysis mode (`--scope <path>`)', '## Satellite analysis mode'));
    assert.doesNotMatch(scoped, /from all pattern doc frontmatters/i, `${label}: scope no longer reads every doc`);
    assert.match(scoped, LOCAL_DOCS, `${label}: scope regenerates from the root and satellite docs`);

    const satellite = flat(section(raw, '## Satellite analysis mode (`--satellite <url>`)'));
    assert.match(satellite, /regenerate the `## Pattern Registry` block/, `${label}: satellite indexes what it merged`);

    const phase5 = section(raw, '## Phase 5: Update Index');
    if (phase5) assert.match(flat(phase5), LOCAL_DOCS, `${label}: Phase 5 lists the root and satellite docs`);
  });
});

test('analyze: no mode writes into the imported folders or drops them on --fresh', () => {
  forEachEdition('analyze', (content, label, raw) => {
    // S3a: the decision tree never sends --fresh to drop what .vibeflow/ holds.
    const tree = between(raw, '**Decision tree:**', '**Incremental mode.**');
    assert.ok(tree, `${label}: decision tree`);
    for (const s of sentences(tree)) {
      if (/--fresh/.test(s)) assert.doesNotMatch(s, DROPS, `${label}: --fresh drops docs in the decision tree: "${s}"`);
    }

    // S3b: the --fresh example keeps the imported sources and drops nothing.
    const intro = sentences(raw.slice(0, raw.indexOf('## Phase 0'))).filter((s) => /--fresh/.test(s));
    assert.ok(intro.some((s) => s.includes('except what `teach --from` imported')),
      `${label}: the --fresh example keeps what teach --from imported`);
    for (const s of intro) assert.doesNotMatch(s, DROPS, `${label}: the --fresh example drops docs: "${s}"`);

    // S3d: Step 4 of --scope enriches only a doc at the root.
    const step4 = flat(between(raw, '### Step 4: Pattern enrichment', '### Step 4.5'));
    assert.match(step4, /Only a doc at the root of `patterns\/` counts as a match/, `${label}: Step 4 matches root docs only`);

    // Legacy docs: the rewrite with markers is for local docs.
    const preservation = flat(paragraph(raw, '**Incremental preservation.**'));
    assert.match(preservation, /a doc in `patterns\/external-\*\/` has no markers by design and stays as it is/,
      `${label}: the legacy rewrite leaves the imported docs alone`);

    // S2b, S3d, S3e: no sentence that names the imported folders writes, or
    // skips a local doc because of them.
    for (const s of sentences(raw)) {
      if (!s.includes('patterns/external-')) continue;
      assert.doesNotMatch(s, WRITES, `${label}: a sentence writes into or skips by patterns/external-*/: "${s}"`);
    }
  });
});

test('analyze closes every writing mode with a disk check against the index', () => {
  forEachEdition('analyze', (content, label, raw) => {
    const check = flat(paragraph(raw, '**Disk check against the index.**'));
    assert.ok(check, `${label}: a disk check paragraph`);
    assert.match(check, /every `patterns\/\*\.md` at the root and every `patterns\/satellite-\*\/\*\.md` has an entry in the Pattern Registry/,
      `${label}: root and satellite docs in the registry`);
    // The listing goes through the shell: Glob and Grep respect .gitignore
    // and find an ignored .vibeflow/ empty, so the check would pass on nothing.
    assert.match(check, /`find \.vibeflow\/patterns[^`]*` or `ls`/, `${label}: the disk is listed with find or ls`);
    assert.match(check, /never with Glob or Grep/, `${label}: never with Glob or Grep`);
    assert.match(check, /`\.gitignore`/, `${label}: says why`);
    assert.match(check, /every `patterns\/external-\*\/` folder[^.;]*`vibeflow:sources`/i, `${label}: each folder in the sources block`);
    assert.match(check, /every `\.md` in it except `registry\.md`[^.;]*registry/i, `${label}: each imported doc in its registry`);
    assert.match(check, /never indexed/i, `${label}: catches a local doc created and never indexed`);
    assert.match(check, /with the file/i, `${label}: a divergence names the file`);
    assert.match(check, /without fixing[^.]*`teach`/i, `${label}: never fixes what belongs to teach`);

    // One position, and a true one: its own section after Phase 5, saying
    // where it runs in each mode.
    const heading = raw.indexOf('\n## Disk check against the index\n');
    assert.ok(heading !== -1, `${label}: the check has its own section`);
    assert.ok(heading > raw.lastIndexOf('\n## Phase 5:') && heading < raw.indexOf('## Scoped analysis mode'),
      `${label}: the check sits after Phase 5`);
    assert.equal(raw.split('**Disk check against the index.**').length, 2, `${label}: one disk check paragraph`);
    assert.match(check, /after Phase 5/, `${label}: runs after Phase 5 in a full or incremental run`);
    assert.match(check, /Tests and Pitfalls/, `${label}: runs in the block-only path`);
    assert.match(check, /Step 5 in `--scope`/, `${label}: runs at the end of --scope`);
    assert.match(check, /Step 5 in `--satellite`/, `${label}: runs at the end of --satellite`);
    assert.match(flat(paragraph(raw, '**Incremental mode.**')), /regenerate only the block[^.]*disk check against the index/,
      `${label}: the block-only path says the check runs`);
    assert.match(flat(section(raw, '## Satellite analysis mode (`--satellite <url>`)')), /disk check against the index/i,
      `${label}: --satellite runs the check`);
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
