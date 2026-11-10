---
tags: [di, container, services]
modules: [src/di/]
applies_to: [services, composition root]
confidence: high
---
# Pattern: Dependency injection

## What
A small container holds named values that are built lazily on first use.

## Where
- `src/di/container.js` — `createContainer()`
- `src/app.js` — the only place that calls `provide`

## The Pattern
- `container.provide(name, factory)` stores a factory; `container.get(name)`
  builds the value once and caches it.
- The factory receives the container, so a value can depend on another.
- Features receive the container in their register function and read what
  they need with `get`.

## Example
```js
const container = createContainer();
container.provide('greeting', () => greeting);
registerHomeRoutes(navigator, container);
```
