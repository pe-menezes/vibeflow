---
tags: [testing, node-test, fakes]
modules: [test/, src/testing/]
applies_to: [every unit]
confidence: high
---
# Pattern: Testing

## What
Each unit has one `node:test` file in `test/`; shared doubles live in
`src/testing/`. Screens are tested through the app: the test builds the app
with `createApp()` and drives the screen with the navigator, so a broken
registration fails the same test that a broken screen does.

## Where
- `test/<unit>.test.js` — one file per unit
- `src/testing/fakes.js` — `createFixedClock`, `createFakeFetch`

## The Pattern
- Tests use `node:assert/strict` and read as sentences.
- Time comes from `createFixedClock`, network from `createFakeFetch`.
- `npm test` runs every file.
- Each test builds its own app or unit; nothing is shared between tests
  through module-level variables.
- One behavior per test. A test that needs "and" in its name is usually two
  tests.

## Testing a screen
```js
test('saving a valid draft stores it and goes back', () => {
  const { navigator, container } = createApp();
  navigator.navigate(HOME_ROUTES.HOME);
  navigator.navigate(ROUTES.SOMETHING, { id: 'a1' });
  // act on the screen the navigator registered, then check storage and route
});
```

- Reach the screen object through the factory options of the routes file or
  through a small accessor the test can import; do not export test-only
  hooks from the screen.
- Check what the user would see: the rendered text, the current route, the
  stored record. Do not check private variables.
- Check the failure path as well as the success path: an invalid draft is
  not stored and the route does not change.

## Fakes
- `createFixedClock(iso)` returns `{ now }` with a fixed `Date`.
- `createFakeFetch(responses)` answers from a table keyed by
  `"<METHOD> <url>"` and records each call in `fetch.calls`.
- A new double goes into `src/testing/fakes.js` with its own test in
  `test/fakes.test.js`.

## Example
```js
const fetch = createFakeFetch({ 'GET http://api/items': { body: [] } });
const client = createHttpClient({ baseUrl: 'http://api', fetch });
assert.deepEqual(await client.get('/items'), []);
assert.equal(fetch.calls.length, 1);
```

## Anti-patterns
- Asserting the exact list of registered routes; check that the names of
  the feature under test are there.
- Sleeping or reading the real clock.
- Snapshotting whole rendered screens; check the lines that matter.
