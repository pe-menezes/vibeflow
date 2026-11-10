import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capitalize, truncate } from '../src/utils/strings.js';

test('capitalize upper-cases the first letter only', () => {
  assert.equal(capitalize('hello world'), 'Hello world');
  assert.equal(capitalize(''), '');
});

test('truncate keeps short text and cuts long text with an ellipsis', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('a longer sentence', 8), 'a longe…');
});
