import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, formatDate } from '../src/dates/format-date.js';
import { createFixedClock } from '../src/testing/fakes.js';

test('a date is shown as its UTC day', () => {
  const clock = createFixedClock('2026-01-15T23:30:00Z');
  assert.equal(formatDate(clock.now()), '2026-01-15');
});

test('adding days crosses a month end', () => {
  assert.equal(formatDate(addDays(new Date('2026-01-31T12:00:00Z'), 1)), '2026-02-01');
});
