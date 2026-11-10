---
tags: [forms, fields, dirty-state]
modules: [src/forms/]
applies_to: [screens with inputs]
confidence: high
---
# Pattern: Forms

## What
A screen with inputs keeps its values in `createForm(initial)`.

## Where
- `src/forms/form.js` — `createForm()`

## The Pattern
- `set(name, value)` changes one field; `values()` returns a copy.
- `isDirty()` says whether any field differs from the starting values.
- `reset(next)` makes `next` the new starting point (the old one by default).

## Example
```js
const form = createForm({ name: 'Ada' });
form.set('name', 'Grace');
form.isDirty(); // true
```
