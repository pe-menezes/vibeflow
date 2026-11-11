# Spec: Profile edit screen

## Objective
A user can open an edit-profile screen at `profile/edit` with a profile id, change the display name and the bio, save a valid draft and land back where they came from.

## Context
The app has a `home` feature only. `src/app.js` registers `registerHomeRoutes` and nothing else, and `test/home.test.js` asserts the exact route list (`deepEqual(navigator.routes(), [HOME, SETTINGS])`), so any new route breaks it. The building blocks the screen needs already exist: `createForm` (`src/forms/form.js`), `required` and `maxLength` (`src/validation/validators.js`), the memory storage adapter provided as `storage`, `createLogger` and the navigator. No feature has an edit screen yet, so there is no local example of one.

## Definition of Done
1. `src/features/profile/navigation/profile-routes.js` exports `ROUTES = Object.freeze({ EDIT: 'profile/edit' })` and `registerProfileRoutes(navigator, container)`, which builds the edit screen, registers it under `ROUTES.EDIT` and returns `{ edit }`. `createApp()` returns it as `screens.profile`.
   Scenarios:
   WHEN `createApp()` is built THE SYSTEM SHALL list `profile/edit` in `navigator.routes()`, and the screen registered there SHALL have `title === 'Edit profile'`
2. `src/features/profile/profile-edit-screen.js` exports `createProfileEditScreen({ navigator, storage, logger, confirmDiscard })`. Rendering with `{ id }` loads the record stored under `profile.<id>` into a form with two fields, display name and bio, and prints one line per field; with no record stored, the fields start empty.
   Scenarios:
   WHEN `profile.u1` holds `{ id: 'u1', displayName: 'Ada', bio: 'Math' }` and the app navigates to `ROUTES.EDIT` with `{ id: 'u1' }` THE SYSTEM SHALL render a line with `Ada` and a line with `Math`
3. Validation: the display name is required and has at most 40 characters; the bio has at most 160 characters. Values are trimmed before they are validated and saved.
   Scenarios:
   WHEN the display name is set to `'   '` and the screen saves THE SYSTEM SHALL return `{ ok: false, errors }` with a message for `displayName` only, store nothing and stay on `profile/edit`
   WHEN the bio is set to 161 characters and the screen saves THE SYSTEM SHALL return a message for `bio` and store nothing
4. Saving a valid draft writes the record once, merged over what was loaded, logs it, and returns to the screen the edit screen was opened from.
   Scenarios:
   WHEN the app navigates `HOME` → `ROUTES.EDIT` with `{ id: 'u1' }`, sets a valid display name and saves THE SYSTEM SHALL return `{ ok: true }`, store `profile.u1` with the new name and the other fields kept, and `navigator.current()` SHALL be `home`
5. Leaving: `leave()` with a dirty draft asks `confirmDiscard()` and stays on the screen (returning `false`) when it answers no; with a clean draft, or a yes, it goes back. `createApp` takes a `confirmDiscard` option, provided in the container, defaulting to `() => false`.
   Scenarios:
   WHEN `createApp()` is called without `confirmDiscard` and the user leaves a dirty draft THE SYSTEM SHALL stay on `profile/edit`
   WHEN `createApp({ confirmDiscard: () => true })` and the user leaves a dirty draft THE SYSTEM SHALL go back to the previous route
6. Existing behavior is preserved: `test/home.test.js` passes with its route assertion changed to check that `home` and `settings` are registered, not that they are the only routes. Craftsmanship: the new and changed files follow the applicable patterns and imported entries below, nothing under `src/features/profile/` imports from `src/features/home/`, and `npm test` is green.

## Scope
Files (5, budget ≤ 6):
- `src/features/profile/profile-edit-screen.js` (new): the screen factory, its field descriptors and its rules.
- `src/features/profile/navigation/profile-routes.js` (new): `ROUTES` and `registerProfileRoutes(navigator, container)`, which builds the screen with `storage` and `confirmDiscard` from the container and a `createLogger('profile')`.
- `src/app.js` (change): the `confirmDiscard` option and its `container.provide`, one call to `registerProfileRoutes` after `registerHomeRoutes`, and `screens` in the returned object.
- `test/profile-edit.test.js` (new): drives the screen through `createApp()`.
- `test/home.test.js` (change): relax the exact `routes()` assertion only.

## Anti-scope
- An entry point into the profile from the home screen. Reaching the profile is `navigator.navigate(ROUTES.EDIT, { id })`.
- Renaming the home routes or freezing the home `ROUTES`, even though the imported navigation rule asks for it. That is its own spec.
- A profile storage adapter or a `profile-module.js`. The screen uses the shared `storage` from the container.
- A real confirmation dialog. `confirmDiscard` is an injected function.
- Any change to the navigator, the form, the validators or the storage adapter.

## Technical Decisions
- **The edit flow follows the imported screens handbook, not a local example.** No local screen edits a record. The handbook's edit-screen sections (load, validate, save, back, and leaving) are the norm for `render`, `validate`, `save` and `leave`; where it says how a step ends, the screen does exactly that.
- **Navigation: imported rules are the norm for the new routes file.** The local `navigation.md` shows a plain `ROUTES` object with bare names. Profile follows the imported rule (frozen `ROUTES`, `profile/edit`, a `title` on the screen, `navigate` through `ROUTES`). Home is not migrated here.
- **Register signature stays local:** `registerProfileRoutes(navigator, container)` matches `registerHomeRoutes`. It returns the screens it registered so tests reach the screen object without a test-only export.
- **Field descriptors and rules live in the screen file**, as the local forms and validation patterns say, declared once at module level. Their ids and limits follow the patterns and imported entries listed below.
- **Feature logger built in the routes file** (`createLogger('profile')`), as the imported logging convention scopes loggers by feature. Event names follow it.
- **`confirmDiscard` defaults to `() => false`.** Without a dialog the safe default is to never discard silently.
- **`test/home.test.js` is changed, not worked around.** Its assertion becomes `includes` checks for `HOME` and `SETTINGS`.

## Applicable Patterns
- `patterns/forms.md`: the draft lives in `createForm`; field descriptors at module level; `reset` after a successful save; its rules for descriptors apply to the two fields.
- `patterns/validation.md`: a rules object by field name, `required` and `maxLength`, validated again at the start of `save()`.
- `patterns/storage.md`: the record is stored under `profile.<id>`; the save merges over the loaded record.
- `patterns/navigation.md`: `register<Feature>Routes(navigator, container)` reads the container and passes services to the screen; `src/app.js` calls it once.
- `patterns/testing.md`: drive the screen through the navigator built by `createApp()`; check the routes by name, not the exact list.

Imported entries that apply: 5 (2 by glob, 1 by subject, 2 always on)
- patterns/external-team-conventions/claude-rules-navigation.md — imported from team-conventions (.claude/rules/navigation.md @ 3f6a9c2): glob `**/navigation/**` matches `src/features/profile/navigation/profile-routes.js`
- patterns/external-team-conventions/claude-rules-code-style.md — imported from team-conventions (.claude/rules/code-style.md @ 3f6a9c2): glob `**/*.js` matches all 5 files
- patterns/external-team-conventions/docs-screens.md — imported from team-conventions (docs/screens.md @ 3f6a9c2): subject, an edit screen that loads, validates, saves and goes back
- patterns/external-team-conventions/claude-rules-testing.md — imported from team-conventions (.claude/rules/testing.md @ 3f6a9c2): always on (`.claude/rules/`, no `paths`)
- patterns/external-team-conventions/cursor-rules-logging.md — imported from team-conventions (.cursor/rules/logging.mdc @ 3f6a9c2): always on (`alwaysApply: true`)

## Risks
- **Breaking the home suite:** the exact `routes()` assertion fails as soon as profile registers. DoD 6 changes only that assertion.
- **Unsafe discard default:** a default of `() => true` would drop edits silently. DoD 5 pins the default to "stay".
- **Partial overwrite:** writing only the edited fields would drop the rest of the record. DoD 4 requires the merge.

Risk code:
- deleting or overwriting data: `save()` in `profile-edit-screen.js` (what it writes to `profile.<id>`), `createApp` (the `confirmDiscard` default it provides)
