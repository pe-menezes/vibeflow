---
tags: [errors, app-error, messages]
modules: [src/errors/]
applies_to: [expected failures]
confidence: high
---
# Pattern: Error handling

## What
Failures the app expects are raised as `AppError` with a code.

## Where
- `src/errors/app-error.js` — `AppError`, `isAppError`, `toMessage`

## The Pattern
- Codes are short kebab-case strings (`not-found`, `http-error`).
- Anything that is not an `AppError` is unexpected; `toMessage` shows a
  generic text for it.

## Example
```js
throw new AppError('not-found', 'No such profile');
```
