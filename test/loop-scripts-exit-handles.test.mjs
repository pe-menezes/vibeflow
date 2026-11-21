// A loop script exits once its output is handed over, even when a handle is still open.
//
// preflight.mjs probes each --probe-url with a fetch that gives up after six seconds. When the
// TLS handshake stalls, the fetch rejects and the verdict is printed, but the connection under it
// can stay open for longer. A script that waits for the event loop to empty before exiting stays
// alive with it; one that exits once stdout and stderr have handed over what is queued does not.
//
// How it stays offline: a preload module (a data: URL, so the test is one file) replaces
// tls.connect with a peer that reads the ClientHello and never answers. Behind the peer a child
// node process reads it, and that child's pipe stays open until the script itself ends, standing
// in for a stalled TLS socket that outlives the fetch. No host name is resolved and no socket
// leaves the machine.
//
// What is timed: only the time from the verdict to the exit, against VERDICT_TO_EXIT_MS, far above
// the instant a script that exits on time takes and reached only by one held open by the
// connection, which this preload holds for as long as the script lives. START_GUARD_MS only stops
// a run whose verdict never comes; the verdict comes at about six seconds, when the fetch gives up.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SCRIPTS_DIR } from './loop-helpers.mjs';

const VERDICT_TO_EXIT_MS = 20_000;
const START_GUARD_MS = 60_000;

const PRELOAD = `data:text/javascript,${encodeURIComponent(`
import tls from 'node:tls';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
const connect = tls.connect;
tls.connect = (options, ...rest) => {
  const reader = spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: ['pipe', 'ignore', 'ignore'] });
  const peer = new Duplex({
    read() {},
    write(chunk, encoding, callback) { reader.stdin.write(chunk, encoding, callback); },
  });
  return connect({ ...options, socket: peer }, ...rest);
};
`)}`;

function runUntilExit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', PRELOAD, join(SCRIPTS_DIR, 'preflight.mjs'), ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let killedBy = null;
    let afterVerdict = null;
    const kill = (why) => {
      killedBy = why;
      child.kill('SIGKILL');
    };
    const startGuard = setTimeout(() => kill('no verdict'), START_GUARD_MS);
    const stop = () => {
      clearTimeout(startGuard);
      clearTimeout(afterVerdict);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (afterVerdict === null && /^verdict: /m.test(stdout)) {
        clearTimeout(startGuard);
        afterVerdict = setTimeout(() => kill('alive after the verdict'), VERDICT_TO_EXIT_MS);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      stop();
      reject(error);
    });
    child.on('close', (code, signal) => {
      stop();
      resolve({ status: code ?? signal, stdout, stderr, killedBy });
    });
  });
}

test('preflight.mjs exits once its verdict is handed over, while a stalled TLS connection is still open', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'vibeflow-exit-handles-'));
  try {
    const { status, stdout, stderr, killedBy } = await runUntilExit([
      '--repo', join(scratch, 'missing'),
      '--probe-url', 'https://stalled.invalid',
    ]);
    assert.equal(
      killedBy,
      null,
      `preflight.mjs was killed with SIGKILL (${killedBy}): ${killedBy === 'no verdict' ? `no verdict within ${START_GUARD_MS / 1000} s` : `still running ${VERDICT_TO_EXIT_MS / 1000} s after its verdict was printed, held by the open connection`}. stdout: ${stdout.slice(-500)} stderr: ${stderr.slice(0, 500)}`,
    );
    assert.match(stdout, /^\[stop\] network: no answer from https:\/\/stalled\.invalid /m, `the stalled probe is not reported; stdout: ${stdout.slice(-500)}`);
    assert.match(stdout, /^verdict: stop: do not dispatch long work\n$/m, `the verdict line is missing; stdout: ${stdout.slice(-500)}`);
    assert.equal(status, 2, `exit ${status}; stderr: ${stderr.slice(0, 500)}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
