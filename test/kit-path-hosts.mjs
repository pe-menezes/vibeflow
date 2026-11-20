// The hosts that never substitute `${CLAUDE_SKILL_DIR}`, read from the `audit` rule
// "In … the variable is never substituted". The kit-path probes of the Hermes and OpenCode
// editions import it, each with its own floor of hosts the rule has to name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AUDIT = 'plugins/vibeflow/skills/audit/SKILL.md';

export const neverSubstitutedHosts = (floor) => {
  const audit = readFileSync(join(ROOT, AUDIT), 'utf8').replace(/\s+/g, ' ');
  const ruleHosts = /\bIn ((?:[A-Z]\w*(?:, | and ))*[A-Z]\w*) the variable is never substituted/.exec(audit)?.[1];
  assert.ok(ruleHosts, 'audit: one sentence lists the hosts where "the variable is never substituted"');
  const hosts = ruleHosts.split(/, | and /);
  for (const host of floor) assert.ok(hosts.includes(host), `audit: the never-substituted rule names ${host}: ${ruleHosts}`);
  return hosts;
};
