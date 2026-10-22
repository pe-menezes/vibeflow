// Behavior probes from independent audits of the loop kit's scripts: perimeter, review-package,
// check-briefing --pair, watch-round, check-probes, preflight, watch-pr and the Node version guard. Behavior only,
// pinned by content. Each case states, as comments, the contract it protects, the plausible
// regression that breaks it, and why the implementer's tests did not catch it. A case marked
// `todo` asserts what a known open gap asks for: it runs and prints without failing the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOP_DIR, SCRIPTS_DIR, hermeticEnv, makeSandbox, runScript, withSandbox } from '../loop-helpers.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function scratch(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probes-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function scratchAsync(run) {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-probes-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const write = (dir, name, text) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

const outsideLines = (stdout) => stdout.split('\n').filter((line) => line.startsWith('outside ')).sort();

// --- perimeter.mjs: glob matching ---

// Contract: in a perimeter glob, "**" matches any depth, zero folders included.
// Breaks when: "**/" is translated to exactly one folder.
// Not covered by: the "any depth" test uses a trailing "src/**", and "**/*.md" only with zero or one folder.
test('perimeter: "**/" matches zero folders and several folders', () => {
  withSandbox((box) => {
    box.write('src/x.ts', 'zero folders\n');
    box.write('src/a/b/x.ts', 'two folders\n');
    box.write('src/a/b/y.ts', 'not x.ts\n');
    box.write('docs/deep/er/guide.md', 'three folders\n');
    box.write('README.md', 'top level\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/**/x.ts', '**/*.md'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.deepEqual(outsideLines(result.stdout), ['outside src/a/b/y.ts']);
  });
});

// Contract: a perimeter glob matches the whole path, "?" stays in one folder, and "dir/" covers everything below.
// Breaks when: the end anchor is dropped, "?" becomes ".", or the trailing-slash rule is lost.
// Not covered by: no implementer test has a path that extends a glob's match, crosses a folder with "?", or uses a trailing "/".
test('perimeter: globs are anchored at both ends, "?" stays in one folder, a trailing "/" covers below', () => {
  withSandbox((box) => {
    box.write('src/rules.tsx', 'not a .ts file\n');
    box.write('README.md.bak', 'not README.md\n');
    box.write('a/b', '"?" must not cross a folder\n');
    box.write('axb', 'one character\n');
    box.write('notes/new/x.txt', 'below notes/\n');
    const result = runScript('perimeter.mjs', [box.repo, box.base, 'src/*.ts', 'README.md', 'a?b', 'notes/'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.deepEqual(outsideLines(result.stdout), ['outside README.md.bak', 'outside a/b', 'outside src/rules.tsx']);
  });
});

// Contract: the git commands run at the repository's top level, whatever folder the script is given.
// Breaks when: the top-level lookup is removed, so untracked paths come back relative to the subfolder.
// Not covered by: every implementer test passes the repository root.
test('perimeter: given a subfolder, it reads paths from the repository top level', () => {
  withSandbox((box) => {
    box.write('src/new.ts', 'inside\n');
    box.write('tests/new.test.ts', 'outside\n');
    const result = runScript('perimeter.mjs', [join(box.repo, 'src'), box.base, 'src/**'], box.env());
    assert.equal(result.status, 1, result.out);
    assert.deepEqual(outsideLines(result.stdout), ['outside tests/new.test.ts']);
  });
});

// --- review-package.mjs: what enters the package, the empty case ---

// Contract: a review package is never empty while the round has new files.
// Breaks when: the empty check ignores the untracked files.
// Not covered by: every implementer package test that has new files also has a commit or a tracked change.
test('review-package: a round with only new, uncommitted files is a package, not an empty one', () => {
  withSandbox((box) => {
    box.write('src/new.ts', 'export const fresh = 1\n');
    const out = join(box.root, 'reviews', 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.doesNotMatch(text, /EMPTY PACKAGE/);
    assert.match(text, /^## New file: src\/new\.ts$/m);
    assert.match(text, /^\+export const fresh = 1$/m);
  });
});

// Contract: only the package's own previous copy leaves the package.
// Breaks when: the previous copy is excluded by its base name instead of its path.
// Not covered by: the implementer's previous-copy test has no other file with that name.
test('review-package: a new file that shares the package\'s name stays in the package', () => {
  withSandbox((box) => {
    box.write('notes/package.md', 'a note of the round\n');
    const out = join(box.root, 'reviews', 'package.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(readFileSync(out, 'utf8'), /^## New file: notes\/package\.md$/m);
  });
});

// Contract: the empty case stays exit 1 when the package is written inside the worktree.
// Breaks when: emptiness is computed from the untracked list before the package's own copy is taken out.
// Not covered by: the implementer's previous-copy test always has a tracked change, so it only checks the content.
test('review-package: the previous copy of a package written inside the worktree does not make an empty round look full', () => {
  withSandbox((box) => {
    const out = join(box.repo, 'review.md');
    assert.equal(runScript('review-package.mjs', [box.repo, box.base, out], box.env()).status, 1);
    const second = runScript('review-package.mjs', [box.repo, box.base, out], box.env());
    assert.equal(second.status, 1, second.out);
    assert.match(readFileSync(out, 'utf8'), /EMPTY PACKAGE/);
  });
});

// Contract: review-package names the file the size cap left out under any diff prefix configuration.
// Breaks when: the prefixes are reset by config overrides instead of being set explicitly.
// Not covered by: the implementer's test sets only diff.noprefix and diff.mnemonicPrefix.
test('review-package: names the file it left out under diff.srcPrefix and diff.dstPrefix', () => {
  withSandbox((box) => {
    box.git('config', 'diff.srcPrefix', 'old/');
    box.git('config', 'diff.dstPrefix', 'new/');
    box.write('src/rules.ts', 'export const x = 6\n');
    box.write('src/big.ts', 'const filler = 1\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'track big');
    box.write('src/big.ts', `${'const filler = 2\n'.repeat(400)}`);
    const out = join(box.root, 'capped.md');
    const result = runScript('review-package.mjs', [box.repo, box.base, out, '--max-bytes', '2000'], box.env());
    assert.equal(result.status, 0, result.out);
    const text = readFileSync(out, 'utf8');
    assert.match(text, /^- src\/big\.ts \(\d+ bytes\)$/m, text.slice(0, 600));
    assert.doesNotMatch(text, /^- \? \(/m);
  });
});

// --- review-package.mjs: what looks like a secret, and what .vibeflow/ alone is ---

// Samples are assembled at run time, so no secret scanner flags this file.
const FAKE_DB_URL = `${'post'}${'gres'}://app:${'s3cr3t'}@db:5432/app`;
const FAKE_ACCESS_KEY = `${'AK'}${'IA'}${'FAKEFAKEFAKEFAKE'}`;
const FAKE_PASSWORD = `${'not-a-real-'}${'secret-ABC123'}`;

function packageOf(box, base) {
  const out = join(box.root, 'package.md');
  const result = runScript('review-package.mjs', [box.repo, base, out], box.env());
  return { ...result, text: existsSync(out) ? readFileSync(out, 'utf8') : '' };
}

// Contract: a tracked file diff is withheld when a secret sits on an unchanged line the diff shows as context.
// Breaks when: the detector reads only the added and removed lines of a hunk.
// Not covered by: every implementer secret test puts the secret on an added or removed line.
test('review-package: a tracked file whose unchanged context line looks like a secret stays out whole', () => {
  withSandbox((box) => {
    box.write('src/db.ts', `export const a = 1\nconst url = '${FAKE_DB_URL}'\nexport const b = 2\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'db');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('src/db.ts', `export const a = 1\nconst url = '${FAKE_DB_URL}'\nexport const b = 3\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(FAKE_DB_URL), 'the database URL stays out of the package');
    assert.ok(!result.text.includes('export const b = 3'), 'the whole file diff stays out');
    assert.match(result.text, /^- src\/db\.ts \(\d+ bytes, line 2\)$/m);
  });
});

// Contract: a secret shown anywhere in a tracked file diff keeps that diff out of the package, the hunk header included.
// Breaks when: the hunk header is read only for its line numbers, so the line git prints after it as function context is never checked.
// Not covered by: the implementer's tracked-file tests change lines near the top, where git prints no function context.
test('review-package: a secret on the line git prints as a hunk\'s function context stays out of the package', () => {
  withSandbox((box) => {
    // An env-style file: every line starts with a letter, so git names the line just above the hunk as its context.
    const lines = ['NAME=app', `DATABASE_URL=${FAKE_DB_URL}`, ...Array.from({ length: 18 }, (_, i) => `KEY_${i + 3}=${i + 3}`)];
    box.write('config/app.env', `${lines.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    lines[12] = 'KEY_13=changed';
    box.write('config/app.env', `${lines.join('\n')}\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(FAKE_DB_URL), `the database URL stays out of the package:\n${result.text.match(/^@@.*$/m)?.[0]}`);
  });
});

// Contract: the line WITHHELD names is the file's line, in whichever hunk the secret sits.
// Breaks when: the line counters are not reset at each hunk header, or count from the first hunk only.
// Not covered by: every implementer secret test has a single hunk.
test('review-package: a secret in the second hunk of a file diff is named by its own line', () => {
  withSandbox((box) => {
    const lines = Array.from({ length: 60 }, (_, i) => `export const v${i + 1} = ${i + 1}`);
    box.write('src/many.ts', `${lines.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'many');
    const base = box.git('rev-parse', 'HEAD').trim();
    lines[2] = 'export const v3 = 300';
    lines[49] = `export const v50 = '${FAKE_ACCESS_KEY}'`;
    box.write('src/many.ts', `${lines.join('\n')}\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(FAKE_ACCESS_KEY));
    assert.match(result.text, /^- src\/many\.ts \(\d+ bytes, line 50\)$/m);
  });
});

// Contract: the line WITHHELD names does not depend on the user's diff configuration.
// Breaks when: an empty context line, which diff.suppressBlankEmpty prints without its leading space, is not counted.
// Not covered by: no implementer test sets a diff option that changes how a context line is printed.
test('review-package: under diff.suppressBlankEmpty the WITHHELD line is still the file\'s line', { todo: 'open gap: a blank context line printed without its leading space is not counted, so the line named comes out short' }, () => {
  withSandbox((box) => {
    box.write('src/blank.py', 'a = 0\n\n\nb = 2\n');
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'blank');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('src/blank.py', `a = 1\n\n\nb = 2\nc = '${FAKE_ACCESS_KEY}'\n`);
    box.git('config', 'diff.suppressBlankEmpty', 'true');
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.match(result.text, /^- src\/blank\.py \(\d+ bytes, line 5\)$/m);
  });
});

// Contract: a scratch file with a password line next to an access key leaves whole, the password line included.
// Breaks when: only the matching line (the access key, line 3) is cut out of the file, leaving the password line, whose bare value holding "!" the detector does not name.
// Not covered by: the implementer's new-file secret test has no other credential-like line in the file.
test('review-package: a scratch notes file with a password line and an access key stays out whole', () => {
  withSandbox((box) => {
    const password = `${'not-a-real-'}${'secret!ABC123'}`;
    box.write('local-notes.txt', `scratch notes, never meant for git\nDB_PASSWORD=${password}\nAWS key for the staging box: ${FAKE_ACCESS_KEY}\n`);
    const result = packageOf(box, box.base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(password), 'the password stays out');
    assert.ok(!result.text.includes(FAKE_ACCESS_KEY), 'the access key stays out');
    assert.match(result.text, /^- local-notes\.txt \(\d+ bytes, line 3\)$/m);
  });
});

// Contract: ordinary code that reads a token from a request or from the environment is not withheld.
// Breaks when: the detector is widened to any assignment whose name mentions a token or a key.
// Not covered by: the implementer's clean-package test has only a JavaScript read of process.env.
test('review-package: Python that reads a token from a header or from the environment stays in the package', () => {
  withSandbox((box) => {
    box.write('app/auth.py', 'def auth(request):\n    token = request.headers.get("Authorization")\n    return token\n');
    box.write('app/settings.py', 'import os\nAPI_TOKEN = os.environ["API_TOKEN"]\n');
    const result = packageOf(box, box.base);
    assert.equal(result.status, 0, result.out);
    assert.doesNotMatch(result.text, /WITHHELD/);
    assert.match(result.text, /^\+ {4}token = request\.headers\.get\("Authorization"\)$/m);
    assert.match(result.text, /^\+API_TOKEN = os\.environ\["API_TOKEN"\]$/m);
  });
});

// Contract: a secret git prints as a hunk's function context is named by that hunk's first line in the new file.
// Breaks when: the number is taken from the base side of the hunk header, which differs once an earlier hunk adds lines.
// Not covered by: the implementer's function-context test has one hunk, where both sides start on the same line.
test('review-package: a secret in a later hunk\'s function context is named by the hunk\'s first line in the new file', () => {
  withSandbox((box) => {
    // Comment lines start with "#", so git takes the DATABASE_URL line as the second hunk's context.
    const lines = ['NAME=app', 'PORT=80', ...Array.from({ length: 12 }, (_, i) => `# note ${i + 3}`), `DATABASE_URL=${FAKE_DB_URL}`, ...Array.from({ length: 25 }, (_, i) => `# note ${i + 16}`)];
    box.write('config/app.env', `${lines.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    lines[29] = '# note 30, changed';
    lines.splice(1, 0, 'EXTRA=1');
    box.write('config/app.env', `${lines.join('\n')}\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(FAKE_DB_URL), 'the database URL stays out of the package');
    assert.match(result.text, /^- config\/app\.env \(\d+ bytes, line 21\)$/m, result.text.slice(0, 600));
  });
});

// Contract: a name that looks like a secret set to a literal value is withheld whatever line ending the file uses.
// Breaks when: the end of the value is matched only before "\n" or the end of the text, so the "\r" of a CRLF line hides it.
// Not covered by: no other probe; the implementer's CRLF test checks the same new and tracked files with its own sample.
test('review-package: a password line in a file with CRLF line endings stays out of the package', () => {
  withSandbox((box) => {
    box.write('config/app.env', `DEBUG=1\r\nDB_PASSWORD=${FAKE_PASSWORD}\r\nPORT=80\r\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    box.write('config/app.env', `DEBUG=1\r\nDB_PASSWORD=${FAKE_PASSWORD}\r\nPORT=81\r\n`);
    box.write('.env', `DEBUG=1\r\nDB_PASSWORD=${FAKE_PASSWORD}\r\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(FAKE_PASSWORD), 'the password stays out');
    assert.match(result.text, /^- \.env \(\d+ bytes, line 2\)$/m, 'a new file');
    assert.match(result.text, /^- config\/app\.env \(\d+ bytes, line 2\)$/m, 'a tracked file');
  });
});

// Contract: no part of a secret on a hunk's function context line reaches the package, however long the line.
// Breaks when: only the text git prints is checked, and git cuts the function context at 80 bytes, before the secret is complete.
// Not covered by: the function-context tests use a short line, which git prints whole.
test('review-package: a long secret line that git cuts short as a hunk\'s function context leaves no part of the secret in the package', () => {
  withSandbox((box) => {
    const password = `${'Very-Long-Pass'}${'word-Value-1234567890abcdefghijklmnop'}`;
    const url = `${'post'}${'gres'}://application_user:${password}@db.internal:5432/app`;
    const lines = ['NAME=app', `DATABASE_URL=${url}`, ...Array.from({ length: 18 }, (_, i) => `KEY_${i + 3}=${i + 3}`)];
    box.write('config/app.env', `${lines.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'config');
    const base = box.git('rev-parse', 'HEAD').trim();
    lines[12] = 'KEY_13=changed';
    box.write('config/app.env', `${lines.join('\n')}\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(password.slice(0, 16)), `no part of the password in the package:\n${result.text.match(/^@@.*$/m)?.[0]}`);
  });
});

// Contract: every hunk of a tracked file diff is read for secrets, whatever characters its function context line holds.
// Breaks when: the hunk header pattern stops at a carriage return inside that line, so the header is not seen and the hunk below goes unread.
// Not covered by: the implementer's hunk headers carry plain text or no function context at all.
test('review-package: a carriage return inside a hunk\'s function context line does not stop the hunk from being read', () => {
  withSandbox((box) => {
    const lines = ['title = "a\rb"', ...Array.from({ length: 14 }, (_, i) => `# filler ${i + 2}`), 'x = 1'];
    box.write('src/doc.py', `${lines.join('\n')}\n`);
    box.git('add', '-A');
    box.git('commit', '-q', '-m', 'doc');
    const base = box.git('rev-parse', 'HEAD').trim();
    lines[15] = `x = '${FAKE_ACCESS_KEY}'`;
    box.write('src/doc.py', `${lines.join('\n')}\n`);
    const result = packageOf(box, base);
    assert.equal(result.status, 0, result.out);
    assert.ok(!result.text.includes(FAKE_ACCESS_KEY), 'the access key on the added line stays out');
    assert.match(result.text, /^- src\/doc\.py \(\d+ bytes, line 16\)$/m);
  });
});

// Contract: the exception for an empty or boolean value covers the whole value only; a literal that merely begins with true, null, none or undefined is still withheld.
// Breaks when: the exception stops checking what follows the word, so every value that begins with one of those words passes as empty.
// Not covered by: the implementer's not-a-secret list holds the bare words and paths only, and none of its secret samples begins with one of those words.
test('review-package: a value that only begins with true, null, none or undefined is still withheld', () => {
  withSandbox((box) => {
    const samples = {
      'keys/a.env': `${'API_KEY'}=${'true'}${'Blue2024x'}`,
      'keys/b.yml': `${'pass'}${'word'}: "${'null'}${'able-secret-1'}"`,
      'keys/c.env': `${'SECRET_KEY'}=${'None'}${'Such_42abc'}`,
      'keys/d.yml': `${'api_token'}: ${'undefined'}${'_k9X2mQ7'}`,
    };
    for (const [path, line] of Object.entries(samples)) box.write(path, `${line}\n`);
    const result = packageOf(box, box.base);
    assert.equal(result.status, 0, result.out);
    for (const [path, line] of Object.entries(samples)) {
      const value = line.split(/[=:] ?/).pop();
      assert.ok(!result.text.includes(value), `${path}: the value stays out`);
      assert.match(result.text, new RegExp(`^- ${path.replace('.', '\\.')} \\(\\d+ bytes, line 1\\)$`, 'm'), path);
    }
  });
});

// Contract: a quoted literal passes as empty or boolean only when the quotes hold that word and nothing else.
// Breaks when: the exception reads the word and then accepts any character outside the bare-value set, so "!", "." or "&" after it ends the check.
// Not covered by: the implementer's test of these quoted values writes each one alone on a file's first line; here the value sits under a key, on line 2.
test('review-package: a quoted password that begins with true, none or null and goes on with punctuation is withheld', () => {
  withSandbox((box) => {
    const samples = {
      'conf/a.yml': `${'True'}${'!Love2024'}`,
      'conf/b.yml': `${'None'}${'.Of.Your.Business'}`,
      'conf/c.yml': `${'null'}${'&void#Secret9'}`,
    };
    for (const [path, value] of Object.entries(samples)) box.write(path, `db:\n  ${'pass'}${'word'}: "${value}"\n`);
    const result = packageOf(box, box.base);
    assert.equal(result.status, 0, result.out);
    for (const [path, value] of Object.entries(samples)) {
      assert.ok(!result.text.includes(value), `${path}: the password stays out`);
      assert.match(result.text, new RegExp(`^- ${path.replace('.', '\\.')} \\(\\d+ bytes, line 2\\)$`, 'm'), path);
    }
  });
});

// Contract: a long line of names that look like a secret, with or without "=", costs time in proportion to its length.
// Breaks when: the characters after the word, or the bare value, lose their ceiling, so each name scans the rest of the line again.
// Not covered by: the implementer's time test uses a line and a hex file with no word the detector looks for.
test('review-package: a long line of repeated secret-like names ends well within the time limit', () => {
  withSandbox((box) => {
    const dotted = `${'tok'}${'en.'}`.repeat(50_000);
    const assigned = `${'tok'}${'en='}`.repeat(50_000);
    box.write('build/names.txt', `${dotted}\n${assigned}!\n`);
    const out = join(box.root, 'package.md');
    const result = spawnSync(process.execPath, [join(SCRIPTS_DIR, 'review-package.mjs'), box.repo, box.base, out, '--max-bytes', '2000000'], {
      env: box.env(), encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL',
    });
    assert.equal(result.signal, null, 'review-package ends within the limit');
    assert.equal(result.status, 0, result.stderr);
    const text = readFileSync(out, 'utf8');
    assert.doesNotMatch(text, /WITHHELD/);
    assert.ok(text.includes(`+${dotted}\n`), 'the file is in the package');
  });
});

// Contract: a database URL is withheld with a user name and a password of up to 256 characters each, the same ceiling as a literal value of the name rule.
// Breaks when: the ceiling that keeps the URL rule linear on a long line is set below the length of real generated credentials, so a password of a few dozen characters reaches the package.
// Not covered by: every database URL the implementer's tests withhold has a six-character password, and the URL time test checks only that a long line ends in time.
test('review-package: a database URL with a long generated user name or password is withheld', () => {
  withSandbox((box) => {
    const scheme = `${'post'}${'gres'}://`;
    const samples = {
      'config/a.env': { user: `${'svc_'}${'u'.repeat(59)}`, password: `${'Gen3rated'}${'Pw'}${'a1B2c3D4'.repeat(7)}-x` },
      'config/b.env': { user: 'app', password: `${'Long'}${'Pass'}${'Q9w8E7r6'.repeat(31)}` },
      'config/c.env': { user: `${'iam_'}${'n'.repeat(252)}`, password: `${'Short'}${'Pw-'}${'k4m2'}` },
    };
    for (const [path, { user, password }] of Object.entries(samples)) {
      box.write(path, `DATABASE_URL=${scheme}${user}:${password}@db.internal:5432/app\n`);
    }
    const result = packageOf(box, box.base);
    assert.equal(result.status, 0, result.out);
    for (const [path, { user, password }] of Object.entries(samples)) {
      assert.ok(user.length <= 256 && password.length <= 256, `${path}: the sample stays within the ceiling`);
      assert.ok(!result.text.includes(password), `${path}: the password stays out`);
      assert.match(result.text, new RegExp(`^- ${path.replace('.', '\\.')} \\(\\d+ bytes, line 1\\)$`, 'm'), path);
    }
  });
});

// Contract: only the top-level .vibeflow/ folder is set aside; a deleted file, a staged file, a look-alike name or a nested folder is a change.
// Breaks when: the .vibeflow/ test drops the slash, or matches the folder at any depth, or the empty check reads only untracked files.
// Not covered by: the implementer's .vibeflow/ tests change files only under the top-level .vibeflow/ or in src/ by an edit.
test('review-package: next to a new spec, a deleted file, a staged new file, .vibeflowrc and a nested .vibeflow/ each count as a change', () => {
  const cases = {
    'a deleted file': (box) => box.git('rm', '-q', 'src/rules.ts'),
    'a staged new file': (box) => {
      box.write('src/staged.ts', 'export const s = 1\n');
      box.git('add', 'src/staged.ts');
    },
    'a top-level .vibeflowrc': (box) => box.write('.vibeflowrc', 'settings\n'),
    'a nested pkg/.vibeflow/ folder': (box) => box.write('pkg/.vibeflow/specs/a.md', 'nested\n'),
  };
  for (const [name, change] of Object.entries(cases)) {
    withSandbox((box) => {
      box.write('.vibeflow/specs/rules.md', 'a new spec\n');
      change(box);
      const result = packageOf(box, box.base);
      assert.equal(result.status, 0, `${name}: ${result.out}`);
      assert.doesNotMatch(result.text, /EMPTY PACKAGE/, name);
    });
  }
});

// --- check-briefing.mjs --pair: criterion matching ---

const executorBriefing = ({ asked = 'Port the rules.', done = '* DoD 1: the rules load from the file' } = {}) => `# feature · rules · executor

## Asked
${asked}

## Done when
${done}

## Read first
* project knowledge: \`.vibeflow/index.md\`

## Facts
* the suite passes 13 of 13 (measured 08:13 by \`node --test\`)

## Perimeter
* may change: \`src/**\`

## Verification contract
* red before green

## Ceiling
* 400k tokens

## Progress and delivery
* progress file
`;

const auditorWith = (body, review = 'feature-rules-round-0') => `# feature · rules · auditor

${body}

## Review package
* \`.vibeflow/reviews/${review}.md\`

## Facts
* base is 1a2b3c4 (measured 08:15 by \`git rev-parse\`)

## Risk and sabotage
* none

## Probes
* behavior only

## Ceiling
* partial report

## Delivery
* report
`;

const auditorBriefing = (criteria) => auditorWith(`## What to audit
The rules port.

## Criteria
${criteria}

## Read first
* \`.vibeflow/index.md\``);

function pair(dir, executorText, auditorText) {
  const executor = write(dir, 'feature-rules-executor.md', executorText);
  const auditor = write(dir, 'feature-rules-auditor.md', auditorText);
  return runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
}

// Contract: --pair counts an auditor criterion only when it is in the executor's "Done when".
// Breaks when: the whole executor briefing is searched for the criterion.
// Not covered by: every implementer fixture names its criteria only under "Done when".
test('check-briefing --pair: counts a criterion only when it is in "Done when", not elsewhere in the executor briefing', () => {
  scratch((dir) => {
    const both = pair(dir, executorBriefing({ done: '* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused' }),
      auditorBriefing('* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused'));
    assert.equal(both.status, 0, both.out);

    const elsewhere = pair(dir, executorBriefing({ asked: 'Port the rules. DoD 2: a malformed file is refused' }),
      auditorBriefing('* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused'));
    assert.equal(elsewhere.status, 1, elsewhere.out);
    assert.match(elsewhere.stdout, /not in the executor's "Done when": DoD 2: a malformed file is refused/);
  });
});

// Contract: --pair never reads ok against an executor briefing with nothing to compare.
// Breaks when: an executor "Done when" without items is taken as ok.
// Not covered by: no implementer fixture has an executor briefing without "Done when" items.
test('check-briefing --pair: an executor briefing with an empty "Done when" is not ok', () => {
  scratch((dir) => {
    const result = pair(dir, executorBriefing({ done: '' }), auditorBriefing('* DoD 1: the rules load from the file'));
    assert.equal(result.status, 1, result.out);
    assert.doesNotMatch(result.stdout, /^\[ok\]/m);
  });
});

// Contract: --pair compares every auditor criterion, including the ones under a sub-heading of "Criteria".
// Breaks when: any heading ends the "Criteria" section.
// Not covered by: the implementer fixtures keep "Criteria" flat.
test('check-briefing --pair: compares the criteria grouped under a sub-heading of "Criteria"', () => {
  scratch((dir) => {
    const result = pair(dir, executorBriefing(),
      auditorBriefing('* DoD 1: the rules load from the file\n\n### From the risks\n* DoD 2: a malformed file is refused'));
    assert.equal(result.status, 1, result.out);
    assert.doesNotMatch(result.stdout, /^\[ok\] all \d+ auditor criteria/m);
    assert.match(result.stdout, /not in the executor's "Done when": DoD 2: a malformed file is refused/);
  });
});

const EXECUTOR = executorBriefing({ done: '* DoD 1: the rules load from the file\n* DoD 2: a malformed file is refused' });

// Contract: a "Criteria" section ends at its own heading level, whatever that level is.
// Breaks when: the section end is fixed at level 2 instead of the level it opened at.
// Not covered by: every implementer fixture opens "Criteria" and "Done when" at "##".
test('check-briefing --pair: a "Criteria" section opened at ### runs through its #### sub-headings and ends at the next ###', () => {
  scratch((dir) => {
    const executor = write(dir, 'feature-rules-executor.md', EXECUTOR);
    const auditor = write(dir, 'feature-rules-auditor.md', auditorWith([
      '## What to audit', 'The rules port.', '',
      '### Criteria', '* DoD 1: the rules load from the file', '',
      '#### From the risks', '* DoD 3: the cache expires at midnight', '',
      '### Read first', '* `.vibeflow/index.md`', '* the spec of the cache',
    ].join('\n'), 'feature-rules-round-1'));
    const result = runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
    assert.equal(result.status, 1, result.out);
    assert.match(result.stdout, /not in the executor's "Done when": DoD 3: the cache expires at midnight/);
    assert.doesNotMatch(result.stdout, /not in the executor's "Done when": .*spec of the cache/);
    assert.doesNotMatch(result.stdout, /not in the executor's "Done when": DoD 1/);
  });
});

// Contract: a heading ends the open criterion, so prose under a sub-heading is not part of the item above it.
// Breaks when: today's code, which keeps the open item running across a sub-heading; the case turns green when the gap closes.
// Not covered by: the implementer's sub-heading fixtures have no prose under the sub-heading.
test('check-briefing --pair: prose under a sub-heading of "Criteria" is not glued to the criterion above it', { todo: 'open gap: a heading does not end the open criterion, so the prose under it joins that criterion' }, () => {
  scratch((dir) => {
    const executor = write(dir, 'feature-rules-executor.md', EXECUTOR);
    const auditor = write(dir, 'feature-rules-auditor.md', auditorWith([
      '## What to audit', 'The rules port.', '',
      '## Criteria', '* DoD 1: the rules load from the file', '',
      '### From the risks', 'These two come from the spec\'s risk list.', '* DoD 2: a malformed file is refused', '',
      '## Read first', '* `.vibeflow/index.md`',
    ].join('\n'), 'feature-rules-round-1'));
    const result = runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, /all 2 auditor criteria/);
  });
});

// --- watch-round.mjs: time limits and the final marker ---

function aged(path, minutes) {
  const when = new Date(Date.now() - minutes * 60_000);
  utimesSync(path, when, when);
}

// Runs a script in the background, plays `steps` (delay in ms, action) while it waits, and
// resolves with the exit code, the output and the file's text at the exit. No clock is compared.
function watchWhile(script, args, env, { file, steps = [] }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, script), ...args], { env });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timers = steps.map(([delay, action]) => setTimeout(action, delay));
    const guard = setTimeout(() => child.kill(), 20_000);
    child.on('exit', (code) => {
      const atExit = file && existsSync(file) ? readFileSync(file, 'utf8') : null;
      for (const timer of [...timers, guard]) clearTimeout(timer);
      done({ code, out, atExit });
    });
  });
}

// Contract: a file that does not exist yet counts silence from the start of the watch.
// Breaks when: a missing file is counted as silent since the epoch.
// Not covered by: the implementer's missing-file test uses --stale-min 0, where any clock is silent.
test('watch-round: a progress file that does not exist yet is not silent before --stale-min', () => {
  scratch((dir) => {
    const result = runScript('watch-round.mjs', ['--file', join(dir, 'not-yet.md'), '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(result.status, 3, result.out);
  });
});

// Contract: --timeout-min is minutes.
// Breaks when: the ceiling is counted in seconds.
// Not covered by: every implementer watch-round test uses --timeout-min 0 or exits on staleness first.
test('watch-round: --timeout-min is minutes, so a round that ends after a second is seen ending under a half-minute ceiling', async () => {
  await scratchAsync(async (dir) => {
    const file = join(dir, 'report.md');
    writeFileSync(file, '# Audit\nStage: 1/3 reading\n');
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, 'watch-round.mjs'), '--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.1'], {
      env: hermeticEnv(dir),
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    const exit = new Promise((done) => child.on('exit', (code) => done(code)));
    const timer = setTimeout(() => appendFileSync(file, 'Stage: final\n'), 1500);
    const code = await exit;
    clearTimeout(timer);
    assert.equal(code, 0, out);
  });
});

// Contract: silence is the watched round's, counted from the start of the watch, not from the file's last write.
// Breaks when: silence is counted from the file's modification time.
// Not covered by: the implementer's stale test pinned the modification-time reading (an aged file, an immediate exit 1).
test('watch-round: a watch started on a file last written before the round counts silence from the start of the watch', () => {
  scratch((dir) => {
    // A retried audit: the dead attempt left its partial report two hours ago.
    const file = write(dir, 'feature-rules-audit.md', '# Audit\nStage: 3/6 sabotage\nVerdict: pending\n');
    aged(file, 120);
    const result = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(result.status, 3, `silent at the first read of a round that just started: ${result.out}`);
  });
});

// Contract: only a marker added after the watch starts ends it, whatever number of markers earlier rounds left.
// Breaks when: the baseline is a "had a marker" flag instead of a count.
// Not covered by: the implementer's fix-round test has exactly one earlier marker, where a count and a flag agree.
test('watch-round: a progress file with two earlier markers ends the second fix watch only on the second fix marker', async () => {
  await scratchAsync(async (dir) => {
    const file = write(dir, 'feature-rules.md', [
      '# feature · rules · progress', '## Milestone 1', '* done', '', 'State: final', '',
      '## Fix 1', '* fixed the first finding', '', 'State: final · fix 1', '',
    ].join('\n'));
    const first = runScript('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0'], hermeticEnv(dir));
    assert.equal(first.status, 3, `an earlier round's marker ended the watch: ${first.out}`);

    const fix = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.5', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => appendFileSync(file, '\n## Fix 2\n* reading the re-audit report\n')],
        [900, () => appendFileSync(file, '* fixed the second finding\n\nState: final · fix 2\n')],
      ],
    });
    assert.equal(fix.code, 0, fix.out);
    assert.ok(fix.atExit.includes('State: final · fix 2'), `exited before the second fix marker: ${fix.out}`);
  });
});

// Contract: watch-round never exits 0 without a new final marker.
// Breaks when: today's code, which lowers the marker count on a read of a half-written file; the case turns green when the gap closes.
// Not covered by: the implementer's rewrite test only rewrites the file to a different text.
test('watch-round: a file emptied and written back with the same text during the watch does not read as a new marker', { todo: 'open gap: the marker count drops when the file is read in the middle of a rewrite' }, async () => {
  await scratchAsync(async (dir) => {
    const original = '# feature · rules · progress\n## Milestone 1\n* done\n\nState: final\n';
    const file = write(dir, 'feature-rules.md', original);
    // A non-atomic rewrite seen mid-way (truncated), then the same text back: no round wrote a marker.
    const result = await watchWhile('watch-round.mjs', ['--file', file, '--stale-min', '60', '--timeout-min', '0.03', '--interval-sec', '0.05'], hermeticEnv(dir), {
      file,
      steps: [
        [300, () => writeFileSync(file, '')],
        [700, () => writeFileSync(file, original)],
      ],
    });
    assert.equal(result.code, 3, `exited 0 on the marker the first round left: ${result.out}`);
  });
});

// --- check-probes.mjs: the probes of this repository ---

function testFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...testFilesUnder(path));
    else if (/\.test\.mjs$/.test(entry.name)) out.push(path);
  }
  return out;
}

const callsItselfProbes = (path) => /\bprobes\b/i.test(readFileSync(join(ROOT, path), 'utf8').split('\n')[0]);

// Contract: probe pruning reads every probe file the repository has, where it lives.
// Breaks when: a probe file is placed outside a "<test folder>/audit/" folder, or the script's default probe path changes.
// Not covered by: the implementer's check-probes tests use invented folders, not this repository's layout.
test('check-probes: by default it reads exactly the test files that call themselves audit probes, and more than zero', () => {
  const box = mkdtempSync(join(tmpdir(), 'vibeflow-probes-layout-'));
  const repo = join(box, 'repo');
  mkdirSync(repo, { recursive: true });
  const env = hermeticEnv(box);
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  };
  try {
    git(['init', '-q']);
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git(['add', 'README.md']);
    git(['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'base']);
    // The repository's test tree, as it is, copied into the sandbox's working tree.
    const all = testFilesUnder('test');
    for (const path of all) {
      mkdirSync(join(repo, dirname(path)), { recursive: true });
      copyFileSync(join(ROOT, path), join(repo, path));
    }
    const probes = all.filter(callsItselfProbes);
    assert.ok(probes.length > 0, 'the repository has audit probe files');
    const run = runScript('check-probes.mjs', [repo, '--base', 'HEAD'], env);
    assert.ok(run.status === 0 || run.status === 1, `check-probes ran: ${run.out}`);
    const count = /(\d+) probe file\(s\) read/.exec(run.stdout);
    assert.ok(count, run.out);
    assert.equal(Number(count[1]), probes.length, `check-probes reads every probe file: ${probes.join(', ')}`);
    const read = new Set(run.stdout.split('\n').map((line) => /^([^:\s]+\.test\.mjs):\d+ \[/.exec(line)?.[1]).filter(Boolean));
    for (const path of read) assert.ok(probes.includes(path), `${path} is read as a probe but does not call itself one`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
});

// --- the Node version guard, over what the manifest installs ---

// Contract: every script the kit manifest installs, on a Node below 18, exits 64 with nothing on stdout and says it needs Node.js 18, with the version found.
// Breaks when: a new script enters the manifest without the guard.
// Not covered by: the implementer's guard test walks a fixed list of script names.
test('Node guard: every script the kit manifest installs, on a Node below 18, exits 64 with nothing on stdout and names Node.js 18 and the version found', () => {
  const manifest = JSON.parse(readFileSync(join(LOOP_DIR, 'manifest.json'), 'utf8'));
  const scripts = manifest.files.filter((file) => /^scripts\/.*\.mjs$/.test(file));
  const onDisk = readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.mjs')).map((name) => `scripts/${name}`);
  assert.ok(onDisk.length > 0, 'the kit has scripts');
  assert.deepEqual([...scripts].sort(), [...onDisk].sort(), 'the manifest lists every script under loop/scripts/');
  // The old version is assembled, so check-probes does not read a simulated Node as a pinned version.
  const old = [17, 9, 1].join('.');
  const preload = `data:text/javascript,${encodeURIComponent(`Object.defineProperty(process, 'versions', { value: { ...process.versions, node: '${old}' } }); delete globalThis.fetch;`)}`;
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ['--import', preload, join(LOOP_DIR, script), '--help'], {
      env: hermeticEnv(tmpdir()), encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(result.status, 64, `${script}: ${result.stdout}${result.stderr}`);
    assert.equal(result.stdout, '', `${script}: nothing ran before the guard`);
    assert.match(result.stderr, /needs Node\.js 18 or later; found 17\.9\.1/, `${script}: ${result.stderr}`);
  }
});

// --- preflight.mjs: the origin remote, the network line and the pr ending line ---

// No case reaches the real network: the origin and every probe live on 127.0.0.1, and any
// other host goes through a proxy on a closed local port, so a regression that probes a
// public host fails fast instead of leaving the machine.
const offline = (env) => ({
  ...env,
  NODE_USE_ENV_PROXY: '1',
  NODE_NO_WARNINGS: '1',
  HTTP_PROXY: 'http://127.0.0.1:9',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  http_proxy: 'http://127.0.0.1:9',
  https_proxy: 'http://127.0.0.1:9',
  NO_PROXY: '127.0.0.1',
  no_proxy: '127.0.0.1',
});

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ghCalls = (box) => (existsSync(box.ghLog) ? readFileSync(box.ghLog, 'utf8') : '');

// A local HTTP server that answers every request and records it.
async function withServer(run) {
  const hits = [];
  const server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    response.end();
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`, hits);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

// A local port nobody listens on.
async function closedPort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

async function withSandboxAsync(run) {
  const box = makeSandbox();
  try {
    return await run(box);
  } finally {
    box.cleanup();
  }
}

// Contract: an origin with no network host (a local path, a file:// URL, a Windows drive path) is attention twice, with nothing to probe and the pull request opened by hand, and gh is never asked about a host.
// Breaks when: the guard for an origin without a host goes (gh is asked about a host named "null"), the scp-style pattern takes "file:" or a drive letter for a host, or the drive-letter exclusion goes.
// Not covered by: the implementer's preflight tests use only http, scp-style and ssh:// origins, or no origin at all.
test('preflight: an origin with no network host is nothing to probe and a pull request opened by hand, without asking gh about a host', () => {
  for (const remote of ['/srv/git/repo.git', 'file:///srv/git/repo.git', 'C:/work/repo.git']) {
    withSandbox((box) => {
      box.git('switch', '-q', '-c', 'feat/x');
      box.git('remote', 'add', 'origin', remote);
      const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env()));
      assert.equal(result.status, 1, `${remote}: ${result.out}`);
      const url = escaped(remote);
      assert.match(result.stdout, new RegExp(`^\\[attention\\] network: nothing to probe \\(origin ${url} is not an http or ssh remote, no --probe-url\\)$`, 'm'), remote);
      assert.match(result.stdout, new RegExp(`^\\[attention\\] pr ending: origin ${url} has no host for gh; .*by hand$`, 'm'), remote);
      assert.doesNotMatch(ghCalls(box), /^auth /m, `${remote}: gh was asked about a host`);
    });
  }
});

// Contract: the credentials written in an http(s) origin URL never reach preflight's output, whether the origin host answers or not.
// Breaks when: a network or pr ending line prints the origin URL instead of the probe built from its scheme and host.
// Not covered by: the implementer's tests use origins without credentials, so the printed URL and the probe are the same text.
test('preflight: the credentials in an http origin URL stay out of the output, with the origin answering or not', async () => {
  const secret = 's3cret-token';
  await withSandboxAsync((box) => withServer(async (live, hits) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `${live.replace('http://', `http://user:${secret}@`)}/owner/repo.git`);
    const answering = await watchWhile('preflight.mjs', ['--repo', box.repo], offline(box.env()), {});
    assert.ok(hits.length > 0, `the origin host was not probed: ${answering.out}`);
    assert.match(answering.out, new RegExp(`^\\[ok\\] network: ${escaped(live)} answer$`, 'm'));
    assert.ok(!answering.out.includes(secret), answering.out);
  }));
  const port = await closedPort();
  await withSandboxAsync(async (box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `http://user:${secret}@127.0.0.1:${port}/owner/repo.git`);
    const silent = await watchWhile('preflight.mjs', ['--repo', box.repo], offline(box.env()), {});
    assert.match(silent.out, /^\[attention\] network: no answer from http:\/\/127\.0\.0\.1:/m);
    assert.ok(!silent.out.includes(secret), silent.out);
  });
});

// Contract: an origin URL that does not parse as a URL is never printed with the credentials it carries, a user and password or a token alone.
// Breaks when: the fallback for an origin without a host prints the remote URL as git returns it.
// Not covered by: the implementer's tests use only origins that parse and carry no credentials.
test('preflight: an origin URL that does not parse is not printed with its credentials', () => {
  for (const credentials of ['user:s3cret-token@', 's3cret-token@']) {
    withSandbox((box) => {
      box.git('switch', '-q', '-c', 'feat/x');
      box.git('remote', 'add', 'origin', `https://${credentials}127.0.0.1:99999/owner/repo.git`);
      const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env()));
      assert.equal(result.status, 1, result.out);
      assert.ok(!result.out.includes('s3cret-token'), result.out);
      assert.ok(!result.out.includes('user:'), result.out);
      assert.match(result.stdout, /^\[attention\] network: nothing to probe \(origin https:\/\/127\.0\.0\.1:99999\/owner\/repo\.git /m, result.out);
      assert.match(result.stdout, /^\[attention\] pr ending: origin https:\/\/127\.0\.0\.1:99999\/owner\/repo\.git has no host for gh; /m, result.out);
    });
  }
});

// Contract: a password holding a "/" or an "@", in an origin URL that does not parse, is not printed in any part.
// Breaks when: the credential pattern stops at the first "/" or at the first "@" after the scheme, so the URL prints whole or keeps the tail of the password.
// Not covered by: the credential case above uses passwords of letters, digits and dashes, which those narrower patterns strip as well.
test('preflight: a password holding "/" or "@" in an origin URL that does not parse is not printed in any part', () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', 'https://user:left-s3cret/mid-s3cret@end-s3cret@127.0.0.1:99999/owner/repo.git');
    const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env()));
    assert.equal(result.status, 1, result.out);
    assert.ok(!result.out.includes('s3cret'), result.out);
    assert.match(result.stdout, /^\[attention\] pr ending: origin https:\/\/127\.0\.0\.1:99999\/owner\/repo\.git has no host for gh; /m, result.out);
  });
});

// Contract: a password holding a space, in an origin URL that does not parse, is not printed in any part.
// Breaks when: the credential pattern does not cross whitespace, so the URL prints whole.
// Not covered by: every credential case uses a password without whitespace.
test('preflight: a password holding a space in an origin URL that does not parse is not printed', { todo: 'open gap: the credential pattern stops at whitespace, so a password with a space is printed whole' }, () => {
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', 'https://user:left-s3cret right-s3cret@127.0.0.1:99999/owner/repo.git');
    const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env()));
    assert.ok(!result.out.includes('s3cret'), result.out);
  });
});

// Contract: with the origin on a host and gh not installed, the open PR line says gh is not installed, not that gh does not serve the host.
// Breaks when: the skip of the open PR list follows any failed gh auth status, the exit of a gh that is not there included.
// Not covered by: the implementer's case with gh missing reads only the pr ending line.
test('preflight: with gh not installed, the open PR line says so instead of blaming the origin host', async () => {
  const port = await closedPort();
  withSandbox((box) => {
    box.git('switch', '-q', '-c', 'feat/x');
    box.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/owner/repo.git`);
    const gitOnly = join(box.root, 'git-only');
    mkdirSync(gitOnly);
    symlinkSync(spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim(), join(gitOnly, 'git'));
    const result = runScript('preflight.mjs', ['--repo', box.repo], offline(box.env({ PATH: gitOnly })));
    assert.match(result.stdout, /^\[ok\] CI: gh not installed, open PRs not checked$/m, result.out);
    assert.match(result.stdout, /^\[attention\] pr ending: gh not installed; /m, result.out);
  });
});

// Contract: a failed gh read is retried until the ceiling, not a set number of times: a gh that fails four reads in a row and then answers green ends green.
// Breaks when: the retry loop gives up after a fixed number of failed reads and reports the ceiling before it is reached.
// Not covered by: the implementer's case recovers after a single failed read, and its ceiling half accepts exit 3 after any number of reads.
test('watch-pr: a gh that fails several reads in a row and then answers green ends green, well before the ceiling', () => {
  withSandbox((box) => {
    const green = join(box.root, 'green.json');
    writeFileSync(green, JSON.stringify({ state: 'OPEN', title: 'feat', url: 'https://example.invalid/pr/7', statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }] }));
    box.writeExecutable('gh', [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${box.ghLog}'`,
      `reads=$(wc -l < '${box.ghLog}')`,
      `if [ $reads -gt 4 ]; then cat '${green}'; exit 0; fi`,
      "echo 'HTTP 502: Bad Gateway' >&2",
      'exit 1',
      '',
    ].join('\n'));
    const result = runScript('watch-pr.mjs', ['--repo', 'owner/repo', '--pr', '7', '--interval-sec', '0.02', '--timeout-min', '5'], box.env());
    assert.equal(result.status, 0, result.out);
    assert.match(result.stdout, /; attempt 4$/m, result.out);
    assert.equal(readFileSync(box.ghLog, 'utf8').trim().split('\n').length, 5, result.out);
  });
});
