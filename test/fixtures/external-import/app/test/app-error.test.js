import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AppError, isAppError, toMessage } from '../src/errors/app-error.js';

test('an app error carries its code and its own message', () => {
  const error = new AppError('not-found', 'No such profile');
  assert.equal(error.code, 'not-found');
  assert.ok(isAppError(error));
  assert.equal(toMessage(error), 'No such profile');
});

test('an unexpected error shows a generic message', () => {
  assert.equal(isAppError(new Error('boom')), false);
  assert.equal(toMessage(new Error('boom')), 'Something went wrong');
});
