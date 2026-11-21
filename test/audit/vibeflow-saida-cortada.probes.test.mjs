// vibeflow-probe: vibeflow-saida-cortada
// Behavior probe from the audit of part 1 of vibeflow-saida-cortada: a loop script hands its whole
// stdout to a reader that is slower than the script, on the path that prints the findings, not
// only on --help.
//
// How it stays off the clock: a preload module (a data: URL, so the probe is one file) makes the
// first console.log also write about 1.3 MB of filler in the same write call. Node hands the pipe
// what fits and queues the rest; while main runs synchronously nothing in that queue moves, so
// every later line queues behind it. A script that waits for its output hands over all of it; one
// that calls process.exit() before main's caller lets the event loop run drops the queue, every
// finding line included. The reader starts after the first write returns, and the 60-second guard
// only stops a hang, it never decides the outcome.
// Every suspect line written to the corpus is assembled from pieces, so check-probes run on this
// repository finds no suspect line in this file.
// Run with: node --test test/*.test.mjs test/audit/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { SCRIPTS_DIR, makeSandbox } from '../loop-helpers.mjs';

const G = ['g', 'it'].join('');
const SUSPECTS = 400;
const FILLER = 60_000;

const PRELOAD = `data:text/javascript,${encodeURIComponent(`
import { format } from 'node:util';
let first = true;
console.log = (...args) => {
  let text = format(...args) + '\\n';
  if (first) text += Array.from({ length: ${FILLER} }, (_, i) => 'filler ' + i).join('\\n') + '\\n';
  process.stdout.write(text);
  if (first) process.stderr.write('first write returned\\n');
  first = false;
};
`)}`;

function runWithLateReader(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', PRELOAD, join(SCRIPTS_DIR, script), ...args], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let reading = false;
    let closed = false;
    let status;
    const guard = setTimeout(() => child.kill('SIGKILL'), 60_000);
    const finish = () => {
      if (closed && status !== undefined) {
        clearTimeout(guard);
        resolve({ status, stdout, stderr });
      }
    };
    const startReading = () => {
      if (reading) return;
      reading = true;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stdout.on('end', () => { closed = true; finish(); });
    };
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.includes('first write returned\n')) startReading();
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      status = code ?? signal;
      startReading();
      finish();
    });
  });
}

// Contract: check-probes prints one line per suspect line and a summary, and every one of them
// reaches the program that reads it, however slow that reader is. This is the path that lost 231
// of 411 lines on main in run 44837973801.
// Breaks when: a process.exit() inside main after the findings are printed (for example
// `process.exit(suspects ? 1 : 0)` in place of the return), or the old ending
// `process.exit(main(...))` coming back.
// Not covered by: test/loop-scripts-full-output.test.mjs, for the first form. It runs each script
// with --help, and --help returns from main before the findings path; an exit placed on that path
// leaves --help untouched.
test('check-probes hands every finding line and its summary to a reader that starts late, on the findings path', async () => {
  const box = makeSandbox();
  try {
    const call = `const out = execSync('${G} diff --stat');`;
    const path = 'test/audit/many.probes.test.mjs';
    box.write(path, `${Array.from({ length: SUSPECTS }, () => call).join('\n')}\n`);
    const { status, stdout, stderr } = await runWithLateReader('check-probes.mjs', [box.repo], box.env());
    const filler = (stdout.match(/^filler \d+$/gm) ?? []).length;
    assert.equal(filler, FILLER, `the filler did not arrive whole (${filler} of ${FILLER}); stderr: ${stderr.slice(0, 300)}`);
    const found = new Set([...stdout.matchAll(/^test\/audit\/many\.probes\.test\.mjs:(\d+) \[/gm)].map((match) => Number(match[1])));
    const missing = Array.from({ length: SUSPECTS }, (_, index) => index + 1).filter((line) => !found.has(line));
    assert.deepEqual(missing, [], `${missing.length} of ${SUSPECTS} finding lines did not reach the reader`);
    assert.match(stdout, new RegExp(`^1 probe file\\(s\\) read; ${SUSPECTS} suspect line\\(s\\)$`, 'm'), 'the summary line is missing');
    assert.equal(status, 1, `exit ${status}; stderr: ${stderr.slice(0, 300)}`);
  } finally {
    box.cleanup();
  }
});
