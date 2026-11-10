---
tags: [navigation, routes, screens]
modules: [src/navigation/, src/features/home/navigation/]
applies_to: [routes files, screens]
confidence: high
---
# Pattern: Navigation

## What
Each feature declares its route names in a routes file and registers its
screens on the shared navigator. The navigator renders a screen by name.

## Where
- `src/navigation/navigator.js` — `createNavigator()`
- `src/features/<feature>/navigation/<feature>-routes.js` — one per feature

## The Pattern
- The routes file exports a `ROUTES` object mapping an UPPER_CASE key to the
  route name, and a `register<Feature>Routes(navigator, container)` function.
- `register<Feature>Routes` builds each screen with its factory and calls
  `navigator.register(name, screen)`.
- A screen is an object with a `render(params)` method; screens that move to
  another screen receive the navigator in their factory options and call
  `navigator.navigate(name)`.
- `src/app.js` calls every feature's register function once, at startup.

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

## Rules
- Registering the same name twice throws; each name belongs to one feature.
- Tests drive screens through the navigator built by `createApp()`.
