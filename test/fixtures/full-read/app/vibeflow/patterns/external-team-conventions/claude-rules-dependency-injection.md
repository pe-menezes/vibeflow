---
kind: pattern
tags: [di, container, services, modules]
paths: ["**/di/**", "**/*-module.js"]
description: "How services are declared and resolved through the container: factories, lifetimes and module files."
modules: []
applies_to: []
confidence: imported
source: team-conventions
source_file: .claude/rules/dependency-injection.md
source_ref: /work/team-conventions
source_commit: 3f6a9c2e81d47b05c9e2a6f13d8b7e4a05c19f2d
imported: 2026-01-20
---
# Pattern: Dependency injection

> Imported from team-conventions (.claude/rules/dependency-injection.md @ 3f6a9c2) on 2026-01-20.

# Dependency injection

* Services are provided to the container as factories, never as ready values.
* A module that provides several services groups them in a `<module>-module.js`
  file that exports one `provide<Module>(container)` function.
* Only the composition root and module files call `container.provide`.
* Services that hold state are created once per app; everything else may be
  created per use.
