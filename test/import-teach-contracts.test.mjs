// Contracts of `teach --from`: what the import writes is read by gen-spec,
// analyze and audit, so the document format (I1), the per-source registry
// (I2) and the sources block in index.md (I3) are pinned literally here, in
// every edition. The assertions pin globs, markers, field names and section
// names, and short phrases where the risk is in the prose (what the import
// overwrites, writes to conventions.md or deletes); never a whole paragraph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// --- Round 1 fix (amendment of the r1 spec, audit 2) ---------------------

// Sentences of the prose outside code fences, flattened.
const sentences = (raw) => flat(outsideFences(raw)).split(/(?<=[.;:])\s+/);

test('teach import: entry name drops the leading dot of every segment, with the eight examples (I1, D1, D2)', () => {
  forEachEdition((content, label) => {
    for (const example of [
      '`.claude/rules/navigation.md` → `claude-rules-navigation`',
      '`.claude/skills/api-client/SKILL.md` → `claude-skills-api-client`',
      '`.claude/knowledge/x.md` → `claude-knowledge-x`',
      '`knowledge/x.md` → `knowledge-x`',
      '`docs/architecture.md` → `docs-architecture`',
      '`CLAUDE.md` → `claude`',
      '`.cursorrules` → `cursorrules`',
      '`.cursor/rules/x.mdc` → `cursor-rules-x`',
    ]) includes(content, example, label);
    assert.doesNotMatch(content, /drop the `\.claude\/` prefix/, `${label}: old prefix rule gone`);
    assert.match(content, /leading dot of every (path )?segment/, `${label}: the rule drops leading dots`);
    assert.match(content, /No name starts with a dot/, `${label}: no hidden file`);
  });
});

test('teach import: two selected items on the same entry name stop the import before any write (I1, D1)', () => {
  forEachEdition((content, label) => {
    assert.match(content, /two selected items land on the same `<entry-name>`/,
      `${label}: the collision inside one import is named`);
    assert.match(content, /stop before writing any file/, `${label}: the import stops before writing`);
    assert.match(content, /shows? both source paths/, `${label}: both paths are shown`);
    assert.match(content, /never overwrites one item with another within the same import/,
      `${label}: never overwrites within one import`);
  });
});

test('teach import: alwaysApply is kept from a .mdc and carried to the registry (I1 amendment)', () => {
  forEachEdition((content, label, raw) => {
    const blocks = fences(raw);
    const i1 = blocks.find((b) => b.startsWith('---\nkind: pattern | convention | workflow'));
    assert.ok(i1 && /^alwaysApply: /m.test(i1), `${label}: I1 frontmatter has alwaysApply`);
    const registry = blocks.find((b) => b.includes('<!-- vibeflow:imported:start -->'));
    assert.ok(registry && /^\s+alwaysApply: true$/m.test(registry), `${label}: registry entry carries alwaysApply`);
    assert.match(content, /`alwaysApply`[^.]*as it came/, `${label}: alwaysApply kept as it came`);
    assert.match(content, /`\.mdc`/, `${label}: read from .mdc`);
  });
});

test('teach import: a document from an earlier version is listed and asked about, never claimed to need a reimport (D3)', () => {
  forEachEdition((content, label) => {
    assert.doesNotMatch(content, /needs? a reimport/, `${label}: the false reimport claim is gone`);
    assert.match(content, /without `kind`[^.]*earlier version/, `${label}: names the earlier version`);
    assert.match(content, /a reimport does not replace (it|them)/, `${label}: says the reimport does not replace it`);
    assert.match(content, /asks whether to remove them/, `${label}: asks before removing`);
    assert.match(content, /[Ww]ithout an answer they stay/, `${label}: without an answer they stay`);
  });
});

test('teach (d): a new pattern on the subject of an imported one is a local example, never an override (D4)', () => {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const label = `${edition}/teach (d)`;
    const d = flat(section(read(path), '### (d) A pattern with no doc yet'));
    assert.ok(d.length > 0, `${label}: section`);
    assert.doesNotMatch(d, /override/i, `${label}: no local override`);
    assert.doesNotMatch(d, /skipping stops here/, `${label}: no skip on an imported subject`);
    assert.match(d, /patterns\/external-\*\//, `${label}: checks the imported documents`);
    assert.match(d, /both will be used/, `${label}: both are used`);
    assert.match(d, /imported one as the rule/, `${label}: imported is the rule`);
    assert.match(d, /local one as the example/, `${label}: local is the example`);
  }
});

// R1: any verb that puts content in conventions.md, in any sentence of the
// import, has to sit in a sentence that says "never".
test('teach import: no sentence writes to conventions.md unless it says never (R1)', () => {
  const write = /\b(add\w*|append\w*|writ\w*|insert\w*|sav\w*|put\w*|merg\w*|replac\w*|updat\w*|cop(y|ies|ied)|mov\w*|stor\w*|record\w*|includ\w*)\b/i;
  forEachEdition((content, label, raw) => {
    const hits = sentences(raw).filter((s) => s.includes('conventions.md'));
    assert.ok(hits.length > 0, `${label}: conventions.md is mentioned`);
    for (const s of hits.filter((x) => write.test(x))) {
      assert.match(s, /\bnever\b/, `${label}: writes to conventions.md: ${s}`);
    }
    assert.match(content, /only write it can make there is removing/, `${label}: the only write is the approved removal`);
  });
});

// R2: no sentence of the import removes, deletes or overwrites a local
// pattern, and the only removal command is the clone's.
test('teach import: no local pattern is deleted, and only the clone is removed (R2)', () => {
  const destroy = /\b(delet\w*|remov\w*|overwrit\w*|replac\w*|rm|clean\w*|discard\w*|drop\w*|keep only|keeps only)\b/i;
  forEachEdition((content, label, raw) => {
    assert.match(content, /never deletes a local pattern/, `${label}: local patterns are never deleted`);
    for (const s of sentences(raw).filter((x) => /\blocal\b/i.test(x) && destroy.test(x))) {
      assert.match(s, /\bnever\b|nothing to clean up/, `${label}: touches a local file: ${s}`);
    }
    for (const s of sentences(raw).filter((x) => /\bdelet\w*/i.test(x))) {
      assert.match(s, /\bnever\b/, `${label}: a delete instruction: ${s}`);
    }
    const removals = [...content.matchAll(/`(rm [^`]*)`/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(removals)].filter((c) => c !== 'rm -rf'), ['rm -rf "$REPO_PATH"'],
      `${label}: the clone is the only thing removed by command`);
    assert.match(content, /local path[^.]*nothing to clean up/, `${label}: a local --from path is never cleaned up`);
  });
});

// B1: the source table itself lists every glob, not only the printed template.
test('teach import: the source table lists every glob (B1)', () => {
  forEachEdition((content, label, raw) => {
    const table = [...raw.matchAll(/^\|[^|\n]+\|\s*`([^`]+)`\s*\|\s*$/gm)].map((m) => m[1]);
    assert.deepEqual(table, [
      '.claude/skills/*/SKILL.md',
      '.claude/rules/**/*.md',
      '.claude/knowledge/**/*.md',
      'CLAUDE.md',
      'knowledge/**/*.md',
      'docs/**/*.md',
      '.cursorrules',
      '.cursor/rules/*.mdc',
      'AGENTS.md',
    ], `${label}: source table`);
  });
});

test('teach import: the prose keeps workflow unchecked, saves it as workflow, one copy, one line per source (B2-B7)', () => {
  forEachEdition((content, label) => {
    assert.match(content, /`workflow` lines unchecked/, `${label}: B2 workflow unchecked in the prose`);
    assert.doesNotMatch(content, /[Aa]ll lines come checked/, `${label}: B2`);
    assert.match(content, /One line per source, never one per document/, `${label}: B3`);
    assert.match(content, /never a second copy/, `${label}: B4`);
    assert.match(content, /every `\.md` in that folder except `registry\.md`/, `${label}: B5 whole folder`);
    assert.match(content, /documents kept from earlier imports included/, `${label}: B5 earlier documents`);
    assert.match(content, /A selected `workflow` is saved with `kind: workflow`/, `${label}: B6`);
    assert.match(content, /outside any git repository it is `none`/, `${label}: B7`);
  });
});

test('teach import: a local source inside another repository records that repository\'s commit and says so (B12)', () => {
  forEachEdition((content, label) => {
    includes(content, 'git -C "$REPO_PATH" rev-parse --show-toplevel', label);
    assert.match(content, /inside another git repository[^.]*commit of (that|the containing) repository/,
      `${label}: source_commit is the containing repository's`);
    assert.match(content, /the report says (so|the commit is the containing repository's)/, `${label}: the report says so`);
  });
});

test('teach import: the conventions.md promise names the one approved removal (B10)', () => {
  forEachEdition((content, label) => {
    assert.match(content, /never writes to `\.vibeflow\/conventions\.md`/, `${label}: never writes`);
    assert.match(content, /removing the `## External Conventions: <repo-name>` section[^.]*approves/,
      `${label}: the only write is the removal the person approves`);
  });
});

// B9: every example count command, run on a fixture with nested files and
// symbolic links, finds exactly what its table glob matches; .cursor/rules has
// its own example, first level only.
test('teach import: example count commands match their glob, symlinks and first level included (B9)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'vf-teach-count-'));
  try {
    const files = [
      '.claude/rules/top.md',
      '.claude/rules/area/deep.md',
      '.claude/skills/api-client/SKILL.md',
      '.claude/skills/api-client/nested/SKILL.md',
      '.claude/knowledge/setup.md',
      '.claude/knowledge/team/setup.md',
      'knowledge/team/setup.md',
      'docs/architecture.md',
      '.cursor/rules/style.mdc',
      '.cursor/rules/nested/deep.mdc',
      'outside/target.md',
    ];
    for (const file of files) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), '# x\n');
    }
    symlinkSync(join(repo, 'outside/target.md'), join(repo, '.claude/rules/linked.md'));
    symlinkSync(join(repo, 'outside/target.md'), join(repo, '.cursor/rules/linked.mdc'));
    mkdirSync(join(repo, '.claude/skills/linked-skill'));
    symlinkSync(join(repo, 'outside/target.md'), join(repo, '.claude/skills/linked-skill/SKILL.md'));
    forEachEdition((content, label, raw) => {
      const table = [...raw.matchAll(/^\|[^|\n]+\|\s*`([^`]+)`\s*\|\s*$/gm)].map((m) => m[1]);
      const commands = [...content.matchAll(/`(find "\$REPO_PATH[^`]*)`/g)].map((m) => m[1]);
      const dirs = commands.map((c) => /find "\$REPO_PATH\/([^"]+)"/.exec(c)[1]);
      assert.ok(dirs.includes('.cursor/rules'), `${label}: an example for .cursor/rules/*.mdc`);
      for (const [i, command] of commands.entries()) {
        const glob = table.find((g) => g.startsWith(`${dirs[i]}/`));
        assert.ok(glob, `${label}: a table glob for ${dirs[i]}`);
        const run = spawnSync('sh', ['-c', command], { env: { PATH: process.env.PATH, REPO_PATH: repo } });
        const found = run.stdout.toString().split('\n').filter(Boolean).map((p) => p.slice(repo.length + 1)).sort();
        const want = globSync(glob, { cwd: repo }).sort();
        assert.ok(want.some((p) => /linked/.test(p)), `${label}: fixture has a link under ${glob}`);
        assert.deepEqual(found, want, `${label}: ${command} against ${glob}`);
      }
    });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
