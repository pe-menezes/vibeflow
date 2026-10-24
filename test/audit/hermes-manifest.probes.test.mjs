// Behavior probes from independent audits of the Hermes Agent edition's root manifest,
// plugins/vibeflow/plugin.json, read by Hermes as an Agent Plugins v1 package. Hermes rejects
// the whole package (install and `hermes plugins validate` fail) when a field breaks one of the
// rules its reader applies in `_validate_manifest` of hermes_cli/agent_plugins.py; the
// implementer's test pins the top-level key set, the name, the schema URL and the version, and
// leaves the shape inside those keys open. Each case states, as comments, the contract it
// protects, the plausible regression that breaks it, and why the implementer's tests did not
// catch it. The suite has no dependencies, so each probe restates the reader's rule instead of
// calling Hermes.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const MANIFEST = 'plugins/vibeflow/plugin.json';

// The reader's `_AUTHOR_FIELDS`: any other key, or a non-string value, is fatal.
const HERMES_AUTHOR_FIELDS = ['email', 'name', 'url'];
// The reader types these top-level fields as strings and rejects anything else.
const HERMES_STRING_FIELDS = ['description', 'homepage', 'repository', 'license'];

function manifest() {
  return JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
}

// Contract: `author` is an object whose keys are a subset of name, email, url, each a string, because the Hermes reader raises "author may contain only string name, email, and url fields" for anything else and the package fails to install.
// Breaks when: a maintainer copies an npm- or GitHub-style author block (`github`, `twitter`, `avatar`) or an `email` as an array into the root manifest.
// Not covered by: the implementer's test asserts the sorted top-level keys include `author` and reads nothing inside it, so the suite stays green while `hermes plugins validate` fails.
test('Hermes root manifest: author carries only string name, email and url fields', () => {
  const { author } = manifest();
  assert.equal(typeof author, 'object');
  assert.ok(author !== null && !Array.isArray(author), 'author must be a plain object');
  for (const [key, value] of Object.entries(author)) {
    assert.ok(HERMES_AUTHOR_FIELDS.includes(key), `author.${key} is not a field the Hermes reader accepts`);
    assert.equal(typeof value, 'string', `author.${key} must be a string`);
  }
});

// Contract: `keywords` is an array of strings, because the Hermes reader raises "keywords must be an array of strings" otherwise and the package fails to install.
// Breaks when: keywords is written as one comma-separated string, as some manifest formats allow, or a keyword is nested in an object with a weight.
// Not covered by: the implementer's test only checks that `keywords` is among the top-level keys; its type is never asserted.
test('Hermes root manifest: keywords is an array of strings', () => {
  const { keywords } = manifest();
  assert.ok(Array.isArray(keywords), 'keywords must be an array');
  assert.ok(keywords.length > 0, 'keywords must not be empty');
  for (const keyword of keywords) {
    assert.equal(typeof keyword, 'string', `keyword ${JSON.stringify(keyword)} must be a string`);
  }
});

// Contract: description, homepage, repository and license are plain strings, because the Hermes reader raises "<field> must be a string" for any other JSON type.
// Breaks when: `license` becomes the older npm object form `{ "type": "MIT", "url": ... }`, or `repository` becomes `{ "type": "git", "url": ... }`, both of which other manifest readers accept.
// Not covered by: the implementer's test pins the key set and the values of name and the schema URL only; it never types these four fields.
test('Hermes root manifest: description, homepage, repository and license are strings', () => {
  const fields = manifest();
  for (const field of HERMES_STRING_FIELDS) {
    assert.equal(typeof fields[field], 'string', `${field} must be a string for the Hermes reader`);
    assert.ok(fields[field].length > 0, `${field} must not be empty`);
  }
});
