import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContainer } from '../src/di/container.js';

test('a provided value is built once and cached', () => {
  const container = createContainer();
  let builds = 0;
  container.provide('clock', () => ({ id: ++builds }));
  assert.equal(container.get('clock'), container.get('clock'));
  assert.equal(builds, 1);
});

test('asking for something never provided is an error', () => {
  assert.throws(() => createContainer().get('missing'), /nothing provided/);
});
