---
tags: [utils, helpers, strings]
modules: [src/utils/]
applies_to: [shared helpers]
confidence: high
---
# Pattern: Utilities

## What
Pure helper functions shared by features.

## Where
- `src/utils/<topic>.js`, one file per topic (`strings.js`)
- `test/<topic>.test.js`, one test file per helper file

## The Pattern
- Each helper is a named export, pure, with no imports from `src/features/`,
  `src/navigation/` or `src/di/`.
- Empty or missing input returns an empty value instead of throwing.
- Every helper has at least one test for the normal case and one for the edge.

## Example
```js
export function capitalize(text) {
  if (!text) return '';
  return text[0].toUpperCase() + text.slice(1);
}
```
