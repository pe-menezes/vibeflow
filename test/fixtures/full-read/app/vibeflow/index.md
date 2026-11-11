# Project: sample-app
> Analyzed: 2026-01-15
> Stack: JavaScript (ES modules), Node.js 22, node:test, no dependencies
> Type: small client application organized by feature
> Suggested budget: ≤ 6 files per task

## Structure
A composition root (`src/app.js`) builds a service container with the config,
logger and storage, and a navigator, then lets each feature register its
routes. Features live under `src/features/<feature>/`; shared building blocks
(state, storage, errors, HTTP, logging, forms, validation, dates, config) live
in one folder each under `src/`; shared helpers live in `src/utils/`.

## Structural Units
- `src/app.js` — composition root
- `src/navigation/` — the in-memory navigator
- `src/di/` — the service container
- `src/features/home/` — home and settings screens, with their routes file
- `src/state/` — the observable store
- `src/storage/` — the key-value storage adapter
- `src/errors/` — `AppError` and its helpers
- `src/http/` — the JSON HTTP client
- `src/logging/` — the scoped logger
- `src/forms/` — form values and dirty state
- `src/validation/` — field validators
- `src/dates/` — date formatting and arithmetic
- `src/config/` — settings with defaults
- `src/testing/` — test doubles shared by the tests
- `src/utils/` — pure string helpers
- `test/` — one `node:test` file per unit

## Pattern Registry

<!-- vibeflow:patterns:start -->
patterns:
  - file: patterns/navigation.md
    tags: [navigation, routes, screens]
    modules: [src/navigation/, src/features/home/navigation/]
  - file: patterns/dependency-injection.md
    tags: [di, container, services]
    modules: [src/di/]
  - file: patterns/utilities.md
    tags: [utils, helpers, strings]
    modules: [src/utils/]
  - file: patterns/state.md
    tags: [state, store, subscriptions]
    modules: [src/state/]
  - file: patterns/storage.md
    tags: [storage, persistence, keys]
    modules: [src/storage/]
  - file: patterns/error-handling.md
    tags: [errors, app-error, messages]
    modules: [src/errors/]
  - file: patterns/http-client.md
    tags: [http, client, fetch]
    modules: [src/http/]
  - file: patterns/logging.md
    tags: [logging, logger, diagnostics]
    modules: [src/logging/]
  - file: patterns/forms.md
    tags: [forms, fields, dirty-state]
    modules: [src/forms/]
  - file: patterns/validation.md
    tags: [validation, validators, fields]
    modules: [src/validation/]
  - file: patterns/dates.md
    tags: [dates, formatting, utc]
    modules: [src/dates/]
  - file: patterns/configuration.md
    tags: [config, settings, defaults]
    modules: [src/config/]
  - file: patterns/testing.md
    tags: [testing, node-test, fakes]
    modules: [test/, src/testing/]
<!-- vibeflow:patterns:end -->

## Imported Sources

<!-- vibeflow:sources:start -->
- external-team-conventions: `patterns/external-team-conventions/registry.md` — 6 entries (3 pattern, 3 convention, 0 workflow), commit 3f6a9c2, imported 2026-01-20
<!-- vibeflow:sources:end -->

## Pattern Docs Available
- `patterns/navigation.md` — how features declare routes and register screens on the navigator
- `patterns/dependency-injection.md` — providing and resolving services through the container
- `patterns/utilities.md` — pure helpers in `src/utils/` and their tests
- `patterns/state.md` — the observable store, updates and subscriptions
- `patterns/storage.md` — the storage adapter and its key names
- `patterns/error-handling.md` — `AppError` codes and the message shown for each error
- `patterns/http-client.md` — the JSON client over an injected `fetch`
- `patterns/logging.md` — scoped loggers, levels and sinks
- `patterns/forms.md` — form values, dirty state and reset
- `patterns/validation.md` — validators and the errors object
- `patterns/dates.md` — UTC day format, clocks and day arithmetic
- `patterns/configuration.md` — defaults, overrides and the frozen config
- `patterns/testing.md` — one test file per unit and the shared fakes

## Key Files
- `src/app.js` — wires container, navigator and feature routes
- `src/navigation/navigator.js` — register, navigate, back, current
- `src/di/container.js` — provide and lazy get
- `src/features/home/navigation/home-routes.js` — the home feature's routes
- `src/features/home/home-screen.js` — home screen
- `src/features/home/settings-screen.js` — settings screen
- `src/forms/form.js` — values, set, reset, isDirty
- `src/validation/validators.js` — required, maxLength, validate
- `src/utils/strings.js` — capitalize and truncate

## Dependencies (critical only)
None.

## Known Issues / Tech Debt
- Screens receive the navigator directly instead of a narrower interface.

<!-- vibeflow:auto:start -->
## Tests
- Full suite: `npm test` — unmeasured
- Affected only: `node --test test/<unit>.test.js` — unmeasured

## Pitfalls
<!-- vibeflow:auto:end -->
