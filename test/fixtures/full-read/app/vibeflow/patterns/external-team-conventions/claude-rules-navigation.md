---
kind: pattern
tags: [navigation, routes, screens, route-names]
paths: ["**/navigation/**"]
description: "Route tables and screen registration for every feature module: frozen ROUTES, prefixed kebab-case names, titled screens, navigation through ROUTES only."
modules: []
applies_to: []
confidence: imported
source: team-conventions
source_file: .claude/rules/navigation.md
source_ref: /work/team-conventions
source_commit: 3f6a9c2e81d47b05c9e2a6f13d8b7e4a05c19f2d
imported: 2026-01-20
---
# Pattern: Navigation rules

> Imported from team-conventions (.claude/rules/navigation.md @ 3f6a9c2) on 2026-01-20.

# Navigation rules

Every feature module owns a routes file under its `navigation/` folder. The
file is the only place where the module's route names are written, and the
only place where its screens are registered on the navigator.

## Rules

1. **The routes file exports `ROUTES` frozen with `Object.freeze`.** A
   routes table that can be changed at runtime is a bug waiting for a test
   that renames a route by accident.
2. **Route names are kebab-case and prefixed with the module.** The name is
   `<module>/<screen>`: `orders/list`, `orders/detail`. Two modules can then
   have a screen called `edit` without clashing, and logs say which module a
   route belongs to.
3. **Every screen passed to `navigator.register` declares a non-empty
   `title`.** The title is a property of the screen object, in sentence case,
   next to `render`. The shell shows it in the header and in the history.
4. **`navigate` receives `ROUTES.X`, never a string literal.** This holds
   inside the module and outside it: another module that opens one of your
   screens imports your `ROUTES`.

## Registration

* The register function is named `register<Module>Routes` and is exported
  from the routes file. The composition root calls it once.
* The register function builds every screen of the module with its factory
  and registers it under its `ROUTES` entry, in the order of `ROUTES`.
* Screens get what they need as factory options. The register function is
  the one place that resolves services for them.

## Example

```js
export const ROUTES = Object.freeze({
  LIST: 'orders/list',
  DETAIL: 'orders/detail',
});

/** Registers the orders screens on the navigator. */
export function registerOrdersRoutes(navigator, screens) {
  navigator.register(ROUTES.LIST, screens.list);
  navigator.register(ROUTES.DETAIL, screens.detail);
}
```

## Anti-patterns

* A second routes file in the same module "for the admin screens". One
  module, one table.
* Building a route name at runtime (`` `orders/${kind}` ``). Every name is a
  literal in `ROUTES`.
* Registering a screen without a `title` because it "has no header". Every
  screen has one.
* Reading `navigator.current()` to decide what a screen renders. A screen
  renders from its params and its own state.
