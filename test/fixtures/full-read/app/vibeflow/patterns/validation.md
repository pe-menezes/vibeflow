---
tags: [validation, validators, fields]
modules: [src/validation/]
applies_to: [user input]
confidence: high
---
# Pattern: Validation

## What
Field rules are lists of validators run by `validate(values, rules)`. The
result is an object of messages by field name, empty when the values are
valid, so callers test validity with `Object.keys(errors).length === 0`.

## Where
- `src/validation/validators.js` — `required`, `maxLength`, `validate`
- the screen file that owns the inputs — its rules object, next to its field
  descriptors

## The Pattern
- A validator is a function of one value. It returns a message when the
  value is invalid and `null` otherwise. It never throws for bad input.
- Validator factories take the field's label first, so the message names the
  field the way the screen shows it: `required('Display name')` returns
  `"Display name is required"`.
- `validate` runs the validators of each field in order and keeps the first
  message of each field. Later validators of a field that already failed do
  not run.
- A rules object maps a field `name` (the same key the form uses) to its
  list of validators. Fields without rules are left out of the object.
- The rules object is declared once, at module level, next to the field
  descriptors of the screen. It is not rebuilt on every call.

## Validators available
- `required(label)` — fails on `undefined`, `null` and the empty string.
  A string of spaces passes; trim the value before validating when spaces
  should not count.
- `maxLength(label, max)` — fails when a string is longer than `max`
  characters; values that are not strings pass, so pair it with `required`
  when the field must exist.

A new validator goes into `src/validation/validators.js` with its own test,
following the same shape: a factory that takes the label and its settings and
returns the validator.

## Example
```js
const errors = validate(values, { name: [required('Name'), maxLength('Name', 40)] });
if (Object.keys(errors).length > 0) return { ok: false, errors };
```

## Where validation runs
- A screen validates in `validate()` and again at the start of `save()`;
  `save()` never trusts that `validate()` was called before.
- Storage adapters do not validate. What reaches storage was validated by
  the screen.
- Messages are shown as they come from the validator; the screen does not
  rewrite them.

## Anti-patterns
- Validating inside `render`. Rendering shows the errors of the last
  `validate()`; it does not compute them.
- One validator that checks several fields at once. Cross-field checks are a
  separate function that adds its message under the field the user has to
  change.
- Throwing from a validator to signal an invalid value.
