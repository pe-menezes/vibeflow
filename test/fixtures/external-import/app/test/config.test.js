import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config/config.js';

test('overrides replace the defaults and the result is frozen', () => {
  const config = loadConfig({ locale: 'pt' });
  assert.equal(config.locale, 'pt');
  assert.equal(config.pageSize, 20);
  assert.ok(Object.isFrozen(config));
});

test('an unknown key is refused', () => {
  assert.throws(() => loadConfig({ colour: 'blue' }), { code: 'unknown-config-key' });
});
