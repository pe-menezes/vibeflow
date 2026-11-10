---
paths: ["**/di/**", "**/*-module.js"]
description: "How services are declared and resolved through the container: factories, lifetimes and module files."
---

# Dependency injection

* Services are registered in the container through factories, never as
  ready-made instances: `container.register('clock', () => createClock())`.
* Every registration declares its lifetime explicitly (`singleton` or
  `transient`); there is no default.
* Each feature module owns a `<feature>-module.js` file that registers its
  services and nothing else. Modules never resolve services at import time.
* Code outside `di/` and `*-module.js` files receives its dependencies as
  function arguments; it never imports the container.
* Circular registrations are a startup error, not a runtime one: the container
  validates the graph once, in `container.seal()`.
