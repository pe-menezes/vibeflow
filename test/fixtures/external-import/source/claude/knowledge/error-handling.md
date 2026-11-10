---
description: "Error model shared by all modules: typed AppError, error codes, and where errors are caught."
---

# Error handling

All modules raise `AppError` instead of a bare `Error`:

```js
export class AppError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.code = code;
  }
}
```

* `code` is an upper snake case string from the module's own list
  (`PROFILE_NOT_FOUND`, `NETWORK_TIMEOUT`).
* Errors are caught at the screen boundary only. Services and utilities let
  them propagate; they never swallow an error to return `null`.
* When a lower error is wrapped, it goes in `cause`, so the original stack
  survives.
* User-facing text is chosen by the screen from the `code`; the `message` is
  for logs.
