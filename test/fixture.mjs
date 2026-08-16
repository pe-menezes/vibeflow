// Generates the smoke-test fixture: a small Node project with a detectable
// stack, a working test runner, two patterns repeated often enough to be
// mined, and one fixed implementation task that fits the budget.
//
// The fixture is generated, never committed. Every arm gets a fresh copy so
// `analyze` always runs its cold path.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Two patterns, each repeated across three services so pattern mining has
// something real to find rather than a single instance to guess from:
//   result-envelope — every service returns ok(data) or fail(code, message)
//   validator-guard — every service opens with assertShape() before any work
const FILES = {
  'package.json': JSON.stringify(
    {
      name: 'taskstore',
      version: '0.1.0',
      type: 'module',
      description: 'Minimal task store used as a vibeflow pipeline fixture.',
      scripts: { test: 'node --test' },
      license: 'MIT',
    },
    null,
    2,
  ) + '\n',

  'README.md': `# taskstore

A minimal in-memory task store.

## Running tests

\`\`\`
npm test
\`\`\`

## Layout

- \`src/result.js\` — the result envelope every service returns
- \`src/validate.js\` — the shape guard every service opens with
- \`src/store.js\` — in-memory storage
- \`src/services/\` — one file per operation
- \`docs/deletion-policy.md\` — behavior contract for task deletion
`,

  'src/result.js': `// The result envelope. Services never throw for expected failures and never
// return bare values — callers always branch on \`ok\`.

export function ok(data) {
  return { ok: true, data };
}

export function fail(code, message) {
  return { ok: false, error: { code, message } };
}
`,

  'src/validate.js': `// The shape guard. Every service validates its input before touching the
// store, so a malformed call never reaches storage.

export class ValidationError extends Error {
  constructor(field, expected) {
    super(\`field "\${field}" must be \${expected}\`);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export function assertShape(input, schema) {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('input', 'an object');
  }
  for (const [field, expected] of Object.entries(schema)) {
    const value = input[field];
    if (expected === 'string' && typeof value !== 'string') {
      throw new ValidationError(field, 'a string');
    }
    if (expected === 'string?' && value !== undefined && typeof value !== 'string') {
      throw new ValidationError(field, 'a string when present');
    }
    if (expected === 'boolean' && typeof value !== 'boolean') {
      throw new ValidationError(field, 'a boolean');
    }
  }
}
`,

  'src/store.js': `// In-memory storage. Not concurrent, not persistent — enough for the services
// to have something real to operate on.

const tasks = new Map();
let counter = 0;

export function reset() {
  tasks.clear();
  counter = 0;
}

export function nextId() {
  counter += 1;
  return \`task-\${counter}\`;
}

export function put(task) {
  tasks.set(task.id, task);
  return task;
}

export function get(id) {
  return tasks.get(id);
}

export function remove(id) {
  return tasks.delete(id);
}

export function all() {
  return [...tasks.values()];
}
`,

  'src/services/createTask.js': `import { ok, fail } from '../result.js';
import { assertShape, ValidationError } from '../validate.js';
import { nextId, put } from '../store.js';

export function createTask(input) {
  try {
    assertShape(input, { title: 'string', notes: 'string?' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('INVALID_INPUT', error.message);
    }
    throw error;
  }

  if (input.title.trim() === '') {
    return fail('INVALID_INPUT', 'title must not be empty');
  }

  const task = put({
    id: nextId(),
    title: input.title,
    notes: input.notes ?? '',
    done: false,
  });

  return ok(task);
}
`,

  'src/services/listTasks.js': `import { ok, fail } from '../result.js';
import { assertShape, ValidationError } from '../validate.js';
import { all } from '../store.js';

export function listTasks(input = {}) {
  try {
    assertShape(input, { filter: 'string?' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('INVALID_INPUT', error.message);
    }
    throw error;
  }

  const filter = input.filter ?? 'all';
  if (!['all', 'done', 'open'].includes(filter)) {
    return fail('INVALID_INPUT', 'filter must be all, done or open');
  }

  const tasks = all().filter((task) => {
    if (filter === 'done') return task.done;
    if (filter === 'open') return !task.done;
    return true;
  });

  return ok(tasks);
}
`,

  'src/services/updateTask.js': `import { ok, fail } from '../result.js';
import { assertShape, ValidationError } from '../validate.js';
import { get, put } from '../store.js';

export function updateTask(input) {
  try {
    assertShape(input, { id: 'string', title: 'string?', done: 'boolean' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return fail('INVALID_INPUT', error.message);
    }
    throw error;
  }

  const existing = get(input.id);
  if (!existing) {
    return fail('NOT_FOUND', \`no task with id \${input.id}\`);
  }

  const updated = put({
    ...existing,
    title: input.title ?? existing.title,
    done: input.done,
  });

  return ok(updated);
}
`,

  'test/createTask.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask } from '../src/services/createTask.js';
import { reset } from '../src/store.js';

test('createTask returns an envelope with the stored task', () => {
  reset();
  const result = createTask({ title: 'write the spec' });
  assert.equal(result.ok, true);
  assert.equal(result.data.title, 'write the spec');
  assert.equal(result.data.done, false);
});

test('createTask rejects a missing title', () => {
  reset();
  const result = createTask({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_INPUT');
});

test('createTask rejects an empty title', () => {
  reset();
  const result = createTask({ title: '   ' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_INPUT');
});
`,

  'test/listTasks.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask } from '../src/services/createTask.js';
import { listTasks } from '../src/services/listTasks.js';
import { reset } from '../src/store.js';

test('listTasks returns every task by default', () => {
  reset();
  createTask({ title: 'one' });
  createTask({ title: 'two' });
  const result = listTasks();
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 2);
});

test('listTasks rejects an unknown filter', () => {
  reset();
  const result = listTasks({ filter: 'archived' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'INVALID_INPUT');
});
`,

  'test/updateTask.test.js': `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask } from '../src/services/createTask.js';
import { updateTask } from '../src/services/updateTask.js';
import { reset } from '../src/store.js';

test('updateTask marks a task done', () => {
  reset();
  const created = createTask({ title: 'ship it' });
  const result = updateTask({ id: created.data.id, done: true });
  assert.equal(result.ok, true);
  assert.equal(result.data.done, true);
});

test('updateTask reports a missing task', () => {
  reset();
  const result = updateTask({ id: 'task-999', done: true });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'NOT_FOUND');
});
`,

  // The task's one explicit reference. Local on purpose: gen-spec should list
  // it under `## References` and prompt-pack should propagate it, and asserting
  // that must not depend on the network.
  'docs/deletion-policy.md': `# Task deletion policy

Behavior contract for removing tasks from the store.

- Deleting an existing task returns the envelope with \`ok: true\` and \`data\`
  carrying the removed task's id.
- Deleting an id that does not exist returns \`fail('NOT_FOUND', ...)\` — an
  expected failure stays inside the envelope, it never throws.
- Input shape is \`{ id: string }\`, validated with \`assertShape\` before the
  store is touched.
`,

  '.gitignore': `node_modules/
`,
};

// The one implementation task both arms run. Fixed text, so the only variable
// between arms is the prompt set under test.
export const TASK =
  'Add a deleteTask service that removes a task by id, following the ' +
  'conventions the existing services already use and the behavior contract ' +
  'in docs/deletion-policy.md, with tests covering the success case and ' +
  'the missing-task case.';

export const TASK_SLUG_HINT = 'delete-task';

export function generateFixture(dir) {
  rmSync(dir, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(FILES)) {
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  // git init + a baseline commit: `audit` computes a real diff, and the runner
  // measures what `implement` touched against this commit.
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'smoke@vibeflow.test');
  git('config', 'user.name', 'Vibeflow Smoke Test');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture baseline');

  return dir;
}

// Verifies the fixture is sound before any arm runs against it: if the
// fixture's own tests fail, every downstream verdict is meaningless.
export function fixtureTestsPass(dir) {
  try {
    execFileSync('npm', ['test'], { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
