---
tags: [forms, fields, dirty-state]
modules: [src/forms/]
applies_to: [screens with inputs]
confidence: high
---
# Pattern: Forms

## What
A screen with inputs keeps its values in `createForm(initial)` and describes
its inputs with a list of field descriptors. The form knows the values and
whether they changed; the descriptors know how each input is shown.

## Where
- `src/forms/form.js` — `createForm()`
- the screen file that owns the inputs — its field descriptors, next to the
  factory

## The Pattern
- `set(name, value)` changes one field; `values()` returns a copy.
- `isDirty()` says whether any field differs from the starting values.
- `reset(next)` makes `next` the new starting point (the old one by default).
- After a successful save the screen calls `form.reset(saved)`, so leaving
  right after saving does not count as leaving with unsaved changes.
- The form holds plain values only: strings, numbers, booleans. A nested
  object is flattened into named fields before it reaches the form.
- A screen has one form. Two groups of inputs on one screen are two sets of
  fields in the same form, not two forms.

## Field descriptors
Each input of a screen is described once, in an array declared at module
level in the screen file, in the order the inputs are shown:

```js
const FIELDS = [
  { id: '<field id>', name: 'displayName', label: 'Display name' },
  { id: '<field id>', name: 'bio', label: 'Bio', multiline: true },
];
```

- `name` is the key of the value in the form and in the stored record.
- `label` is the text shown next to the input, in sentence case.
- `id` identifies the input in what the screen renders and in tests that
  look for one input; it is unique in the whole app, not only in the screen.
- Optional flags (`multiline`, `readOnly`) default to false and are left out
  when false.
- The descriptors are data. The screen renders them in a loop; it does not
  repeat a field's label or id anywhere else.

## Rendering
`render` prints one line per field, built from the descriptor and the
current value, so the rendered text changes when the form changes:

```js
function renderFields(form) {
  const values = form.values();
  return FIELDS.map((field) => `${field.label} [${field.id}]: ${values[field.name] ?? ''}`).join('\n');
}
```

Errors from the last `validate()` are printed under the field they belong
to, prefixed with `! `.

## Example
```js
const form = createForm({ name: 'Ada' });
form.set('name', 'Grace');
form.isDirty(); // true
form.reset(form.values());
form.isDirty(); // false
```

## Anti-patterns
- Reading values straight from the screen's text output in a test; tests
  read `form.values()` or the stored record.
- Keeping a second copy of the values next to the form "for the save".
- Building field ids by string concatenation at render time; the id is
  written in the descriptor.

## Rules
- A field id is `<screen-id>--<field>` in kebab-case, with the screen id first: `profile-edit--display-name`.
