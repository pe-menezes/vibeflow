// Audit probes for the 1.20.1 release (vibeflow-release-1201, part 1): the
// version numbers and the changelog entry. The plugin side is already held by
// test/audit/vibeflow-leitura-4.probes.test.mjs (newest CHANGELOG entry ==
// every manifest); nothing holds the CLI version the newest entry names to the
// CLI this tree would publish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

function newestEntry(changelog) {
  const lines = changelog.split('\n');
  const heads = [];
  lines.forEach((line, i) => {
    if (/^### v\d+\.\d+\.\d+\b/.test(line)) heads.push(i);
  });
  assert.ok(heads.length > 0, 'CHANGELOG.md has no "### vX.Y.Z" entry');
  return lines.slice(heads[0], heads[1] ?? lines.length).join('\n');
}

function compare(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Contract: AGENTS.md "Versioning": when a release changes the CLI, the CLI is published from this tree when the release reaches main, so a CLI version the newest CHANGELOG entry names ("CLI x.y.z", "setup-vibeflow x.y.z") is one cli/package.json already carries, never a later one.
// Breaks when: a cut writes "(CLI 0.18.2)" in the new entry and leaves cli/package.json (or runs `npm version` outside cli/) at 0.18.1, so `npm publish` would ship a CLI the notes do not describe.
// Not covered by: test/cli-kit.test.mjs pins cli/package.json to a literal and never reads CHANGELOG.md, so it stays green with the entry naming a later CLI; the vibeflow-leitura-4 probe reads only the plugin manifests.
test('the newest CHANGELOG entry names no CLI version later than cli/package.json', () => {
  const entry = newestEntry(read('CHANGELOG.md'));
  const cli = JSON.parse(read('cli/package.json')).version;
  const named = [...entry.matchAll(/\b(?:CLI|setup-vibeflow)[ @](\d+\.\d+\.\d+)\b/g)].map((m) => m[1]);
  for (const version of named) {
    assert.ok(compare(version, cli) <= 0, `the newest CHANGELOG entry names CLI ${version}; cli/package.json is ${cli}`);
  }
});
