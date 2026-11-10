// Contracts of `teach --from`: what the import writes is read by gen-spec,
// analyze and audit, so the document format (I1), the per-source registry
// (I2) and the sources block in index.md (I3) are pinned literally here, in
// every edition. The assertions pin globs, markers, field names and section
// names, never a whole sentence of prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const EDITIONS = {
  shared: 'plugins/vibeflow/skills/teach/SKILL.md',
  cursor: 'cursor/skills/vibeflow-teach/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-teach.prompt.md',
};

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

// The text under a Markdown heading, up to the next heading of the same or a
// higher level, ignoring headings inside code fences. Empty when absent.
function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return '';
  const level = /^#+/.exec(heading)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*```/.test(lines[i])) inFence = !inFence;
    if (!inFence && new RegExp(`^#{1,${level}}\\s`).test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function fences(text) {
  return [...text.matchAll(/```[^\n]*\n([\s\S]*?)\n\s*```/g)].map((m) => m[1]);
}

function outsideFences(text) {
  return text.replace(/```[^\n]*\n[\s\S]*?\n\s*```/g, '');
}

const flat = (text) => text.replace(/\s+/g, ' ');

function forEachEdition(run) {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const raw = section(read(path), '## Import from external repo');
    run(flat(raw), `${edition}/teach`, raw);
  }
}

const includes = (content, literal, label) =>
  assert.ok(content.includes(literal), `${label}: missing ${literal}`);

test('teach import: the section exists in every edition', () => {
  forEachEdition((content, label) => {
    assert.ok(content.length > 0, `${label}: "## Import from external repo" section`);
  });
});

test('teach import: discovery is mechanical and sees .claude/rules and .claude/knowledge (req. 1)', () => {
  forEachEdition((content, label) => {
    for (const glob of [
      '.claude/rules/**/*.md',
      '.claude/knowledge/**/*.md',
      '.claude/skills/*/SKILL.md',
      '`CLAUDE.md`',
      'knowledge/**/*.md',
      'docs/**/*.md',
      '.cursorrules',
      '.cursor/rules/*.mdc',
      '`AGENTS.md`',
    ]) includes(content, glob, label);
    assert.match(content, /`find /, `${label}: count comes from a find command`);
    assert.match(content, /glob → count/, `${label}: prints the glob → count table`);
    assert.match(content, /\btotal\b/i, `${label}: prints the total`);
  });
});

test('teach import: review has three groups, workflow unchecked, defaults and kind fix (req. 3)', () => {
  forEachEdition((content, label, raw) => {
    for (const heading of ['### Patterns (', '### Conventions (', '### Workflows (']) {
      includes(content, heading, label);
    }
    for (const kind of ['[pattern]', '[convention]', '[workflow]']) includes(content, kind, label);
    assert.match(raw, /\[x\] \d+\. \[pattern\]/, `${label}: pattern lines come checked`);
    assert.match(raw, /\[x\] \d+\. \[convention\]/, `${label}: convention lines come checked`);
    assert.match(raw, /\[ \] \d+\. \[workflow\]/, `${label}: workflow lines come unchecked`);
    includes(content, '`defaults`', label);
    includes(content, '`all`', label);
    includes(content, '`none`', label);
    includes(content, '`7=pattern`', label);
    includes(content, 'mixed', label);
    includes(content, 'source_file', label);
  });
});

test('teach import: I1 document format and deterministic entry name (req. 4, 5)', () => {
  forEachEdition((content, label) => {
    includes(content, '.vibeflow/patterns/external-<repo-name>/<entry-name>.md', label);
    for (const field of [
      'kind: pattern | convention | workflow',
      'modules: []',
      'applies_to: []',
      'confidence: imported',
      'source: <repo-name>',
      'source_file: ',
      'source_ref: ',
      'source_commit: ',
      'imported: YYYY-MM-DD',
      'paths: ',
      'description: ',
    ]) includes(content, field, label);
    includes(content, '# <Pattern|Convention|Workflow>: <title>', label);
    includes(content, '> Imported from <repo-name> (<source_file> @ ', label);
    for (const example of [
      '`.claude/rules/navigation.md` → `rules-navigation`',
      '`.claude/skills/api-client/SKILL.md` → `skills-api-client`',
      '`docs/architecture.md` → `docs-architecture`',
      '`CLAUDE.md` → `claude`',
      '`.cursorrules` → `cursorrules`',
    ]) includes(content, example, label);
    includes(content, 'Previously imported, updating.', label);
    includes(content, 'git -C "$REPO_PATH" rev-parse HEAD', label);
    assert.doesNotMatch(content, /tags: \[external, <repo-name>\]/, `${label}: old external tags gone`);
  });
});

test('teach import: I2 registry and I3 sources block (req. 6)', () => {
  forEachEdition((content, label) => {
    includes(content, '.vibeflow/patterns/external-<repo-name>/registry.md', label);
    includes(content, '# Imported from <repo-name>', label);
    includes(content, '> Source: <source_ref> · commit ', label);
    includes(content, '<!-- vibeflow:imported:start -->', label);
    includes(content, '<!-- vibeflow:imported:end -->', label);
    includes(content, 'entries:', label);
    includes(content, '- file: patterns/external-<repo-name>/<entry-name>.md', label);
    includes(content, '## Imported Sources', label);
    includes(content, '## Pattern Registry', label);
    includes(content, '<!-- vibeflow:sources:start -->', label);
    includes(content, '<!-- vibeflow:sources:end -->', label);
    includes(content, '- external-<repo-name>: `patterns/external-<repo-name>/registry.md` — <N> entries (<p> pattern, <c> convention, <w> workflow)', label);
    includes(content, 'Pattern Docs Available', label);
  });
});

test('teach import: the I2 and I3 templates sit in their own fences', () => {
  forEachEdition((content, label, raw) => {
    const blocks = fences(raw);
    assert.ok(blocks.some((b) => b.includes('<!-- vibeflow:imported:start -->') && b.includes('entries:')),
      `${label}: registry fence`);
    assert.ok(blocks.some((b) => b.startsWith('## Imported Sources') && b.includes('<!-- vibeflow:sources:start -->')),
      `${label}: sources fence`);
    assert.ok(blocks.some((b) => b.startsWith('---\nkind: pattern | convention | workflow')),
      `${label}: I1 frontmatter fence`);
  });
});

test('teach import: never writes to conventions.md (req. 8)', () => {
  forEachEdition((content, label, raw) => {
    for (const block of fences(raw)) {
      assert.ok(!block.includes('## External Conventions'), `${label}: no External Conventions template`);
    }
    assert.match(content, /never writes? to `(\.vibeflow\/)?conventions\.md`/, `${label}: never writes to conventions.md`);
    includes(content, '`kind: convention`', label);
    includes(content, '`## External Conventions: <repo-name>`', label);
    assert.doesNotMatch(flat(outsideFences(raw)), /appended to `\.vibeflow\/conventions\.md`/,
      `${label}: no append to conventions.md`);
  });
});

test('teach import: the report says what is true (req. 9)', () => {
  forEachEdition((content, label) => {
    assert.doesNotMatch(content, /ready to be used by/, `${label}: old "ready to be used" claim gone`);
    includes(content, 'git -C "$REPO_PATH" diff --name-only', label);
    assert.match(content, /gen-spec/, `${label}: names gen-spec`);
  });
});

test('teach import: the templates are identical across editions', () => {
  const blocks = Object.fromEntries(
    Object.entries(EDITIONS).map(([edition, path]) => [
      edition,
      fences(section(read(path), '## Import from external repo')),
    ]),
  );
  assert.deepEqual(blocks.cursor, blocks.shared, 'cursor fences match shared');
  assert.deepEqual(blocks.copilot, blocks.shared, 'copilot fences match shared');
});
