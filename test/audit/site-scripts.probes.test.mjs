// Probes for the site scripts: the selector reader of check-build, its reading of a link to the
// site by host, and the two-phase write of make-assets. Each names the contract it holds, the
// change that breaks it and why the main tests miss that change. No build and no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCss, checkPages } from '../../site/scripts/check-build.mjs';
import { chromeVersion, collectSources, generateAssets } from '../../site/scripts/make-assets.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SITE_DIR = join(ROOT, 'site');

// ---------- the selector reader of check-build ----------

// Contract: a selector is under the motion gate only when one compound requires both html and
// .motion-ok (check-build.mjs, `gated`; spec 1b).
// Breaks when: the gate test looks for html in one compound and .motion-ok in any other, so
// `html .motion-ok .x{opacity:0}`, which hides .x for every reader whose page has a .motion-ok
// element, passes the build.
// Not covered by: the product of test/site-integration.test.mjs writes the gate always on html
// itself and its negation as html:not(.motion-ok); no case splits html and the class.
test('html and .motion-ok in different compounds are not the gate', () => {
  for (const css of ['html .motion-ok .x{opacity:0}', 'html.a .motion-ok .x{opacity:0}', 'html > body.motion-ok .x{visibility:hidden}']) {
    assert.ok(checkCss(css, 'x.css').some((p) => /at rest/.test(p)), css);
  }
  assert.deepEqual(checkCss('html.a.motion-ok .x{opacity:0}', 'x.css'), []);
});

// Contract: a pseudo-element draws text when any rule for it, written with ancestors or not, gives
// it content; then an opacity 0 at rest fails even with a hover rule (check-build.mjs,
// `mayDrawText`, which reads the last compound of each selector).
// Breaks when: the pseudo-element is looked for in another compound than the last, so the text
// given by `.card .tip::after` no longer counts and `.tip::after{opacity:0}` passes as a decoration
// shown on hover.
// Not covered by: the text rules of test/site-integration.test.mjs are one compound each
// (`.x::after`), so reading the first compound instead of the last survives them.
test('text given to a pseudo-element by a selector with ancestors counts as text', () => {
  const css = '.card .tip::after{content:"help"}.tip::after{opacity:0}.tip:hover::after{opacity:1}';
  assert.ok(checkCss(css, 'x.css').some((p) => /\.tip::after sets opacity 0 at rest/.test(p)), checkCss(css, 'x.css').join('\n'));
});

// Contract: an escaped comma is part of a name, not a cut in the selector list (selectors.mjs,
// `scan`, "is not escaped").
// Breaks when: the reader stops skipping escapes, so `.a\,.b` splits into `.a\` and `.b`, and a
// rule wholly under the gate fails the build for a selector that does not exist.
// Not covered by: the escaped comma of test/site-integration.test.mjs sits inside brackets
// (`[data-label=a\,b]`), where the bracket alone already protects it.
test('an escaped comma does not split a selector under the gate', () => {
  assert.deepEqual(checkCss('html.motion-ok .a\\,.b{opacity:0}', 'x.css'), []);
  assert.ok(checkCss('.a\\,.b{opacity:0}', 'x.css').length > 0);
});

// Contract: the declarations of a rule count whatever rules it nests (check-build.mjs reads the
// CSS rule by rule; spec 1b, the alarm).
// Breaks when: the rule walker takes the text from the last `;` or `}` to a `{` as the selector, as
// it does now, so `.x{opacity:0;html.motion-ok &{opacity:1}}` hands `opacity:0` to the nested
// selector and the hiding rule passes. The site does not nest CSS, and check-build.mjs states this
// limit in its header; the case is marked todo until the walker reads nesting.
// Not covered by: no test of check-build writes nested CSS.
test('a hiding declaration before a nested rule still fails', { todo: 'open gap: walkCss loses the declarations written before a nested rule' }, () => {
  assert.ok(checkCss('.x{opacity:0;html.motion-ok &{opacity:1}}', 'x.css').length > 0);
});

// ---------- the site link by host ----------

const SITE = 'https://www.vibeflow.run';
const head = (page) => {
  if (!page) return `<head><link rel="canonical" href="${SITE}/en/"></head>`;
  const rest = page.replace(/^(en|pt-br)\//, '');
  return `<head><link rel="canonical" href="${SITE}/${page}"><link rel="alternate" hreflang="en" href="${SITE}/en/${rest}">` +
    `<link rel="alternate" hreflang="pt-BR" href="${SITE}/pt-br/${rest}"><link rel="alternate" hreflang="x-default" href="${SITE}/en/${rest}"></head>`;
};
function smallSite(link) {
  const pages = { '': `<html>${head('')}<body><main><h1>Vibeflow</h1><a href="/en/">Go</a></main></body></html>` };
  for (const l of ['en', 'pt-br']) {
    pages[`${l}/`] = `<html>${head(`${l}/`)}<body><h1>Home</h1><section id="how"><p>Text</p></section></body></html>`;
    pages[`${l}/commands/`] = `<html>${head(`${l}/commands/`)}<body><h1>Commands</h1><p>A</p>${link ? `<a href="${link(l)}">L</a>` : ''}</body></html>`;
    pages[`${l}/anatomy/`] = `<html>${head(`${l}/anatomy/`)}<body><h1>Anatomy</h1><p>Text</p></body></html>`;
  }
  return pages;
}

// Contract: a link is a link to a page of the site when its host is the site's on the default port
// of http or https; another port or another scheme is another origin and is not checked
// (check-build.mjs, `resolve`: "a link to another host or scheme leaves before anything is
// decoded").
// Breaks when: the port or the scheme test is dropped, so `https://www.vibeflow.run:8443/...` or
// `ftp://www.vibeflow.run/...` is read as a page of this site and fails the build for an id it
// was never meant to have.
// Not covered by: the host forms of test/site-integration.test.mjs keep the port at 443 or none and
// the scheme at https.
test('a link to the site host on another port or scheme is another origin', () => {
  assert.deepEqual(checkPages(smallSite()), []);
  for (const href of [(l) => `https://www.vibeflow.run:8443/${l}/#nowhere`, (l) => `ftp://www.vibeflow.run/${l}/#nowhere`]) {
    assert.deepEqual(checkPages(smallSite(href)), [], href('en'));
  }
  assert.ok(checkPages(smallSite((l) => `http://www.vibeflow.run:80/${l}/#nowhere`)).some((p) => /no target/.test(p)), 'http on :80 is the site');
});

// ---------- the asset generator's two-phase write ----------

// Contract: a failure on the way leaves site/public/ and the manifest as they were, so no new image
// sits beside an old manifest (spec 1c; make-assets.mjs header).
// Breaks when: the five files are copied one by one and the manifest last with nothing put back, so
// a copy that fails part way (a destination file that cannot be written) leaves four new PNGs with
// the old favicon.ico and the old manifest.
// Not covered by: the staging test of test/site-assets.test.mjs injects the failure only while the
// files are made in the stage folder, before any copy starts; this one fails a real copy, by a
// read-only destination.
test('a copy that fails part way leaves the destination as it was', () => {
  const root = mkdtempSync(join(tmpdir(), 'site-assets-probe-'));
  const files = ['og-image.png', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'favicon.ico'];
  try {
    const publicDir = join(root, 'public');
    const manifestPath = join(root, 'scripts', 'assets', 'manifest.json');
    const tmp = join(root, 'tmp');
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(dirname(manifestPath), { recursive: true });
    mkdirSync(tmp);
    for (const f of files) writeFileSync(join(publicDir, f), `old ${f}`);
    writeFileSync(manifestPath, '{"old":true}\n');
    const age = (path) => (readFileSync(path, 'utf8').startsWith('old ') || readFileSync(path, 'utf8').includes('"old"') ? 'old' : 'new');
    const snapshot = () => Object.fromEntries([...files.map((f) => [f, age(join(publicDir, f))]), ['manifest.json', age(manifestPath)]]);
    const before = snapshot();
    chmodSync(join(publicDir, 'favicon.ico'), 0o444);
    try {
      generateAssets({
        sources: collectSources(SITE_DIR),
        shoot: () => readFileSync(join(SITE_DIR, 'public', 'favicon-32.png')),
        chromeVersion: 'Probe Chrome 1.0', publicDir, manifestPath, tmp,
      });
    } catch {
      // the failure is expected; what matters is the destination
    } finally {
      chmodSync(join(publicDir, 'favicon.ico'), 0o644);
    }
    assert.deepEqual(snapshot(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The all-or-nothing copy: what a failed copy may touch, and what its error says.

const ASSET_FILES = ['og-image.png', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'favicon.ico'];
// A folder for one run of the generator: public/ with the five old files and a file of someone
// else, the manifest folder with a file of someone else and no manifest yet, an empty tmp/, and a
// file beside them all.
function assetYard() {
  const root = mkdtempSync(join(tmpdir(), 'site-assets-yard-'));
  const publicDir = join(root, 'public');
  const manifestPath = join(root, 'scripts', 'assets', 'manifest.json');
  const tmp = join(root, 'tmp');
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(dirname(manifestPath), { recursive: true });
  mkdirSync(tmp);
  for (const f of ASSET_FILES) writeFileSync(join(publicDir, f), `old ${f}`);
  writeFileSync(join(publicDir, 'robots.txt'), 'not the generator\'s');
  writeFileSync(join(dirname(manifestPath), 'notes.json'), '{"not":"the generator\'s"}\n');
  writeFileSync(join(root, 'beside.txt'), 'not the generator\'s');
  return { root, publicDir, manifestPath, tmp };
}
// Every file and folder under a root, with the sha256 of each file.
function tree(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const rel = path.slice(root.length + 1);
      if (statSync(path).isDirectory()) { out[`${rel}/`] = 'dir'; walk(path); } else out[rel] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  walk(root);
  return out;
}
const generate = (yard, copy) => generateAssets({
  sources: collectSources(SITE_DIR),
  shoot: () => readFileSync(join(SITE_DIR, 'public', 'favicon-32.png')),
  chromeVersion: 'Probe Chrome 1.0', publicDir: yard.publicDir, manifestPath: yard.manifestPath, tmp: yard.tmp, copy,
});

// Contract: a copy that fails on any of the six destinations writes and removes nothing but those
// destinations and the generator's own folder under tmp: every other file and folder, beside the
// destinations or not, is as it was, and a destination that did not exist is gone again
// (make-assets.mjs, copyAll, "gets back the bytes it had (or is removed when it did not exist)";
// spec 1c, a failure leaves site/public/ and the manifest as they were).
// Breaks when: the put-back of a destination that did not exist removes more than that file, as
// `rmSync(dirname(to), { recursive: true })` does to the whole manifest folder; or any write of
// the put-back lands beside the destination.
// Not covered by: the "did not exist" case of test/site-assets.test.mjs checks only that the
// manifest is gone and that favicon.ico is old; its six-destination case lists the folders but
// always has a manifest.
test('a failed copy touches nothing but the six destinations and its own temp folder', () => {
  const failures = [];
  for (const failOn of [...ASSET_FILES, 'manifest.json']) {
    const yard = assetYard();
    try {
      const before = tree(yard.root);
      let message = '';
      try {
        generate(yard, (from, to) => {
          if (to.endsWith(`/${failOn}`)) {
            writeFileSync(to, readFileSync(from).subarray(0, 10));
            throw new Error(`probe failure on ${failOn}`);
          }
          copyFileSync(from, to);
        });
      } catch (e) {
        message = e.message;
      }
      if (!message.includes(`probe failure on ${failOn}`)) failures.push(`${failOn}: the failure did not surface (${message})`);
      const after = tree(yard.root);
      if (JSON.stringify(after) !== JSON.stringify(before)) failures.push(`${failOn}: ${JSON.stringify({ before, after })}`);
    } finally {
      rmSync(yard.root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(failures, []);
});

// Contract: when putting a destination back fails too, the error says so and names the file, on
// the same line as the copy failure (make-assets.mjs, copyAll, "could not put back"; the
// generator's header, every failure is one line).
// Breaks when: a failed put-back is swallowed by its own catch, or the message drops the list or
// the names, so a half-replaced public/ looks like a clean failure that left everything as it was.
// Not covered by: no test in test/site-assets.test.mjs makes the put-back itself fail.
test('a put-back that fails too is said in the one line of the error, with the file', () => {
  const yard = assetYard();
  try {
    const og = join(yard.publicDir, 'og-image.png');
    let message = null;
    try {
      generate(yard, (from, to) => {
        if (to.endsWith('/favicon-32.png')) {
          // og-image.png was already replaced; turn it into a folder so its old bytes cannot go back
          rmSync(og);
          mkdirSync(og);
          throw new Error('probe failure on favicon-32.png');
        }
        copyFileSync(from, to);
      });
    } catch (e) {
      message = e.message;
    }
    assert.ok(message, 'the failure surfaced');
    assert.doesNotMatch(message, /\n/);
    assert.match(message, /probe failure on favicon-32\.png/);
    assert.match(message, /could not put back/);
    assert.ok(message.includes(og), `names the file that stayed: ${message}`);
    assert.equal(readFileSync(join(yard.publicDir, 'favicon-64.png'), 'utf8'), 'old favicon-64.png', 'a file never reached is untouched');
  } finally {
    rmSync(yard.root, { recursive: true, force: true });
  }
});

// Contract: the guard against symbolic links looks at the six destinations only: a link beside
// them, in public/ or in the manifest folder, pointing somewhere or nowhere, neither stops the
// generator nor is touched by it, and the six destinations are written (make-assets.mjs,
// refuseLinks, "A destination that is a symbolic link").
// Breaks when: the guard refuses any link it finds in public/ or the manifest folder, so a
// repository that keeps an unrelated link there can no longer make its assets; or the copy follows
// or replaces a link that is not one of its destinations.
// Not covered by: the link cases of test/site-assets.test.mjs put the link on a destination every
// time, and no case keeps a link beside them.
test('a symbolic link beside the six destinations does not stop the generator and is left as it is', () => {
  const yard = assetYard();
  try {
    const target = join(yard.root, 'elsewhere.txt');
    writeFileSync(target, 'not the generator\'s');
    const beside = join(yard.publicDir, 'robots-link.txt');
    symlinkSync(target, beside);
    const dangling = join(dirname(yard.manifestPath), 'old.json');
    symlinkSync(join(yard.root, 'nowhere.json'), dangling);
    const manifest = generate(yard, copyFileSync);
    assert.ok(manifest && manifest.outputs['favicon.ico'], 'the generator made its outputs');
    for (const f of ASSET_FILES) {
      assert.ok(!lstatSync(join(yard.publicDir, f)).isSymbolicLink(), `${f} is a plain file`);
      assert.notEqual(readFileSync(join(yard.publicDir, f), 'utf8'), `old ${f}`, `${f} was written`);
    }
    assert.ok(existsSync(yard.manifestPath), 'the manifest was written');
    assert.ok(lstatSync(beside).isSymbolicLink() && readlinkSync(beside) === target, 'the link in public/ is as it was');
    assert.ok(lstatSync(dangling).isSymbolicLink() && readlinkSync(dangling) === join(yard.root, 'nowhere.json'), 'the dangling link is as it was');
    assert.equal(readFileSync(target, 'utf8'), 'not the generator\'s', 'the target of the link is as it was');
    assert.ok(!existsSync(join(yard.root, 'nowhere.json')), 'nothing was written through the dangling link');
  } finally {
    rmSync(yard.root, { recursive: true, force: true });
  }
});

// Contract: a Chrome that does not answer --version in time is killed outright, as the screenshot
// is, and is an error of one line (make-assets.mjs, header, "it is then killed, in the screenshots
// and in the version query alike").
// Breaks when: the version query falls back to the default signal to terminate, so a Chrome that
// ignores it holds the generator for as long as it likes; a stand-in that leaves a mark when asked
// to terminate shows the difference without timing anything.
// Not covered by: the stand-in of test/site-assets.test.mjs ignores the signal and then ends on its
// own, so with the default signal the query still returns, only later, with the same message.
test('a version query that does not answer is killed, never asked to terminate', () => {
  const work = mkdtempSync(join(tmpdir(), 'site-assets-version-probe-'));
  try {
    const mark = join(work, 'asked-to-terminate');
    const stub = join(work, 'chrome.sh');
    writeFileSync(stub, `#!/bin/sh\ntrap 'echo asked > "${mark}"; exit 0' TERM\nwhile :; do sleep 1; done\n`);
    chmodSync(stub, 0o755);
    let message = null;
    try {
      chromeVersion(stub, { timeout: 2000 });
    } catch (e) {
      message = e.message;
    }
    assert.ok(message, 'the query failed');
    assert.doesNotMatch(message, /\n/);
    assert.match(message, /--version/);
    assert.ok(!existsSync(mark), 'the stand-in was asked to terminate instead of being killed');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
