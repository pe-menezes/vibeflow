---
tags: [navigation, routes, screens]
modules: [src/navigation/, src/features/home/navigation/]
applies_to: [routes files, screens]
confidence: high
---
# Pattern: Navigation

## What
Each feature declares its route names in a routes file and registers its
screens on the shared navigator. The navigator renders a screen by name and
keeps the list of visited names, so it can go back.

## Where
- `src/navigation/navigator.js` — `createNavigator()`
- `src/features/<feature>/navigation/<feature>-routes.js` — one per feature
- `src/app.js` — calls each feature's register function once

## The Pattern
- The routes file exports a `ROUTES` object mapping an UPPER_CASE key to the
  route name, and a `register<Feature>Routes(navigator, container)` function.
- `register<Feature>Routes` builds each screen with its factory and calls
  `navigator.register(name, screen)`.
- The register function is the only place of a feature that reads the
  container: it gets the services each screen needs and passes them in the
  screen's options.
- A screen is an object with a `render(params)` method; screens that move to
  another screen receive the navigator in their factory options and call
  `navigator.navigate(name, params)`.
- `src/app.js` calls every feature's register function once, at startup, in
  the order the features were added.

## Navigator API
- `register(name, screen)` adds a screen; a second registration of the same
  name throws.
- `navigate(name, params)` renders the screen for `name` with `params`,
  pushes `name` on the history and returns what the screen rendered.
- `back(params)` drops the current name from the history and renders the
  previous screen with `params` (an empty object by default). With nothing
  to go back to it returns `null` and changes nothing.
- `current()` is the name on top of the history, or `null`.
- `routes()` lists the registered names in registration order.

## Example
From `src/features/home/navigation/home-routes.js`:

```js
export const ROUTES = {
  HOME: 'home',
  SETTINGS: 'settings',
};

export function registerHomeRoutes(navigator, container) {
  navigator.register(ROUTES.HOME, createHomeScreen({ navigator, greeting: container.get('greeting') }));
  navigator.register(ROUTES.SETTINGS, createSettingsScreen({ navigator }));
}
```

And in `src/app.js`:

```js
const navigator = createNavigator();
registerHomeRoutes(navigator, container);
```

## Params
- Params are a plain object. A screen that needs a record receives its id
  (`{ id }`), never the record itself, and loads it.
- A screen ignores params it does not know.

## Rules
- Registering the same name twice throws; each name belongs to one feature.
- A feature never registers a screen of another feature.
- Tests drive screens through the navigator built by `createApp()`.
- Tests that check the registered routes check that the feature's names are
  there, not the exact list, so a new feature does not break them.
