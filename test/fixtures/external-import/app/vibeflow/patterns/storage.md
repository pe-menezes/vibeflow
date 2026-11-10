---
tags: [storage, persistence, keys]
modules: [src/storage/]
applies_to: [local data]
confidence: high
---
# Pattern: Storage

## What
Local data goes through a key-value adapter with `read`, `write`, `remove`
and `keys`.

## Where
- `src/storage/memory-storage.js` — `createMemoryStorage()`
- `src/app.js` — provides `storage` in the container

## The Pattern
- Keys are `<feature>.<name>` (`settings.theme`).
- Values are stored as JSON text, so `read` returns a copy.
- `read(key, fallback)` returns the fallback for a missing key.

## Example
```js
const storage = container.get('storage');
storage.write('settings.theme', 'dark');
```
