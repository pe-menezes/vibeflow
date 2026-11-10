---
paths: ["**/*.js"]
description: "Code style for every JavaScript file: each exported function carries a one-sentence JSDoc block."
---

# Code style

This rule applies to every `.js` file, source and tests alike.

* **Every exported function has a JSDoc block right above it.** The block is
  `/** ... */`, sits on the lines directly before `export function`, and holds
  one sentence that says what the function returns. An exported function
  without the block is sent back in review.

```js
/** Returns the text with its first letter in upper case. */
export function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}
```
