import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeFetch, createFixedClock } from '../src/testing/fakes.js';

test('the fixed clock always returns the same instant', () => {
  const clock = createFixedClock('2026-01-15T12:00:00Z');
  assert.equal(clock.now().getTime(), clock.now().getTime());
});

test('the fake fetch answers known calls and records every call', async () => {
  const fetch = createFakeFetch({ 'GET /a': { body: 1 } });
  assert.equal(await (await fetch('/a')).json(), 1);
  assert.equal((await fetch('/b', { method: 'PUT' })).status, 404);
  assert.deepEqual(fetch.calls.map((call) => `${call.method} ${call.url}`), ['GET /a', 'PUT /b']);
});
