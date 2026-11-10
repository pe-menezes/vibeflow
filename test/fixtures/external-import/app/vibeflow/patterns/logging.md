---
tags: [logging, logger, diagnostics]
modules: [src/logging/]
applies_to: [diagnostics]
confidence: high
---
# Pattern: Logging

## What
Each module logs through a scoped logger from `createLogger(scope)`.

## Where
- `src/logging/logger.js` — `createLogger()`
- `src/app.js` — provides `logger` in the container

## The Pattern
- Levels are `info`, `warn` and `error`; each takes a message and optional
  data.
- Entries go to a sink; the default sink is an array, so tests read
  `entries()` instead of the console.

## Example
```js
const logger = createLogger('home');
logger.info('opened');
```
