#!/usr/bin/env node
// Builds the missing-base fixture in a scratch directory:
//
//   node test/fixtures/missing-base/make.mjs <dest> [--mode untracked|ignored] [--stage spec|change]
//
// <dest>/main   a git repository with a small Node app, committed, and the knowledge base the
//               analyze workflow writes (.vibeflow/index.md, conventions.md, decisions.md and two
//               patterns/*.md) outside git. --mode ignored lists .vibeflow/ in the committed
//               .gitignore; --mode untracked (the default) does not, so git status shows it.
// <dest>/wt     a linked worktree of main, on branch feature, without the knowledge base. It
//               holds only .vibeflow/specs/cart-total.md (the state after gen-spec); --stage
//               change adds the uncommitted change in src/ that implements the spec.
// <dest>/plain  a second repository with the same app and spec and no .vibeflow/index.md
//               anywhere: the none state.
// <dest>/home   the scratch HOME git runs with, so no global config reaches the repositories.
//
// No dependency and no model. Author, committer, date and config are fixed. Prints one created
// path per line. Everything here is invented.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODES = ['untracked', 'ignored'];
export const STAGES = ['spec', 'change'];
export const SPEC_PATH = '.vibeflow/specs/cart-total.md';
export const BASE_FILES = [
  '.vibeflow/index.md',
  '.vibeflow/conventions.md',
  '.vibeflow/decisions.md',
  '.vibeflow/patterns/errors.md',
  '.vibeflow/patterns/money.md',
];
export const CHANGED_FILE = 'src/cart.js';

const DATE = '2026-01-20T12:00:00+0000';

const APP = {
  'package.json': `${JSON.stringify({
    name: 'sample-cart',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { test: 'node --test' },
  }, null, 2)}\n`,
  'src/errors.js': `// Every error the app throws is built here.
export function appError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
`,
  'src/money.js': `// Money is an integer number of cents until it is shown.
export function formatPrice(cents) {
  if (!Number.isInteger(cents)) throw new TypeError('money: cents must be an integer');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return \`\${sign}$\${Math.floor(abs / 100)}.\${String(abs % 100).padStart(2, '0')}\`;
}
`,
  [CHANGED_FILE]: `import { appError } from './errors.js';

export function addItem(items, item) {
  if (!item || !Number.isInteger(item.priceCents)) throw appError('CART_BAD_ITEM', 'cart: item has no priceCents');
  return [...items, item];
}
`,
  'test/cart.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem } from '../src/cart.js';
import { formatPrice } from '../src/money.js';

test('addItem keeps the items it had', () => {
  assert.deepEqual(addItem([{ priceCents: 100 }], { priceCents: 250 }), [{ priceCents: 100 }, { priceCents: 250 }]);
});

test('formatPrice shows cents as dollars', () => {
  assert.equal(formatPrice(1234), '$12.34');
});
`,
};

const CHANGED = `import { appError } from './errors.js';
import { formatPrice } from './money.js';

export function addItem(items, item) {
  if (!item || !Number.isInteger(item.priceCents)) throw appError('CART_BAD_ITEM', 'cart: item has no priceCents');
  return [...items, item];
}

export function cartTotal(items) {
  if (items.length === 0) throw appError('CART_EMPTY', 'cart: no items');
  return formatPrice(items.reduce((sum, item) => sum + item.priceCents, 0));
}
`;

const BASE = {
  '.vibeflow/index.md': `# Project: sample-cart
> Analyzed: 2026-01-15
> Stack: JavaScript (ES modules), Node.js 22, node:test, no dependencies
> Type: small library organized by module
> Suggested budget: ≤ 4 files per task

## Structure
One module per concern under \`src/\`: \`cart.js\` holds the cart operations, \`money.js\`
formats amounts, \`errors.js\` builds every error. Tests live in \`test/\`, one file per module.

## Pattern Registry

<!-- vibeflow:patterns:start -->
patterns:
  - file: patterns/errors.md
    tags: [errors, codes, messages]
    modules: [src/errors.js]
  - file: patterns/money.md
    tags: [money, cents, formatting]
    modules: [src/money.js, src/cart.js]
<!-- vibeflow:patterns:end -->

## Conventions
See \`conventions.md\`. Decisions are in \`decisions.md\`.
`,
  '.vibeflow/conventions.md': `# Conventions

## Naming
- Exported functions are named verb first, in camelCase: \`addItem\`, \`formatPrice\`,
  \`cartTotal\`. A function named after a noun alone (\`total\`, \`price\`) is a finding.

## Tests
- One \`test/<module>.test.js\` per module, run by \`node --test\`.
`,
  '.vibeflow/decisions.md': `# Decisions

## No runtime dependency
The app ships with no dependency in \`package.json\`. A module that needs a helper writes it
under \`src/\`; adding a \`dependencies\` block is a decision to record here first.
`,
  '.vibeflow/patterns/errors.md': `---
tags: [errors, codes, messages]
modules: [src/errors.js]
applies_to: [any module that rejects input]
confidence: high
---
# Pattern: Errors

## What
Every error is built by \`appError(code, message)\` from \`src/errors.js\`; nothing throws a bare
\`new Error\`.

## The Pattern
- The code is upper snake case and starts with the module name: \`CART_EMPTY\`, \`CART_BAD_ITEM\`.
- The message starts with the module name in lower case, a colon and a space:
  \`'cart: no items'\`.
`,
  '.vibeflow/patterns/money.md': `---
tags: [money, cents, formatting]
modules: [src/money.js, src/cart.js]
applies_to: [any amount the app adds or shows]
confidence: high
---
# Pattern: Money

## What
An amount is an integer number of cents (\`priceCents\`) until it is shown.

## The Pattern
- Sums and comparisons work on cents; no float ever holds money.
- An amount becomes text only through \`formatPrice(cents)\` from \`src/money.js\`.
`,
};

const SPEC = `# Spec: Cart total

## Objective
A caller gets the total of a cart, formatted for display, from \`cartTotal(items)\` in \`src/cart.js\`.

## Context
\`src/cart.js\` has \`addItem\`; \`src/money.js\` has \`formatPrice\`; \`src/errors.js\` has \`appError\`.

## Definition of Done
1. \`cartTotal(items)\` returns the sum of \`priceCents\` formatted by \`formatPrice\`.
2. \`cartTotal([])\` throws an error with code \`CART_EMPTY\` and message \`cart: no items\`.
3. \`npm test\` is green.

## Scope
Files (1, budget ≤ 4):
- \`src/cart.js\` (change): \`cartTotal\`.

## Anti-scope
- Currencies other than dollars.

## Technical Decisions
- The sum is taken in cents and formatted once at the end.

## Applicable Patterns
- \`.vibeflow/patterns/errors.md\`: the \`CART_EMPTY\` code and the \`cart: \` message prefix.
- \`.vibeflow/patterns/money.md\`: integer cents, shown only through \`formatPrice\`.
`;

function gitEnv(home) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_')) env[key] = value;
  }
  return {
    ...env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: 'author@fixture.invalid',
    GIT_COMMITTER_NAME: 'Fixture Author',
    GIT_COMMITTER_EMAIL: 'author@fixture.invalid',
    GIT_AUTHOR_DATE: DATE,
    GIT_COMMITTER_DATE: DATE,
  };
}

function writeAll(root, files) {
  const written = [];
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    written.push(full);
  }
  return written;
}

function makeRepo(dir, mode, git) {
  mkdirSync(dir, { recursive: true });
  const ignore = mode === 'ignored' ? 'node_modules/\n.vibeflow/\n' : 'node_modules/\n';
  writeAll(dir, { ...APP, '.gitignore': ignore });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'sample cart app']);
}

export function makeMissingBase(dest, { mode = 'untracked', stage = 'spec' } = {}) {
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
  if (!STAGES.includes(stage)) throw new Error(`stage must be one of ${STAGES.join(', ')}`);
  const root = resolve(dest);
  if (existsSync(root) && readdirSync(root).length > 0) throw new Error(`${root} is not empty`);
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const env = gitEnv(home);
  const git = (cwd, args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
    return result.stdout;
  };

  const main = join(root, 'main');
  const wt = join(root, 'wt');
  const plain = join(root, 'plain');
  const created = [home];

  makeRepo(main, mode, git);
  created.push(main, ...writeAll(main, BASE));
  const base = git(main, ['rev-parse', 'HEAD']).trim();

  git(main, ['worktree', 'add', '-q', '-b', 'feature', wt]);
  created.push(wt, ...writeAll(wt, { [SPEC_PATH]: SPEC }));
  if (stage === 'change') created.push(...writeAll(wt, { [CHANGED_FILE]: CHANGED }));

  makeRepo(plain, mode, git);
  created.push(plain, ...writeAll(plain, { [SPEC_PATH]: SPEC }));

  return { root, home, main, wt, plain, base, mode, stage, created };
}

function cli(argv) {
  const options = { mode: 'untracked', stage: 'spec' };
  let dest = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode' || arg === '--stage') {
      if (argv[i + 1] === undefined) throw new Error(`${arg} takes a value`);
      options[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (!dest && !arg.startsWith('--')) {
      dest = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }
  if (!dest) throw new Error('usage: make.mjs <dest> [--mode untracked|ignored] [--stage spec|change]');
  const result = makeMissingBase(dest, options);
  for (const path of result.created) console.log(path);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`make.mjs: ${error.message}\n`);
    process.exit(1);
  }
}
