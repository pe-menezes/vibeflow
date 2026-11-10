---
kind: convention
tags: [code-style, jsdoc, documentation, exports, constants]
paths: ["**/*.js"]
description: "Code style for every JavaScript file: JSDoc on exports, naming of values, constants and the shape of small functions."
modules: []
applies_to: []
confidence: imported
source: team-conventions
source_file: .claude/rules/code-style.md
source_ref: /work/team-conventions
source_commit: 3f6a9c2e81d47b05c9e2a6f13d8b7e4a05c19f2d
imported: 2026-01-20
---
# Convention: Code style

> Imported from team-conventions (.claude/rules/code-style.md @ 3f6a9c2) on 2026-01-20.

# Code style

This rule applies to every `.js` file, source and tests alike. Reviewers send
back a pull request that breaks any of the points below; they are not matters
of taste.

## Documentation

* **Every exported function has a JSDoc block right above it.** The block is
  `/** ... */`, sits on the lines directly before `export function`, and holds
  one sentence that says what the function returns. An exported function
  without the block is sent back in review.
* Private functions get a block only when the name cannot say what they do.
* A block does not repeat the parameter list. Types live in the names and in
  the tests, not in `@param` tags.

```js
/** Returns the text with its first letter in upper case. */
export function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
```

## Names

* Names say what a value is, not its type: `profiles`, not `profileArray`.
* A function that returns a boolean starts with `is`, `has` or `can`.
* A function that builds something starts with `create`; one that reads
  something starts with `load` or `read`; one that writes starts with `save`
  or `write`.
* One-letter names only for the index of a short loop and for the arguments
  of a comparator.
* Event names, route names and storage keys are strings that other modules
  depend on: they are declared once and imported, never retyped.

## Values and literals

* Strings that the user sees are written in full in the module that shows
  them; they are not assembled from fragments.
* Magic strings that the code compares against (`'pending'`, `'done'`) are
  declared once as an UPPER_CASE frozen object and compared through it.
* Dates are created through the clock passed in, never with `new Date()` in
  application code.
* Prefer `??` over `||` for defaults, so `0` and the empty string survive.

## Functions

* A function does one thing at one level of detail. When a function both
  decides and formats, split it.
* No more than three positional parameters; past that, one options object.
* No boolean positional parameters: `save(draft, true)` says nothing at the
  call site.
* Pure helpers do not read from the container, the store or storage.

## Control flow

* Guard clauses first, then the main path, without `else` after `return`.
* No nested ternaries.
* `switch` only with a `default` that throws for the unexpected case.

## Constants

* Constants that more than one function of a module uses live at the top of
  the module, after the imports.
* Constants that only a test needs live in the test.
* Numeric limits live in a frozen `LIMITS` object exported from the feature's `constants.js`, and a validation call reads them from it instead of taking a bare number.
