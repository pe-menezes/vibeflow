---
tags: [validation, validators, fields]
modules: [src/validation/]
applies_to: [user input]
confidence: high
---
# Pattern: Validation

## What
Field rules are lists of validators run by `validate(values, rules)`.

## Where
- `src/validation/validators.js` — `required`, `maxLength`, `validate`

## The Pattern
- A validator returns a message when the value is invalid and `null`
  otherwise.
- `validate` keeps the first message of each field and returns an object
  by field name, empty when everything is valid.

## Example
```js
const errors = validate(values, { name: [required('Name'), maxLength('Name', 40)] });
```
