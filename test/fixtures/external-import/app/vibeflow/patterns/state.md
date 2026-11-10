---
tags: [state, store, subscriptions]
modules: [src/state/]
applies_to: [screen state, shared state]
confidence: high
---
# Pattern: State

## What
Shared state lives in a small observable store built by `createStore(initial)`.

## Where
- `src/state/store.js` — `createStore()`

## The Pattern
- `update(change)` receives a function of the current state and merges what it
  returns; the state object is replaced, never mutated in place.
- `subscribe(listener)` returns the function that removes the listener.
- Listeners run after every update, with the new state.

## Example
```js
const store = createStore({ count: 0 });
store.update((state) => ({ count: state.count + 1 }));
```
