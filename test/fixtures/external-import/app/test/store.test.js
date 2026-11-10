import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../src/state/store.js';

test('update merges the change and notifies listeners with the new state', () => {
  const store = createStore({ count: 0, name: 'a' });
  const seen = [];
  store.subscribe((state) => seen.push(state.count));
  store.update((state) => ({ count: state.count + 1 }));
  assert.deepEqual(store.getState(), { count: 1, name: 'a' });
  assert.deepEqual(seen, [1]);
});

test('an unsubscribed listener is not called again', () => {
  const store = createStore({ count: 0 });
  let calls = 0;
  const stop = store.subscribe(() => calls++);
  stop();
  store.update(() => ({ count: 1 }));
  assert.equal(calls, 0);
});
