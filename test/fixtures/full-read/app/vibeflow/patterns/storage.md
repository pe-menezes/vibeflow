---
tags: [storage, persistence, keys]
modules: [src/storage/]
applies_to: [local data]
confidence: high
---
# Pattern: Storage

## What
Local data goes through a key-value adapter with `read`, `write`, `remove`
and `keys`. The app has one adapter, provided in the container as `storage`;
features read and write through it and never keep their own map of records.

## Where
- `src/storage/memory-storage.js` — `createMemoryStorage()`
- `src/app.js` — provides `storage` in the container

## The Pattern
- Keys are `<feature>.<name>` (`settings.theme`). A record that has an id is
  stored under `<feature>.<id>` (`profile.u1`).
- Values are stored as JSON text, so `read` returns a copy: changing what
  `read` returned does not change what is stored.
- `read(key, fallback)` returns the fallback for a missing key; pass the
  fallback the caller expects (`null` for a record, `[]` for a list).
- `write(key, value)` replaces the whole value. To change one field, read,
  copy with the change, and write the copy.
- `remove(key)` deletes the key; removing a missing key is not an error.
- `keys()` lists the stored keys; use it in tests and in migrations, not in
  screens.

## Who calls storage
- The register function of a feature gets `storage` from the container and
  passes it to the screens that need it.
- A screen reads in its load step and writes in its save step, once per
  successful save. It never writes on every change of a field.
- A screen never writes a value it did not validate.

## Example
```js
const storage = container.get('storage');
storage.write('settings.theme', 'dark');
storage.read('settings.theme', 'light'); // 'dark'
storage.read('profile.u9', null); // null, nothing stored yet
```

## Records
- A stored record keeps its own `id` field, equal to the id in its key.
- Fields the screen does not edit are kept as they were read: the save
  writes `{ ...loaded, ...edited }`, never the edited fields alone.
- Dates inside a record are ISO strings in UTC.

## Anti-patterns
- Building keys from user input other than the record id.
- Writing the draft on every `set` "to be safe"; a draft is not saved until
  the user saves.
- Reading the same key twice in one step to "refresh" it; `read` already
  returns the stored value.
