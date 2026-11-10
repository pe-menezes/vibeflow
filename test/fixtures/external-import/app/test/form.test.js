import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createForm } from '../src/forms/form.js';

test('setting a value makes the form dirty and reset makes it clean', () => {
  const form = createForm({ name: 'Ada' });
  assert.equal(form.isDirty(), false);
  form.set('name', 'Grace');
  assert.equal(form.isDirty(), true);
  assert.deepEqual(form.values(), { name: 'Grace' });
  form.reset();
  assert.deepEqual(form.values(), { name: 'Ada' });
});

test('reset with new values makes them the new starting point', () => {
  const form = createForm({ name: 'Ada' });
  form.set('name', 'Grace');
  form.reset(form.values());
  assert.equal(form.isDirty(), false);
});
