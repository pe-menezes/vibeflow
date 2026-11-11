// Audit probes for the 1.19.0 release (vibeflow-leitura, part 4): the
// documentation and the version. test/distributions.test.mjs holds the
// manifests and the Claude catalog to one another; nothing holds the newest
// CHANGELOG entry to them, though AGENTS.md (Versioning) lists the CHANGELOG
// first among the values that move together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const json = (path) => JSON.parse(read(path));

// Contract: AGENTS.md "Versioning": a shared plugin release keeps the newest CHANGELOG entry, the three plugin manifests and the three versions of the Claude marketplace catalog aligned.
// Breaks when: a release bumps the manifests without a CHANGELOG entry of the same version, or the CHANGELOG gains an entry (or a typo in its heading) that the manifests do not carry.
// Not covered by: test/distributions.test.mjs compares the manifests and the catalog with one another and never reads CHANGELOG.md; with the newest heading changed to v1.19.1 and every manifest at 1.19.0, it stays green (sabotage S3 of the part 4 audit).
test('the newest CHANGELOG entry carries the version every manifest and the Claude catalog name', () => {
  const heading = read('CHANGELOG.md').match(/^### v(\d+\.\d+\.\d+)\b/m);
  assert.ok(heading, 'CHANGELOG.md has no "### vX.Y.Z" entry');
  const newest = heading[1];

  const catalog = json('.claude-plugin/marketplace.json');
  const values = {
    'plugins/vibeflow/.claude-plugin/plugin.json': json('plugins/vibeflow/.claude-plugin/plugin.json').version,
    'plugins/vibeflow/.codex-plugin/plugin.json': json('plugins/vibeflow/.codex-plugin/plugin.json').version,
    'plugins/vibeflow/plugin.json': json('plugins/vibeflow/plugin.json').version,
    '.claude-plugin/marketplace.json version': catalog.version,
    '.claude-plugin/marketplace.json metadata.version': catalog.metadata.version,
    '.claude-plugin/marketplace.json plugins[0].version': catalog.plugins[0].version,
  };
  for (const [where, version] of Object.entries(values)) {
    assert.equal(version, newest, `${where} is ${version}; the newest CHANGELOG entry is v${newest}`);
  }
});
