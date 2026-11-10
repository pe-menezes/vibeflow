// A small observable store: one state object, replaced on every update, with
// listeners called after each change.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    update(change) {
      state = { ...state, ...change(state) };
      for (const listener of listeners) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
