# Conventions

<!-- vibeflow:auto:start -->
## Language and modules
- JavaScript ES modules (`"type": "module"`), relative imports with the `.js`
  extension.
- Named exports; no default exports.
- No dependencies at runtime. A new package needs a decision entry in
  `decisions.md` before it lands in `package.json`.
- Node.js 22 is the only runtime the code is written for; no transpiler, no
  bundler, no type checker in the build.
- Prefer `const`; `let` only for a value that is reassigned in the same scope.
- No classes in application code. Behavior lives in factories that return
  plain objects, and state lives in the closure of the factory.

## Naming
- Files are kebab-case: `home-screen.js`, `home-routes.js`.
- Factories are named `create<Thing>`: `createNavigator`, `createHomeScreen`.
- Constants objects are UPPER_CASE (`ROUTES`).
- Functions and variables are camelCase; a boolean reads as a question
  (`isDirty`, `hasErrors`, `canLeave`).
- A screen factory is `create<Name>Screen` and lives in `<name>-screen.js`.
- A routes file is `<feature>-routes.js` and exports `register<Feature>Routes`.
- Test files mirror the unit they cover: `form.js` is tested by
  `test/form.test.js`.
- Abbreviations are written as words: `createHttpClient`, not `createHTTPClient`.

## Organization
- One folder per feature under `src/features/`; routes in a `navigation/`
  subfolder of the feature.
- Shared helpers in `src/utils/`, without imports from features.
- Shared building blocks (state, storage, errors, HTTP, logging, forms,
  validation, dates, config) live in one folder each under `src/`.
- A feature never imports from another feature. What two features share moves
  to a building block or to `src/utils/`.
- `src/app.js` is the composition root and the only module that knows every
  feature.
<!-- vibeflow:auto:end -->

## Functions and modules
- A module exports what other modules use and nothing else. A helper used by
  one function stays private to its file.
- Keep functions short enough to read without scrolling; a function that
  needs a comment to separate its steps is usually two functions.
- Factories take one options object, destructured in the signature, so call
  sites read as named arguments: `createProfileStorage({ storage, logger })`.
- Optional options get their default in the destructuring, not in the body.
- Return early on invalid input instead of nesting the happy path.
- Do not mutate arguments. Copy objects with spread before changing them.
- Prefer `Object.entries` and array methods over index loops when the index
  itself is not needed.
- Async functions are named for what they return (`loadProfile`), not for
  the fact that they are async.

## Errors
- Code that can fail for a reason the user should see throws an `AppError`
  with a code from `src/errors/app-error.js`.
- Programming mistakes (a missing route, a service nobody provided) throw a
  plain `Error` with a message that names the missing thing.
- Never swallow an error silently. A `catch` either rethrows, converts to an
  `AppError`, or logs with `logger.error` and returns a value the caller
  checks.
- Error messages shown to the user come from the message table in
  `src/errors/`, never from `error.message` of a lower layer.

## Screens
- A screen is a plain object returned by its factory, with `render(params)`
  and the actions the screen offers.
- Screens receive the navigator, services and callbacks through the options
  object of their factory; a screen never reaches into the container.
- A screen keeps no state outside its own closure.
- `render` returns text in this app; it does not change state.
- User-facing strings are written in sentence case: "Edit profile", not
  "Edit Profile".

## State and data
- Shared state goes through the store in `src/state/`; a screen keeps its
  own draft in a form.
- Data that must survive a restart goes through the storage adapter; keys
  follow the storage pattern.
- Dates travel as ISO strings in UTC and are formatted only at the edge,
  with the helpers in `src/dates/`.
- Configuration is read once, at startup, through `loadConfig`.
- Identifiers that come from storage or from the server are strings, even
  when they look like numbers; never compare them with numbers.
- A value object handed to another module is a copy; nobody keeps a
  reference to an object they did not create.

## Logging
- Each feature builds its own scoped logger with `createLogger('<feature>')`.
- Log what happened, not what the code is about to do: `profile.saved`, not
  `saving profile`.
- Never log a whole record; log its id and the fields that matter.

## Comments and documentation
- A comment explains why, not what. If the code needs a comment to say what
  it does, rename until it does not.
- Each module may open with a short comment that says what the module is for,
  in one or two sentences.
- `TODO` comments carry a reason and are removed in the same pull request or
  turned into an issue.
- Commented-out code is deleted, not kept.

## Tests
- `node:test` with `node:assert/strict`, one file per unit in `test/`.
- Run everything with `npm test`.
- Test names read as sentences about behavior: "save keeps the draft when
  validation fails".
- A test builds what it needs with the real factories and the fakes from
  `src/testing/`; there is no mocking library.
- Screens are tested through the navigator that `createApp()` builds, so a
  test covers the wiring as well as the screen.
- A bug fix comes with the test that failed before the fix.
- No test depends on the order of other tests or on the real clock.

## Formatting
- Two spaces of indentation, single quotes, semicolons, trailing commas on
  multi-line literals.
- Lines up to 110 characters; break long calls one argument per line.
- One blank line between top-level declarations; none at the start of a
  block.
- Imports are grouped: building blocks first, then the feature's own files,
  each group in alphabetical order of path.

## Git and pull requests
- One subject per pull request; a refactor and a feature go in separate ones.
- Commit messages are imperative and short: "Add profile storage".
- A pull request that adds a screen includes its tests and its route
  registration in the same change.
- Branches are named `<kind>/<short-subject>`: `feat/profile-edit`,
  `fix/settings-back`.

## Feature files
- A feature folder holds its screens, its routes file in `navigation/` and,
  when needed, its storage adapter and its constants.
- Feature-specific helpers stay in the feature folder until a second feature
  needs them.
- Every new file under `src/features/` opens with the line `// feature: <name>`, where `<name>` is the feature's folder.
