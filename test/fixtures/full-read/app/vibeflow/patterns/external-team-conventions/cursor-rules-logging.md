---
kind: convention
tags: [logging, logger, event-names, secrets]
description: "Logging convention for every module: a scoped logger, dot-separated event names, details in a data object, no console calls."
alwaysApply: true
modules: []
applies_to: []
confidence: imported
source: team-conventions
source_file: .cursor/rules/logging.mdc
source_ref: /work/team-conventions
source_commit: 3f6a9c2e81d47b05c9e2a6f13d8b7e4a05c19f2d
imported: 2026-01-20
---
# Convention: Logging

> Imported from team-conventions (.cursor/rules/logging.mdc @ 3f6a9c2) on 2026-01-20.

# Logging

Logs are read by people on call and by the alerting that watches the event
names. Both depend on the shape below.

## The logger

* Every module that logs builds a scoped logger once, at the top of its
  factory or of its register function: `createLogger('<feature>')`.
* No module calls `console.log`, `console.warn` or `console.error`. The only
  exception is the command-line entry point of a tool, outside `src/`.
* The logger is passed down as an option to the objects that need it; it is
  not imported as a singleton.

## Event names

* The message of a log call is an event name, not a sentence:
  `<feature>.<event>`, lower case, words in the event joined with a hyphen
  (`orders.item-added`, `profile.saved`).
* The event is in the past tense and names what happened, not what is about
  to happen: `orders.loaded`, never `orders.loading`.
* An event name is never built from variables. Details go in the data object.

## The data object

* Details go in the second argument, a flat object: `{ id, count }`.
* Identifiers are logged; content is not. Log a record's id, never the record,
  and never what the user typed in a free-text field.
* Never log tokens, passwords, keys, e-mail addresses or phone numbers, not
  even partially.
* Durations are in milliseconds under a key that ends in `Ms`.

## Levels

* `info` for things that happened as expected and that someone may want to
  count: a save, a load, a sign-in.
* `warn` for things that went wrong and were handled: a validation that
  failed, a retry, a fallback used.
* `error` for things that went wrong and were not handled, always with the
  error's code in the data object.

## Example

```js
const logger = createLogger('orders');
logger.info('orders.item-added', { orderId, itemId });
logger.warn('orders.save-rejected', { orderId, fields: Object.keys(errors) });
```
