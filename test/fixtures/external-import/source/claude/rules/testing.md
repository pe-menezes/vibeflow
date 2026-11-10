---
description: "Testing conventions for every package: node:test, one test file per source module, names that read as behavior."
---

# Testing conventions

* Tests use `node:test` and `node:assert/strict`; no other test runner.
* One test file per source module, named `<module>.test.js`, in the
  package's `test/` folder.
* Test names describe behavior in plain words ("formats negative amounts with a
  leading minus"), never the function name alone.
* A test never reads the clock or the network. Pass a fixed clock or a fake
  client as an argument.
* A bug fix lands with a test that fails before the fix.
