# External-import fixture

A synthetic pair of repositories for the acceptance run of `teach --from`:
a source of team conventions and a small app that already has a `.vibeflow/`.
Everything here is invented; no real team, product or app is described.

Nothing in this folder calls a model. `test/import-fixture.test.mjs` holds this
README's tables to the files and `prepare.mjs` to its output; the acceptance
run below is done by hand, in fresh sessions.

## The two sides

* **`source/`**, logical name `team-conventions`: twelve documents of team
  rules, knowledge notes, skills and docs, of three kinds (pattern, convention,
  workflow). It is what `teach --from` imports.
* **`app/`**, logical name `sample-app`: a dependency-free JavaScript ES module
  app (`npm test` runs `node --test`) with a `home` feature, a navigator, a
  service container and string helpers, plus a `.vibeflow/` in the `analyze`
  format with three local patterns (navigation, dependency injection,
  utilities). Its code follows its own local pattern, not the source's rules:
  `ROUTES` is a plain object, route names have no module prefix, screens have
  no `title`, and screens navigate with string literals.

This repository's `.gitignore` hides `.claude/`, `.vibeflow/` and `docs/` at
any depth, so the fixture stores them as `claude/`, `vibeflow/` and `_docs/`.
`prepare.mjs` renames them in the copy.

## Prepare

```
node test/fixtures/external-import/prepare.mjs <empty or missing directory>
```

It copies both sides into the directory, renames the folders above, makes each
one a git repository with a single commit (fixed author, dates and config, so
the source commit is the same on every run) and prints one line of JSON:

```
{"source":"<dir>/source","app":"<dir>/app","sourceCommit":"<40-char sha>"}
```

A directory that is not empty is refused and left untouched.

## Expected counts per glob

The globs `teach --from` scans after the fix, relative to the prepared source
root. Before the fix the last two rows are not scanned, so the base run finds
5 documents instead of 12.

| Glob | Expected |
|---|---|
| `.claude/skills/*/SKILL.md` | 2 |
| `CLAUDE.md` | 1 |
| `knowledge/**/*.md` | 0 |
| `docs/**/*.md` | 2 |
| `.cursorrules` | 0 |
| `.cursor/rules/*.mdc` | 0 |
| `AGENTS.md` | 0 |
| `.claude/rules/**/*.md` | 5 |
| `.claude/knowledge/**/*.md` | 2 |
| **Total** | **12** |

`knowledge/**/*.md` is anchored at the root, so it does not reach
`.claude/knowledge/`. `.claude/rules/platform/storage.md` sits one level down
to exercise `**`.

## Expected kind per document

By kind: 6 pattern, 2 convention, 4 workflow.

| Document | Kind | Reason |
|---|---|---|
| `.claude/rules/navigation.md` | pattern | How routes files and screen registration are structured; scoped by `paths: ["**/navigation/**"]`. |
| `.claude/rules/dependency-injection.md` | pattern | Container, factories and module files; scoped by two globs (`**/di/**`, `**/*-module.js`). |
| `.claude/rules/platform/storage.md` | pattern | Shape of per-feature storage adapters and their keys; scoped by `paths: ["**/storage/**"]`. |
| `.claude/rules/testing.md` | convention | Test runner, file naming and test names for every package; no `paths`, so it is global. |
| `.claude/rules/release-process.md` | workflow | Ordered steps to version, write the changelog and tag; no code shape. |
| `.claude/knowledge/error-handling.md` | pattern | The `AppError` model and where errors are caught. |
| `.claude/knowledge/team-onboarding.md` | workflow | A first-week checklist for people, not for code. |
| `.claude/skills/api-client/SKILL.md` | pattern | Structure of the shared HTTP client and per-resource request files. |
| `.claude/skills/feature-planning/SKILL.md` | workflow | Planning steps from issue to approved plan, before any code. |
| `CLAUDE.md` | convention | Mixed: mostly module, export and file naming rules, plus a short pull request section. |
| `docs/architecture.md` | pattern | Feature-based folder layout and the import boundaries between folders. |
| `docs/code-review.md` | workflow | How pull requests are reviewed and merged. |

## Navigation rules that exist only in the source

`.claude/rules/navigation.md` carries five rules. None of them is in the app's
local `patterns/navigation.md`, and the app's code breaks all five today. Each
is checkable by reading one JavaScript file:

1. The routes file exports `ROUTES` frozen with `Object.freeze`.
2. Route names are kebab-case and prefixed with the module (`profile/edit`).
3. Every screen passed to `navigator.register` declares a non-empty `title`.
4. `navigate` receives `ROUTES.X`, never a string literal.
5. Going back uses `navigator.back()`, never a forward navigation to the
   previous route name.

## Acceptance run

Each step is a new session in the prepared app, with the model declared on the
command line, one run per case; when a result is ambiguous, run it once more
and report both. `<source>`, `<app>` and `<sha>` are the values `prepare.mjs`
printed; `<sha7>` is the first seven characters of `<sha>`. Steps 2 to 7 run on
one prepared directory, in order; step 1 runs on its own prepared directory
with the plugin version before the fix.

```
node test/fixtures/external-import/prepare.mjs /tmp/vibeflow-import-acceptance
cd <app>
```

`teach` asks for a selection; in print mode answer it with a second call that
continues the session (`claude -p --continue "<answer>"`).

1. **Before the fix, the defect reproduces.** With the plugin at the base
   version: `claude -p --model <model> "/vibeflow:teach --from <source> --name team-conventions"`,
   then `claude -p --continue "all"`. Expect: the list shows 5 documents and
   none from `.claude/rules/` or `.claude/knowledge/`; the Pattern Registry
   block of `.vibeflow/index.md` is byte-identical to the prepared one; then
   step 4's `gen-spec` request produces a spec whose Applicable Patterns has
   no imported document.
2. **After the fix, teach lists the `.claude/` rules and notes by kind.** Same
   two calls, but answer the selection with the default instead of `all`
   (`claude -p --continue "accept the default selection"`). Expect: the list
   shows 12 documents grouped as pattern, convention and workflow, with the
   per-glob counts of the table above (5 from `.claude/rules/`, 2 from
   `.claude/knowledge/`), and the 4 workflow documents shown unselected.
3. **After the import, the index carries the imported entries with the
   source's scope, and `conventions.md` did not grow by whole documents.**
   Record `wc -l .vibeflow/conventions.md` before step 2. Expect:
   `.vibeflow/index.md` has a `## Imported Sources` section right after the
   Pattern Registry with one line for `external-team-conventions` pointing at
   `patterns/external-team-conventions/registry.md`, with the entry count and
   `commit <sha7>`; the registry entry for
   `patterns/external-team-conventions/rules-navigation.md` has
   `paths: ["**/navigation/**"]`; every imported file has
   `source_commit: <sha>`; `wc -l .vibeflow/conventions.md` is unchanged.
4. **`gen-spec` for a navigation feature picks the imported rule.**
   `claude -p --model <model> "/vibeflow:gen-spec Add a profile feature with an edit-profile screen. Create src/features/profile/navigation/profile-routes.js with the profile routes and src/features/profile/profile-edit-screen.js, and register the routes in src/app.js."`
   (`profile-routes.js` does not exist yet.) Expect: Applicable Patterns lists
   `patterns/external-team-conventions/rules-navigation.md — imported from team-conventions (.claude/rules/navigation.md @ <sha7>): ...`
   with the glob `**/navigation/**` and the planned file as the reason, the
   local `patterns/navigation.md` is listed too, and Technical Decisions writes
   down the divergence between them (for example the plain `ROUTES` object).
5. **A feature on another subject leaves the navigation rule out.**
   `claude -p --model <model> "/vibeflow:gen-spec Add formatCurrency(amountInCents, currencyCode) in src/utils/currency.js that formats an integer amount of cents as a currency string with two decimals, with tests."`
   Expect: Applicable Patterns does not list `rules-navigation.md`.
6. **`implement` follows, and `audit` catches a deviation that only the
   imported rule forbids.** `claude -p --model <model> "/vibeflow:implement <step 4 spec path>"`.
   Then pick one of the five navigation rules above whose text is not in the
   spec's Definition of Done (check with `grep`), break it by hand in
   `src/features/profile/navigation/profile-routes.js` (for example remove
   `Object.freeze`, or rename a route to `edit` without the prefix), and run
   `claude -p --model <model> "/vibeflow:audit <step 4 spec path>"`.
   Expect: a finding on `profile-routes.js` that names
   `patterns/external-team-conventions/rules-navigation.md` and
   `.claude/rules/navigation.md`.
7. **Reimport followed by `analyze --scope` keeps the entries.** Save
   `ls .vibeflow/patterns/external-team-conventions/` and the
   `## Imported Sources` block. Run step 2's two calls again, then
   `claude -p --model <model> "/vibeflow:analyze --scope src/features/home"`.
   Expect: the same file list, no duplicate entry in `registry.md`, one line
   for the source in the `vibeflow:sources` block, and the local Pattern
   Registry still lists only the three local patterns.
