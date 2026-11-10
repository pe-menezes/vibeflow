import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNavigator } from '../src/navigation/navigator.js';

const screen = (text) => ({ render: () => text });

test('navigate renders the registered screen and records it', () => {
  const navigator = createNavigator();
  navigator.register('a', screen('A'));
  assert.equal(navigator.navigate('a'), 'A');
  assert.equal(navigator.current(), 'a');
});

test('an unknown route and a duplicate registration are errors', () => {
  const navigator = createNavigator();
  navigator.register('a', screen('A'));
  assert.throws(() => navigator.register('a', screen('A')), /already registered/);
  assert.throws(() => navigator.navigate('b'), /unknown route/);
});

test('back returns to the previous screen', () => {
  const navigator = createNavigator();
  navigator.register('a', screen('A'));
  navigator.register('b', screen('B'));
  navigator.navigate('a');
  navigator.navigate('b');
  assert.equal(navigator.back(), 'A');
  assert.equal(navigator.back(), null);
});
