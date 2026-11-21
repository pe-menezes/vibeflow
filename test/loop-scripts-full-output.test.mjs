// Every loop script hands its whole stdout to a reader that is slower than the script.
//
// A script that ends with process.exit() right after a large console.log loses whatever Node had
// not yet passed to the pipe when the reader is slow: process.exit() does not wait for pending
// asynchronous writes. The kit's scripts are read by other programs (an agent, a test), so the end
// of a long output could vanish without a word. Here the reader starts reading only after the
// script reports that its write call returned (or after it exits), and then reads to the end.
// A script that waits for its output before exiting hands over every line; one that exits at once
// has already dropped the rest. No clock decides the outcome.
//
// Each script prints its usage on --help and returns 0 from main. The preload module
// test/fixtures/amplify-console-log.mjs turns that one console.log into AMPLIFY_LINES numbered
// lines, so the same path covers all nine scripts.
//
// A script that never exits (a handle left alive after main) is killed after EXIT_GUARD_MS and its
// case fails saying so. That guard only stops a hang: a script that exits is never timed.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCRIPTS_DIR } from './loop-helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const AMPLIFIER = pathToFileURL(join(HERE, 'fixtures', 'amplify-console-log.mjs')).href;
// About 1.6 MB of output: far above what a pipe and the reader's buffer hold before anyone reads.
const LINES = 50_000;
// Far above the under-one-second run of a script that exits; reached only by one that never does.
const EXIT_GUARD_MS = 60_000;
const SCRIPTS = readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.mjs')).sort();

function runWithLateReader(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', AMPLIFIER, join(SCRIPTS_DIR, script), '--help'], {
      env: { ...process.env, AMPLIFY_LINES: String(LINES) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    let reading = false;
    let status;
    let stdoutClosed = false;
    let killedByGuard = false;
    const guard = setTimeout(() => {
      killedByGuard = true;
      child.kill('SIGKILL');
    }, EXIT_GUARD_MS);
    const finish = () => {
      if (stdoutClosed && status !== undefined) {
        clearTimeout(guard);
        resolve({ status, stdout, stderr, killedByGuard });
      }
    };
    const startReading = () => {
      if (reading) return;
      reading = true;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stdout.on('end', () => {
        stdoutClosed = true;
        finish();
      });
    };
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.includes('amplified write returned\n')) startReading();
    });
    child.on('error', (error) => {
      clearTimeout(guard);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      status = code ?? signal;
      startReading();
      finish();
    });
  });
}

// Every script of the folder runs below; an empty list would make this file pass without running one.
test('the loop scripts folder has scripts to run', () => {
  assert.ok(SCRIPTS.length > 0, SCRIPTS_DIR);
});

for (const script of SCRIPTS) {
  test(`${script} --help hands every line of a large output to a reader that starts late`, async () => {
    const { status, stdout, stderr, killedByGuard } = await runWithLateReader(script);
    assert.equal(
      killedByGuard,
      false,
      `${script}: still running ${EXIT_GUARD_MS / 1000} s after it started, so it was killed with SIGKILL; something keeps the process alive after main returns (an open handle such as a timer or a socket). stderr: ${stderr.slice(0, 500)}`,
    );
    const received = (stdout.match(/^amplified line \d+ of \d+$/gm) ?? []).length;
    assert.equal(received, LINES, `${script}: received ${received} of ${LINES} lines (${stdout.length} characters); stderr: ${stderr.slice(0, 500)}`);
    assert.match(stdout, new RegExp(`^amplified line ${LINES} of ${LINES}\\namplified end\\n$`, 'm'), `${script}: the end line is missing`);
    assert.equal(status, 0, `${script}: exit ${status}; stderr: ${stderr.slice(0, 500)}`);
  });
}
