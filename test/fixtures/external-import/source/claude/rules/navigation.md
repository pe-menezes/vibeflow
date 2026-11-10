---
paths: ["**/navigation/**"]
description: "Route tables and screen registration for every feature module: frozen ROUTES, prefixed kebab-case names, titled screens, navigation through ROUTES only."
---

# Navigation rules

These rules apply to every file under a `navigation/` folder. Each one is
checked in review; a routes file that breaks one is sent back.

1. **The routes file exports a frozen `ROUTES` object.** Declare it as
   `export const ROUTES = Object.freeze({ ... })`. A plain object literal is
   not accepted, because any screen could reassign a route at runtime.
2. **Route names are kebab-case and prefixed with the module.** The value of
   every entry is `<module>/<kebab-case-name>`: `profile/edit`,
   `profile/change-password`, `home/main`. A bare name such as `edit` or a
   camelCase name such as `changePassword` is rejected.
3. **Every registered screen declares a `title`.** The object passed to
   `navigator.register(name, screen)` carries a non-empty string `title`
   property next to `render`. Screens without a title break the header bar.
4. **Navigation goes through `navigate(ROUTES.X)` only.** Never pass a string
   literal to `navigate`, not even one that equals a route value
   (`navigate('profile/edit')` is a violation). Import the module's `ROUTES`
   and use the key.
5. **Going back uses `navigator.back()`.** Never navigate forward to the
   previous route's name to simulate a back action; the history stack would
   grow and the system back gesture would loop.

## Example

```js
export const ROUTES = Object.freeze({
  EDIT: 'profile/edit',
});

export function registerProfileRoutes(navigator, screens) {
  navigator.register(ROUTES.EDIT, { title: 'Edit profile', render: screens.edit });
}
```
