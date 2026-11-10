---
tags: [testing, node-test, fakes]
modules: [test/, src/testing/]
applies_to: [every unit]
confidence: high
---
# Pattern: Testing

## What
Each unit has one `node:test` file in `test/`; shared doubles live in
`src/testing/`.

## Where
- `test/<unit>.test.js` — one file per unit
- `src/testing/fakes.js` — `createFixedClock`, `createFakeFetch`

## The Pattern
- Tests use `node:assert/strict` and read as sentences.
- Time comes from `createFixedClock`, network from `createFakeFetch`.
- `npm test` runs every file.

## Example
```js
const fetch = createFakeFetch({ 'GET http://api/items': { body: [] } });
```
