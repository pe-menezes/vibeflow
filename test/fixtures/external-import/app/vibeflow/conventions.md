# Conventions

<!-- vibeflow:auto:start -->
## Language and modules
- JavaScript ES modules (`"type": "module"`), relative imports with the `.js`
  extension.
- Named exports; no default exports.

## Naming
- Files are kebab-case: `home-screen.js`, `home-routes.js`.
- Factories are named `create<Thing>`: `createNavigator`, `createHomeScreen`.
- Constants objects are UPPER_CASE (`ROUTES`).

## Organization
- One folder per feature under `src/features/`; routes in a `navigation/`
  subfolder of the feature.
- Shared helpers in `src/utils/`, without imports from features.

## Tests
- `node:test` with `node:assert/strict`, one file per unit in `test/`.
- Run everything with `npm test`.
<!-- vibeflow:auto:end -->
