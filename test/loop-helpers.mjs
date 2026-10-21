// Shared helpers for the loop kit tests: hermetic git repositories, a fake `gh`
// first on PATH, and a runner for the kit's scripts.

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const LOOP_DIR = join(ROOT, 'plugins/vibeflow/skills/implement/loop');
export const SCRIPTS_DIR = join(LOOP_DIR, 'scripts');

// Every inherited GIT_* variable is dropped: a hook or a pre-commit that exports
// GIT_DIR or GIT_INDEX_FILE would otherwise point the child at the real repository.
// HOME and XDG_CONFIG_HOME move to a scratch directory so global git config stays out.
export function hermeticEnv(home, extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GIT_') || key === 'CLAUDE_CODE_EFFORT_LEVEL') continue;
    env[key] = value;
  }
  env.HOME = home;
  env.XDG_CONFIG_HOME = join(home, '.config');
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

// A scratch area with a hermetic home, a bin directory first on PATH holding a
// fake `gh`, and a git repository on branch `main` with one base commit.
export function makeSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'vibeflow-loop-'));
  const home = join(root, 'home');
  const bin = join(root, 'bin');
  const repo = join(root, 'repo');
  for (const dir of [home, bin, repo]) mkdirSync(dir, { recursive: true });

  const ghState = join(root, 'gh-state.json');
  const ghLog = join(root, 'gh-calls.log');
  writeFileSync(ghState, '[]\n');
  writeExecutable(join(bin, 'gh'), [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> '${ghLog}'`,
    `cat '${ghState}'`,
    'exit "${FAKE_GH_EXIT:-0}"',
    '',
  ].join('\n'));

  const env = (extra = {}) => hermeticEnv(home, { PATH: `${bin}:${process.env.PATH}`, ...extra });

  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: repo, env: env(), encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout;
  };

  const write = (path, text) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    return full;
  };

  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Vibeflow Test');
  git('config', 'user.email', 'test@vibeflow.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('src/rules.ts', 'export const x = 1\n');
  write('tests/rules.test.ts', "import { x } from '../src/rules'\nreadFileSync('src/rules.ts')\n");
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();

  return {
    root,
    home,
    bin,
    repo,
    base,
    env,
    git,
    write,
    setGh: (value) => writeFileSync(ghState, typeof value === 'string' ? value : JSON.stringify(value)),
    ghLog,
    writeExecutable: (name, body) => writeExecutable(join(bin, name), body),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function withSandbox(run) {
  const sandbox = makeSandbox();
  try {
    return run(sandbox);
  } finally {
    sandbox.cleanup();
  }
}

export function runScript(name, args, env) {
  const result = spawnSync(process.execPath, [join(SCRIPTS_DIR, name), ...args], {
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', out: `${result.stdout}${result.stderr}` };
}

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}
