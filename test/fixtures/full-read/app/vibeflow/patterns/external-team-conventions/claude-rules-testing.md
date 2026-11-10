---
kind: convention
tags: [testing, node-test, test-naming, fakes]
description: "Testing conventions for every package: node:test, one test file per source module, names that read as behavior."
modules: []
applies_to: []
confidence: imported
source: team-conventions
source_file: .claude/rules/testing.md
source_ref: /work/team-conventions
source_commit: 3f6a9c2e81d47b05c9e2a6f13d8b7e4a05c19f2d
imported: 2026-01-20
---
# Convention: Testing

> Imported from team-conventions (.claude/rules/testing.md @ 3f6a9c2) on 2026-01-20.

# Testing

These rules hold in every package of the team, whatever the package does.

## Runner and layout

* Tests run on `node:test` with `node:assert/strict`. No other runner and no
  assertion library.
* One test file per source module, named after it: `src/orders/order-list.js`
  is covered by `test/order-list.test.js`.
* A module that is only wiring (a composition root, a routes file) is covered
  by the test of the flow it wires, not by a test of its own.

## Names

* A test name is a sentence about behavior, in the present tense, without
  "should": "an empty cart has a total of zero".
* The name says the condition and the outcome. "works", "handles errors" and
  "edge cases" are not names.

## Shape of a test

* Arrange, act, assert, in that order, with a blank line between the parts
  when the test is longer than five lines.
* One behavior per test. Several asserts are fine when they describe the same
  outcome.
* Build the objects under test with their real factories. Replace only the
  edges: the clock, the network, the file system.
* Never assert on a log line unless logging is the behavior under test.

## Doubles

* Doubles are small hand-written objects, kept in the package's testing
  folder and covered by their own tests.
* A double records what it received so the test can check it; it does not
  assert by itself.

## What every change brings

* A new module comes with its test file in the same pull request.
* A bug fix comes with the test that failed before the fix, in the same
  commit as the fix.
* A test that fails now and then is fixed or deleted the day it is seen; it
  is never retried until it passes.
* The full suite runs before every push; a red suite is not pushed.
