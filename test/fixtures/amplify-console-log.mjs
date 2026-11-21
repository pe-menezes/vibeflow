// Preload module for test/loop-scripts-full-output.test.mjs, loaded with `node --import`.
// It makes every console.log call write its text followed by AMPLIFY_LINES numbered lines and an
// end line, all in one stdout write, so a script's ordinary output becomes large enough to outrun
// a pipe that nobody reads yet. Once the write call returns, it tells stderr, so the test knows the
// script has handed its whole output to Node and is about to return from main.

import { format } from 'node:util';

const lines = Number(process.env.AMPLIFY_LINES);
if (!Number.isInteger(lines) || lines < 1) throw new Error('AMPLIFY_LINES must be a positive integer');

console.log = (...args) => {
  const numbered = Array.from({ length: lines }, (_, index) => `amplified line ${index + 1} of ${lines}`);
  process.stdout.write(`${format(...args)}\n${numbered.join('\n')}\namplified end\n`);
  process.stderr.write('amplified write returned\n');
};
