# Project: sample-app
> Analyzed: 2026-01-15
> Stack: JavaScript (ES modules), Node.js 22, node:test, no dependencies
> Type: small client application organized by feature
> Suggested budget: ≤ 4 files per task

## Structure
A composition root (`src/app.js`) builds a service container and a navigator,
then lets each feature register its routes. Features live under
`src/features/<feature>/`; shared helpers live in `src/utils/`.

## Structural Units
- `src/app.js` — composition root
- `src/navigation/` — the in-memory navigator
- `src/di/` — the service container
- `src/features/home/` — home and settings screens, with their routes file
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
<!-- vibeflow:patterns:end -->

## Pattern Docs Available
- `patterns/navigation.md` — how features declare routes and register screens on the navigator
- `patterns/dependency-injection.md` — providing and resolving services through the container
- `patterns/utilities.md` — pure helpers in `src/utils/` and their tests

## Key Files
- `src/app.js` — wires container, navigator and feature routes
- `src/navigation/navigator.js` — register, navigate, back, current
- `src/di/container.js` — provide and lazy get
- `src/features/home/navigation/home-routes.js` — the home feature's routes
- `src/features/home/home-screen.js` — home screen
- `src/features/home/settings-screen.js` — settings screen
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
