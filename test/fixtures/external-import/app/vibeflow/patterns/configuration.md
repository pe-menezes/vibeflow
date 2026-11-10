---
tags: [config, settings, defaults]
modules: [src/config/]
applies_to: [startup settings]
confidence: high
---
# Pattern: Configuration

## What
Settings come from `loadConfig(overrides)`: defaults plus the values passed
to `createApp`, frozen.

## Where
- `src/config/config.js` — `loadConfig()`
- `src/app.js` — provides `config` in the container

## The Pattern
- Every setting has a default in `DEFAULTS`.
- An override for a key without a default is refused with `AppError` code
  `unknown-config-key`.

## Example
```js
const config = loadConfig({ locale: 'pt' });
config.pageSize; // 20
```
