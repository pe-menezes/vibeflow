import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStorage } from '../src/storage/memory-storage.js';

test('a written value is read back as a copy', () => {
  const storage = createMemoryStorage();
  const value = { theme: 'dark' };
  storage.write('settings.theme', value);
  value.theme = 'light';
  assert.deepEqual(storage.read('settings.theme'), { theme: 'dark' });
});

test('a missing key reads as the fallback and remove forgets a key', () => {
  const storage = createMemoryStorage();
  assert.equal(storage.read('settings.theme', 'light'), 'light');
  storage.write('settings.theme', 'dark');
  storage.remove('settings.theme');
  assert.deepEqual(storage.keys(), []);
});
