// Behavior probes from the independent audit of vibeflow-residuos, part 1; one case remains: the
// shared reader of the hosts that never substitute `${CLAUDE_SKILL_DIR}` (B7). It states, as comments, the
// contract it protects, the plausible regression that breaks it and why the implementer's tests
// did not catch it.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neverSubstitutedHosts } from '../kit-path-hosts.mjs';

// Contract: the shared reader enforces the floor each caller passes, every host of it and not only the first, and returns the rule's own host list when the floor is satisfied.
// Breaks when: a refactor of `test/kit-path-hosts.mjs` drops or shortcuts the floor loop (a default `floor = []`, a loop over a constant, a check of `floor[0]` only); both kit-path probes stay green, because today's rule names every host of both floors, and stop guarding the floor.
// Not covered by: the Hermes and OpenCode kit-path probes call the reader with floors the current rule satisfies, so they never reach its rejection; the implementer proved the rejection by mutating the `audit` skill by hand, which is not in the suite.
test('kit-path hosts: the shared reader refuses a floor host that the never-substituted rule does not name', () => {
  const hosts = neverSubstitutedHosts([]);
  assert.ok(hosts.length > 0, 'the rule names at least one host');
  assert.deepEqual(neverSubstitutedHosts(hosts), hosts, 'a floor the rule satisfies returns the rule hosts');
  const absent = 'Nohostnamed';
  assert.ok(!hosts.includes(absent));
  const refusal = { name: 'AssertionError', message: new RegExp(`^audit: the never-substituted rule names ${absent}: `) };
  assert.throws(() => neverSubstitutedHosts([absent]), refusal, 'a floor of one absent host is refused');
  assert.throws(() => neverSubstitutedHosts([...hosts, absent]), refusal, 'an absent host after the named ones is refused');
});
