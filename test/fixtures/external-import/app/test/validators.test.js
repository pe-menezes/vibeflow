import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maxLength, required, validate } from '../src/validation/validators.js';

test('validate returns the first message of each failing field', () => {
  const rules = { name: [required('Name'), maxLength('Name', 3)], bio: [maxLength('Bio', 5)] };
  assert.deepEqual(validate({ name: '', bio: 'too long' }, rules), { name: 'Name is required', bio: 'Bio is too long' });
});

test('valid values give an empty object', () => {
  assert.deepEqual(validate({ name: 'Ada' }, { name: [required('Name')] }), {});
});
