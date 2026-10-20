import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOOP_DIR, SCRIPTS_DIR, hermeticEnv, runScript } from './loop-helpers.mjs';

const read = (name) => readFileSync(join(LOOP_DIR, name), 'utf8');

test('principles.md stays under 150 lines and 3,000 words', () => {
  const text = read('principles.md');
  const lines = text.split('\n').length;
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(lines <= 150, `principles.md has ${lines} lines: apply the admission rule`);
  assert.ok(words <= 3000, `principles.md has ${words} words: apply the admission rule`);
  assert.doesNotMatch(text, /~~/, 'struck-through text: a superseded rule leaves in the same change');
});

test('principles.md states principles 1 to 9 in order, then the admission and pruning rules', () => {
  const text = read('principles.md');
  const numbers = [...text.matchAll(/^(\d+)\. \*\*[^*]+\*\*/gm)].map((match) => Number(match[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].toLowerCase());
  const principles = headings.findIndex((heading) => heading.includes('principles'));
  const admission = headings.findIndex((heading) => heading.includes('admission'));
  const pruning = headings.findIndex((heading) => heading.includes('pruning'));
  assert.ok(principles >= 0, 'no principles heading');
  assert.ok(admission > principles, 'the admission rule follows the principles');
  assert.ok(pruning > principles, 'the pruning rule follows the principles');
});

test('the kit text keeps out the maintainer-only items', () => {
  for (const name of ['principles.md', 'briefings.md', 'README.md']) {
    const text = read(name);
    assert.doesNotMatch(text, /\bvault\b|Obsidian|Telegram|pg-server|\bPedro\b|\bPG\b|mcp__/i, name);
    assert.doesNotMatch(text, /\b(MANDATORY|NEVER|ALWAYS|CRITICAL)\b|⚠️/, `${name}: caps emphasis`);
  }
});

test('every script named in the kit text exists under loop/scripts/', () => {
  for (const name of ['principles.md', 'briefings.md', 'README.md']) {
    const named = [...read(name).matchAll(/(?<![\w.-])([a-z][a-z0-9-]*\.mjs)\b/g)].map((match) => match[1]);
    for (const script of new Set(named)) {
      assert.ok(existsSync(join(SCRIPTS_DIR, script)), `${name} names ${script}, which is not in loop/scripts/`);
    }
  }
  assert.ok(read('README.md').includes('perimeter.mjs'), 'the README names the scripts');
});

// Each template, filled with sample values, passes check-briefing for its own role.
const ROLES = { Executor: 'executor', Fix: 'fix', Auditor: 'auditor', 'Re-auditor': 'reauditor' };

function templates() {
  const found = {};
  let role = null;
  let fence = null;
  for (const line of read('briefings.md').split('\n')) {
    if (fence !== null) {
      if (line.startsWith('```')) {
        found[role] = fence.join('\n');
        fence = null;
        role = null;
      } else {
        fence.push(line);
      }
    } else if (line.startsWith('## ')) {
      role = ROLES[line.slice(3).trim()] ?? null;
    } else if (role && line.startsWith('```')) {
      fence = [];
    }
  }
  return found;
}

const fill = (template) => template.replace(/<[^>\n]+>/g, 'sample').replace(/HH:MM/g, '08:10');

test('briefings.md holds the four templates with the PRD artifact paths', () => {
  const found = templates();
  assert.deepEqual(Object.keys(found).sort(), ['auditor', 'executor', 'fix', 'reauditor']);
  assert.match(found.executor, /^## Done when$/m);
  assert.match(found.executor, /\.vibeflow\/progress\/<feature>-<part>\.md/);
  assert.match(found.fix, /\.vibeflow\/audits\/<feature>-<part>-audit\.md/);
  assert.match(found.auditor, /\.vibeflow\/reviews\/<feature>-<part>-round-<n>\.md/);
  assert.match(found.auditor, /\.vibeflow\/audits\/<feature>-<part>-audit\.md/);
  assert.match(found.reauditor, /\.vibeflow\/audits\/<feature>-<part>-reaudit-<n>\.md/);
  assert.match(read('briefings.md'), /\.vibeflow\/briefings\/<feature>-<part>-<role>\[-<n>\]\.md/);
});

test('each template filled with sample values passes check-briefing for its role', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-briefing-'));
  try {
    for (const [role, template] of Object.entries(templates())) {
      const path = join(dir, `feature-p1-${role}.md`);
      writeFileSync(path, fill(template));
      const result = runScript('check-briefing.mjs', [path, '--role', role], hermeticEnv(dir));
      assert.equal(result.status, 0, `${role}: ${result.out}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the filled auditor template pairs with the filled executor template', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeflow-briefing-'));
  try {
    const found = templates();
    const executor = join(dir, 'feature-p1-executor.md');
    const auditor = join(dir, 'feature-p1-auditor.md');
    writeFileSync(executor, fill(found.executor));
    writeFileSync(auditor, fill(found.auditor));
    const result = runScript('check-briefing.mjs', [auditor, '--pair', executor], hermeticEnv(dir));
    assert.equal(result.status, 0, result.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
