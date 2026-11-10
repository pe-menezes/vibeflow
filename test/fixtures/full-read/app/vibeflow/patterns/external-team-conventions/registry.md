# Imported from team-conventions

> Source: /work/team-conventions · commit 3f6a9c2 · imported 2026-01-20 · 6 entries (3 pattern, 3 convention, 0 workflow)

<!-- vibeflow:imported:start -->
entries:
  - file: patterns/external-team-conventions/claude-rules-code-style.md
    kind: convention
    tags: [code-style, jsdoc, documentation, exports, constants]
    paths: ["**/*.js"]
    description: "Code style for every JavaScript file: JSDoc on exports, naming of values, constants and the shape of small functions."
  - file: patterns/external-team-conventions/claude-rules-dependency-injection.md
    kind: pattern
    tags: [di, container, services, modules]
    paths: ["**/di/**", "**/*-module.js"]
    description: "How services are declared and resolved through the container: factories, lifetimes and module files."
  - file: patterns/external-team-conventions/claude-rules-navigation.md
    kind: pattern
    tags: [navigation, routes, screens, route-names]
    paths: ["**/navigation/**"]
    description: "Route tables and screen registration for every feature module: frozen ROUTES, prefixed kebab-case names, titled screens, navigation through ROUTES only."
  - file: patterns/external-team-conventions/claude-rules-testing.md
    kind: convention
    tags: [testing, node-test, test-naming, fakes]
    description: "Testing conventions for every package: node:test, one test file per source module, names that read as behavior."
  - file: patterns/external-team-conventions/cursor-rules-logging.md
    kind: convention
    tags: [logging, logger, event-names, secrets]
    description: "Logging convention for every module: a scoped logger, dot-separated event names, details in a data object, no console calls."
    alwaysApply: true
  - file: patterns/external-team-conventions/docs-screens.md
    kind: pattern
    tags: [screens, edit-screen, list-screen, drafts, navigation, copy]
    description: "Screens handbook: anatomy of a screen, list, detail and edit screens, the edit flow from load to back, error and empty states, copy, and how screens are tested and reviewed."
<!-- vibeflow:imported:end -->
