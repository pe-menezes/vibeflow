// Audit probes for vibeflow-import, part 2 (teach --from). Each probe pins a
// behavior of the import contract (I1 naming, discovery counts, what the
// import may write or delete) in every edition of the teach workflow. Run with
// `node --test test/audit/vibeflow-import-2.probes.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const EDITIONS = {
  shared: 'plugins/vibeflow/skills/teach/SKILL.md',
  cursor: 'cursor/skills/vibeflow-teach/SKILL.md',
  copilot: 'copilot/github/prompts/vibeflow-teach.prompt.md',
};

function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return '';
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*```/.test(lines[i])) inFence = !inFence;
    if (!inFence && /^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

const flat = (text) => text.replace(/\s+/g, ' ');
const outsideFences = (text) => text.replace(/```[^\n]*\n[\s\S]*?\n\s*```/g, '');

function forEachEdition(run) {
  for (const [edition, path] of Object.entries(EDITIONS)) {
    const raw = section(readFileSync(join(ROOT, path), 'utf8'), '## Import from external repo');
    assert.ok(raw.length > 0, `${edition}: import section`);
    run(raw, edition);
  }
}

// The source globs, read from the "| Source | Glob pattern |" table.
function tableGlobs(raw) {
  return [...raw.matchAll(/^\|[^|\n]+\|\s*`([^`]+)`\s*\|\s*$/gm)].map((m) => m[1]);
}

// The I1 entry-name rule, as the teach states it (amendment of round 1): drop
// the `/SKILL.md`, `.md` or `.mdc` suffix, drop the leading dot of every path
// segment, replace `/` with `-`, lowercase.
function entryName(sourceFile) {
  const name = sourceFile.replace(/\/SKILL\.md$/, '').replace(/\.(md|mdc)$/, '');
  return name.split('/').map((segment) => segment.replace(/^\./, '')).join('-').toLowerCase();
}

// One plausible file per glob, plus a nested one for `**` globs.
function samplePaths(glob) {
  const paths = [glob.replace('**/', '').replace('*', 'setup')];
  if (glob.includes('**/')) paths.push(glob.replace('**/', 'team/').replace('*', 'setup'));
  return paths;
}

test('discovery: every example count command finds exactly what its glob matches', () => {
  const repo = mkdtempSync(join(tmpdir(), 'vf-audit-import-'));
  try {
    for (const file of [
      '.claude/rules/top.md',
      '.claude/rules/area/deep.md',
      '.claude/rules/area/more/deeper.md',
      '.claude/rules/notes.txt',
      '.claude/skills/api-client/SKILL.md',
      '.claude/skills/api-client/nested/SKILL.md',
      '.claude/skills/SKILL.md',
      '.claude/knowledge/setup.md',
      '.claude/knowledge/team/setup.md',
      'knowledge/setup.md',
      'knowledge/team/setup.md',
      'docs/architecture.md',
      '.cursor/rules/style.mdc',
    ]) {
      mkdirSync(dirname(join(repo, file)), { recursive: true });
      writeFileSync(join(repo, file), '# x\n');
    }
    forEachEdition((raw, edition) => {
      const globs = tableGlobs(raw);
      assert.ok(globs.length >= 9, `${edition}: source table`);
      const commands = [...flat(raw).matchAll(/`(find "\$REPO_PATH[^`]*)`/g)].map((m) => m[1]);
      assert.ok(commands.length > 0, `${edition}: at least one count command`);
      for (const command of commands) {
        const dir = /find "\$REPO_PATH\/([^"]+)"/.exec(command)[1];
        const glob = globs.find((g) => g.startsWith(`${dir}/`));
        assert.ok(glob, `${edition}: a table glob for ${dir}`);
        const run = spawnSync('sh', ['-c', command], { env: { PATH: process.env.PATH, REPO_PATH: repo } });
        const found = run.stdout.toString().split('\n').filter(Boolean)
          .map((p) => p.slice(repo.length + 1)).sort();
        const want = globSync(glob, { cwd: repo }).sort();
        assert.deepEqual(found, want, `${edition}: ${command} against ${glob}`);
      }
    });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('entry name: two sources the table can find never land on the same file', () => {
  forEachEdition((raw, edition) => {
    const seen = new Map();
    for (const glob of tableGlobs(raw)) {
      for (const path of samplePaths(glob)) {
        const name = entryName(path);
        assert.ok(!seen.has(name), `${edition}: ${path} and ${seen.get(name)} both → ${name}`);
        seen.set(name, path);
      }
    }
  });
});

test('entry name: no source the table can find lands on a hidden file', () => {
  forEachEdition((raw, edition) => {
    for (const glob of tableGlobs(raw)) {
      for (const path of samplePaths(glob)) {
        const name = entryName(path);
        assert.ok(!name.startsWith('.'), `${edition}: ${path} → ${name}.md is a hidden file`);
      }
    }
  });
});

test('entry name: every example the teach prints follows the rule it states', () => {
  forEachEdition((raw, edition) => {
    const at = raw.indexOf('`<entry-name>`');
    const rule = flat(raw.slice(at, raw.indexOf('### Step 4', at)));
    const examples = [...rule.matchAll(/`([^`]+)` → `([^`]+)`/g)];
    assert.ok(examples.length >= 5, `${edition}: entry-name examples`);
    for (const [, from, to] of examples) {
      assert.equal(entryName(from), to, `${edition}: ${from} → ${to} by the stated rule`);
    }
  });
});

test('conventions.md: no sentence of the import writes to it unless it says never', () => {
  const write = /\b(add|adds|added|append\w*|writes?|written|insert\w*|sav(e|es|ed)|put|merg\w*)\b/i;
  forEachEdition((raw, edition) => {
    const sentences = flat(outsideFences(raw)).split(/(?<=[.;])\s+/);
    for (const sentence of sentences.filter((s) => s.includes('conventions.md'))) {
      if (write.test(sentence)) {
        assert.match(sentence, /\bnever\b/, `${edition}: writes to conventions.md: ${sentence}`);
      }
    }
  });
});

test('deletion: the import deletes no local pattern and removes only the clone it made', () => {
  forEachEdition((raw, edition) => {
    const text = flat(raw);
    assert.match(text, /never deletes a local pattern/, `${edition}: local patterns are never deleted`);
    const deletes = [...text.matchAll(/[^.]*\bdelet\w*[^.]*/gi)].map((m) => m[0].trim());
    for (const sentence of deletes) {
      assert.match(sentence, /never deletes a local pattern/, `${edition}: a delete instruction: ${sentence}`);
    }
    const removals = [...text.matchAll(/`(rm [^`]*)`/g)].map((m) => m[1]);
    assert.ok(removals.length > 0, `${edition}: cleanup command`);
    for (const command of removals) {
      assert.ok(command === 'rm -rf "$REPO_PATH"' || command === 'rm -rf',
        `${edition}: removal outside the clone: ${command}`);
    }
    assert.match(text, /local path[^.]*nothing to clean up/, `${edition}: a local --from path is never cleaned up`);
  });
});

// --- Reaudit 1 ------------------------------------------------------------
// The prose outside fences, cut into units (paragraphs, and each bullet on its
// own), every unit cut into clauses at `.`, `;` and `:`. Inside a code span
// those three marks become `_`, so `conventions.md` reads `conventions_md` and
// `## External Conventions: <repo-name>` stays one clause.
function units(raw) {
  const masked = outsideFences(raw).replace(/`[^`]*`/g, (span) => span.replace(/[.;:]/g, '_'));
  return masked.split(/\n\s*\n|\n(?=\s*- )/).map(flat).map((u) => u.trim()).filter(Boolean);
}
const clauses = (unit) => unit.split(/(?<=[.;:])\s+/);

test('reaudit 1, conventions.md: no clause about it writes, overwrites or removes, unless it says never or asks', () => {
  const change = /\b(add\w*|append\w*|writ\w*|overwrit\w*|rewrit\w*|insert\w*|sav(e|es|ed|ing)|put\w*|merg\w*|replac\w*|updat\w*|cop(y|ies|ied)|mov\w*|stor\w*|record\w*|includ\w*|remov\w*|delet\w*|clear\w*|empt\w*|edit\w*|chang\w*|modif\w*|truncat\w*|strip\w*|wip\w*)\b/i;
  forEachEdition((raw, edition) => {
    const about = units(raw).filter((u) => u.includes('conventions_md'));
    assert.ok(about.length >= 2, `${edition}: paragraphs about conventions.md`);
    for (const unit of about) {
      for (const clause of clauses(unit).filter((c) => change.test(c))) {
        assert.match(clause, /\bnever\b|asks whether|approves/, `${edition}: changes conventions.md: ${clause}`);
      }
    }
  });
});

test('reaudit 1, earlier-version documents: removed only on a yes, and only the ones the person named', () => {
  const removal = /\b(remov\w*|delet\w*|clean\w*|clear\w*|empt\w*|wip\w*|overwrit\w*|replac\w*|discard\w*|prun\w*|rm)\b/i;
  forEachEdition((raw, edition) => {
    const about = units(raw).filter((u) => /without `kind`|earlier version/.test(u));
    assert.ok(about.length >= 2, `${edition}: paragraphs about documents of an earlier version`);
    for (const unit of about) {
      for (const clause of clauses(unit).filter((c) => removal.test(c))) {
        assert.match(clause, /\bnever\b|asks whether|does not replace|removes only the documents the person named/,
          `${edition}: removes an earlier-version document: ${clause}`);
      }
    }
    assert.match(flat(raw), /a yes removes only the documents the person named/, `${edition}: the yes is scoped`);
  });
});

test('reaudit 1, local patterns: a local pattern on the subject of an imported one stays, and nothing in that paragraph removes it', () => {
  const removal = /\b(remov\w*|delet\w*|clean\w*|overwrit\w*|replac\w*|discard\w*|drop\w*|wip\w*|rm|keep only|keeps only|which one to keep)\b/i;
  forEachEdition((raw, edition) => {
    const unit = units(raw).find((u) => u.startsWith('**Local patterns are kept.**'));
    assert.ok(unit, `${edition}: the local-patterns paragraph`);
    assert.match(unit, /covers the same subject as an imported document, both stay/, `${edition}: both stay`);
    assert.match(unit, /both will be used/, `${edition}: both are used`);
    for (const clause of clauses(unit).filter((c) => removal.test(c))) {
      assert.match(clause, /\bnever\b/, `${edition}: removes a local pattern: ${clause}`);
    }
  });
});

test('reaudit 1, entry-name guard: nothing in the guard writes one item over another', () => {
  const over = /\b(overwrit\w*|replac\w*)\b|\b(writ\w*|written|sav\w*|copied)\s+over\b|\bin place of\b/i;
  forEachEdition((raw, edition) => {
    const unit = units(raw).find((u) => u.startsWith('Before writing anything'));
    assert.ok(unit, `${edition}: the guard paragraph`);
    for (const clause of clauses(unit).filter((c) => over.test(c))) {
      assert.match(clause, /\bnever\b/, `${edition}: the guard writes over an item: ${clause}`);
    }
  });
});

test('reaudit 1, discovery: the example count commands leave out hidden files and folders, as the glob does', () => {
    const repo = mkdtempSync(join(tmpdir(), 'vf-reaudit-dot-'));
    try {
      for (const file of ['.claude/rules/a.md', '.claude/rules/.hidden.md', '.claude/rules/.private/x.md',
        '.cursor/rules/s.mdc', '.cursor/rules/.h.mdc']) {
        mkdirSync(dirname(join(repo, file)), { recursive: true });
        writeFileSync(join(repo, file), '# x\n');
      }
      forEachEdition((raw, edition) => {
        const globs = tableGlobs(raw);
        for (const command of [...flat(raw).matchAll(/`(find "\$REPO_PATH[^`]*)`/g)].map((m) => m[1])) {
          const dir = /find "\$REPO_PATH\/([^"]+)"/.exec(command)[1];
          if (!['.claude/rules', '.cursor/rules'].includes(dir)) continue;
          const glob = globs.find((g) => g.startsWith(`${dir}/`));
          const run = spawnSync('sh', ['-c', command], { env: { PATH: process.env.PATH, REPO_PATH: repo } });
          const found = run.stdout.toString().split('\n').filter(Boolean).map((p) => p.slice(repo.length + 1)).sort();
          assert.deepEqual(found, globSync(glob, { cwd: repo }).sort(), `${edition}: ${command} against ${glob}`);
        }
      });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
