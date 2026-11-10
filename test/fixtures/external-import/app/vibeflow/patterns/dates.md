---
tags: [dates, formatting, utc]
modules: [src/dates/]
applies_to: [dates shown to people]
confidence: high
---
# Pattern: Dates

## What
Dates travel as `Date` objects and are shown as `YYYY-MM-DD` in UTC.

## Where
- `src/dates/format-date.js` — `formatDate`, `addDays`

## The Pattern
- Code that needs "now" receives a clock with `now()`; it never calls
  `new Date()` without an argument.
- Day arithmetic goes through `addDays`.

## Example
```js
formatDate(addDays(clock.now(), 1));
```
