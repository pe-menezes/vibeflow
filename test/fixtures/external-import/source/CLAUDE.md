# Team conventions

Shared instructions for every project of the team.

## Code

* JavaScript ES modules only; no CommonJS `require`.
* Named exports only; no default exports.
* File names are kebab-case (`profile-screen.js`).
* Prefer pure functions; side effects live at the edges (screens, adapters).

## Pull requests

* Branch names follow `<type>/<short-description>` (`feat/profile-edit`).
* A pull request description has a summary, a test plan and a screenshot for
  any visual change.
* Squash-merge after one approval and a green pipeline.
