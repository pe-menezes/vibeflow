import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { ROUTES } from '../src/features/home/navigation/home-routes.js';

test('the home screen greets by name', () => {
  const { navigator } = createApp({ greeting: 'welcome' });
  assert.equal(navigator.navigate(ROUTES.HOME, { name: 'Ada' }), 'Welcome, Ada');
});

test('home opens settings and settings closes back to home', () => {
  const { navigator } = createApp();
  navigator.navigate(ROUTES.HOME);
  assert.deepEqual(navigator.routes(), [ROUTES.HOME, ROUTES.SETTINGS]);
  navigator.navigate(ROUTES.SETTINGS);
  assert.equal(navigator.current(), ROUTES.SETTINGS);
  navigator.navigate(ROUTES.HOME);
  assert.equal(navigator.current(), ROUTES.HOME);
});
