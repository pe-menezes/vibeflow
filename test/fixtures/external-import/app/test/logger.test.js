import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLogger } from '../src/logging/logger.js';

test('entries carry level, scope, message and the optional data', () => {
  const logger = createLogger('home');
  logger.info('opened');
  logger.error('failed to load', { id: 3 });
  assert.deepEqual(logger.entries(), [
    { level: 'info', scope: 'home', message: 'opened' },
    { level: 'error', scope: 'home', message: 'failed to load', data: { id: 3 } },
  ]);
});

test('a given sink receives the entries', () => {
  const sink = [];
  createLogger('app', { sink }).warn('slow start');
  assert.equal(sink.length, 1);
});
