# Missing-base fixture

A small synthetic Node app in the three states the loop kit's scripts tell apart for the
knowledge base the `analyze` workflow writes (`.vibeflow/index.md`, `conventions.md`,
`decisions.md`, `patterns/`). Everything here is invented; nothing calls a model.
`test/missing-base-scripts.test.mjs` runs `preflight.mjs`, `check-briefing.mjs`,
`review-package.mjs` and `perimeter.mjs` over it.

## Build it

```
node test/fixtures/missing-base/make.mjs <dest> [--mode untracked|ignored] [--stage spec|change]
```

or, from a test, `makeMissingBase(dest, { mode, stage })`. `<dest>` must be empty or missing.
The command prints every path it created, one per line.

## The cases

* **`main/`**: a git repository on `main` with the app committed (`package.json` whose `test`
  is `node --test`, `src/errors.js`, `src/money.js`, `src/cart.js`, `test/cart.test.js`) and the
  knowledge base outside git. Each document holds a rule the code can be checked against:
  `index.md` (`Suggested budget: ≤ 4`), `conventions.md` (exported functions are named verb
  first), `decisions.md` (no runtime dependency), `patterns/errors.md` (codes like `CART_EMPTY`,
  messages like `cart: no items`) and `patterns/money.md` (integer cents, shown only through
  `formatPrice`). The present state.
* **`wt/`**: a linked worktree of `main/`, made by `git worktree add -b feature`, without the
  base: the missing-here state. With `--stage spec` (the default) it holds only
  `.vibeflow/specs/cart-total.md`, the spec `gen-spec` would leave, which lists both patterns
  under Applicable Patterns. With `--stage change` it also holds the uncommitted change to
  `src/cart.js` that implements the spec.
* **`plain/`**: a second repository with the same app and spec and no `.vibeflow/index.md`
  anywhere: the none state.
* **`home/`**: the scratch `HOME` the fixture's git runs with, so no global config reaches it.

## Modes

* `untracked` (the default): `.vibeflow/` is not in the committed `.gitignore`, so the base in
  `main/` (and a copy of it in `wt/`) shows in `git status` as untracked.
* `ignored`: the committed `.gitignore` lists `.vibeflow/`, as the default install does.
