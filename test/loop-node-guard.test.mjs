// The kit's Node version guard: every script
// checks `process.versions.node` before anything else and, below 18, says on stderr that it
// needs Node.js 18 or later, with the version it found, and exits 64 ("cannot run"). An older
// Node is simulated with a preload that rewrites `process.versions.node` and, like Node 16,
// has no global `fetch`; on Node 16 the preflight read the missing `fetch` as no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOOP_DIR, SCRIPTS_DIR, hermeticEnv, withSandbox } from './loop-helpers.mjs';

const SCRIPTS = [
  'preflight.mjs',
  'who-reads.mjs',
  'check-briefing.mjs',
  'perimeter.mjs',
  'review-package.mjs',
  'check-probes.mjs',
  'watch-pr.mjs',
  'watch-round.mjs',
  'loop-stats.mjs',
];

function asNode(version) {
  const preload = [
    `Object.defineProperty(process, 'versions', { value: { ...process.versions, node: '${version}' } });`,
    "delete globalThis.fetch;",
  ].join(' ');
  return `data:text/javascript,${encodeURIComponent(preload)}`;
}

function runAs(version, script, args, env = hermeticEnv(tmpdir())) {
  const result = spawnSync(process.execPath, ['--import', asNode(version), join(SCRIPTS_DIR, script), ...args], {
    env,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('the simulated old Node reports the version it is given and has no global fetch', () => {
  const result = spawnSync(process.execPath, ['--import', asNode('16.20.2'), '-e', 'console.log(process.versions.node, typeof fetch)'], { encoding: 'utf8' });
  assert.equal(result.stdout.trim(), '16.20.2 undefined');
});

for (const version of ['16.20.2', '17.9.1']) {
  test(`below Node 18 (${version}) every kit script says it needs Node.js 18 or later and exits 64 before doing anything`, () => {
    for (const script of SCRIPTS) {
      const result = runAs(version, script, ['--help']);
      assert.equal(result.status, 64, `${script}: ${result.stdout}${result.stderr}`);
      assert.equal(result.stdout, '', `${script}: nothing else ran (no usage on stdout)`);
      assert.match(result.stderr, /Node\.js 18 or later/, `${script}: names what it needs`);
      assert.ok(result.stderr.includes(version), `${script}: names the version it found`);
    }
  });
}

test('on an old Node the preflight stops at the version, never reporting the network as down', () => {
  withSandbox((box) => {
    box.git('checkout', '-q', '-b', 'feat');
    const result = runAs('16.20.2', 'preflight.mjs', ['--repo', box.repo, '--probe-url', 'http://127.0.0.1:9'], box.env());
    assert.equal(result.status, 64, `${result.stdout}${result.stderr}`);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /network/i, 'no network line');
    assert.match(result.stderr, /Node\.js 18 or later/);
  });
});

test('Node 18.0.0 passes the guard', () => {
  for (const script of SCRIPTS) {
    const result = runAs('18.0.0', script, ['--help']);
    assert.equal(result.status, 0, `${script}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /usage/i, script);
  }
});

test('the README\'s exit-code line says a Node older than 18 exits 64', () => {
  const readme = readFileSync(join(LOOP_DIR, 'README.md'), 'utf8');
  const paragraph = readme.split(/\n\s*\n/).find((block) => block.startsWith('Every script also exits 64'));
  assert.ok(paragraph, 'the exit-code paragraph');
  assert.match(paragraph.replace(/\s+/g, ' '), /Node\.js older than 18[^.]*exits? 64/, 'it names the Node guard and its exit');
});
