// Audit probes for the integration of the new site (part 6): the build checks fail closed, every
// checker in site/scripts runs in the build, links to a page that does not exist fail, and the CSS
// the site's own sources write passes the same hidden-at-rest check the build applies.
// No build and no browser: what needs the generated site stays in the audit report.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCss, checkPages } from '../../site/scripts/check-build.mjs';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SITE_DIR = join(ROOT, 'site');
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const CHECKERS = readdirSync(join(SITE_DIR, 'scripts')).filter((n) => /^check-[\w-]+\.mjs$/.test(n)).sort();

// Contract: `npm run build` stops a broken site: every HTML checker in site/scripts runs after
// `astro build`, the steps are joined only by `&&`, and each checker exits non-zero, without an
// "ok" line, when the build output has none of the pages (executor briefing, item 1; spec,
// decision 9 and criterion 1).
// Breaks when: a fifth check-*.mjs is added and not wired into the build; a step is joined with
// `;` or `||`, so the build goes on past a failing check; or a checker stops failing closed (a
// main-module guard that never matches, a problem list that is printed but leaves exit code 0).
// Not covered by: test/site-integration.test.mjs and test/site-static.test.mjs compare the build
// string with a literal and run checkPages in memory; neither runs a checker as a program nor
// reads its exit code, and the CI never runs the build.
test('the build runs every checker of site/scripts, joined by &&, and each fails closed on an empty output', () => {
  const steps = JSON.parse(readFileSync(join(SITE_DIR, 'package.json'), 'utf8')).scripts.build.split('&&').map((s) => s.trim());
  assert.equal(steps[0], 'astro build');
  assert.ok(steps.every((s) => !/[;|]/.test(s)), `steps: ${JSON.stringify(steps)}`);
  assert.deepEqual(steps.slice(1).map((s) => s.replace(/^node scripts\//, '')).sort(), CHECKERS);
  assert.ok(CHECKERS.length >= 4, `checkers: ${CHECKERS}`);

  // realpath: on macOS the temp folder sits behind a symlink, and check-build only runs its main
  // when it is started by its real path (see the audit report of part 6).
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'site-checks-')));
  try {
    const site = join(tmp, 'site');
    mkdirSync(join(site, 'dist'), { recursive: true });
    cpSync(join(SITE_DIR, 'scripts'), join(site, 'scripts'), { recursive: true });
    cpSync(join(SITE_DIR, 'src'), join(site, 'src'), { recursive: true });
    for (const checker of CHECKERS) {
      const r = spawnSync(process.execPath, [join(site, 'scripts', checker)], { cwd: site, encoding: 'utf8' });
      assert.notEqual(r.status, 0, `${checker} exits 0 on an output with no page`);
      assert.doesNotMatch(r.stdout, /: ok\b/, `${checker} prints ok on an output with no page`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- a small site that passes, with the link forms the header and the home page write ----------

const SITE = 'https://www.vibeflow.run';
const head = (page) => {
  if (!page) return `<head><link rel="canonical" href="${SITE}/en/"></head>`;
  const rest = page.replace(/^(en|pt-br)\//, '');
  return `<head><link rel="canonical" href="${SITE}/${page}">` +
    `<link rel="alternate" hreflang="en" href="${SITE}/en/${rest}">` +
    `<link rel="alternate" hreflang="pt-BR" href="${SITE}/pt-br/${rest}">` +
    `<link rel="alternate" hreflang="x-default" href="${SITE}/en/${rest}"></head>`;
};
const nav = (l) => `<nav><a href="/${l}/#how">How</a><a href="/${l}/commands">Commands</a><a href="/${l}/anatomy/">Anatomy</a></nav>`;
function smallSite() {
  const pages = { '': `<html>${head('')}<body><main><h1>Vibeflow</h1><a href="/en/">Go</a></main></body></html>` };
  for (const l of ['en', 'pt-br']) {
    pages[`${l}/`] = `<html>${head(`${l}/`)}<body>${nav(l)}<h1>Home</h1><section id="how"><p>Text</p>` +
      `<a href="/${l}/commands#analyze">Analyze</a><a href="/${l}/commands/#audit">Audit</a></section></body></html>`;
    pages[`${l}/commands/`] = `<html>${head(`${l}/commands/`)}<body>${nav(l)}<h1>Commands</h1>` +
      `<article id="analyze"><p>A</p></article><article id="audit"><p>B</p></article></body></html>`;
    pages[`${l}/anatomy/`] = `<html>${head(`${l}/anatomy/`)}<body>${nav(l)}<h1>Anatomy</h1><p>Text</p></body></html>`;
  }
  return pages;
}

// Contract: every site link of every page goes to a page the build made, with or without a
// fragment, with or without the trailing slash (executor briefing, item 2: "/<lang>/<page>#x ...
// and the destination page that does not exist").
// Breaks when: the "goes to a page that does not exist" branch of check-build is dropped or
// turned into a skip, or the page pattern stops reading `/<lang>/<page>` without the slash the
// header writes (`/en/commands`), so a misspelt page link passes the build.
// Not covered by: test/site-integration.test.mjs breaks only the target id of links to pages that
// exist; no case links to a page that is not there.
test('a link to a page the build did not make fails and names the page, in each form the site writes', () => {
  assert.deepEqual(checkPages(smallSite()), []);
  const forms = [
    ['/<lang>/<page> (header form)', (l) => [`href="/${l}/commands"`, `href="/${l}/command"`]],
    ['/<lang>/<page>/ (slash)', (l) => [`href="/${l}/anatomy/"`, `href="/${l}/anatomie/"`]],
    ['/<lang>/<page>#x', (l) => [`href="/${l}/commands#analyze"`, `href="/${l}/comands#analyze"`]],
    ['/<lang>/<page>/#x', (l) => [`href="/${l}/commands/#audit"`, `href="/${l}/comands/#audit"`]],
  ];
  for (const [form, swap] of forms) {
    for (const page of ['en/', 'en/commands/']) {
      const pages = smallSite();
      for (const l of ['en', 'pt-br']) {
        const at = `${l}/${page.slice(3)}`;
        const [from, to] = swap(l);
        if (!pages[at].includes(from)) continue;
        pages[at] = pages[at].replaceAll(from, to);
      }
      if (JSON.stringify(pages) === JSON.stringify(smallSite())) continue;
      const problems = checkPages(pages);
      assert.ok(problems.some((p) => p.startsWith(`/${page}: `) && /page that does not exist/.test(p)), `${form} on /${page}:\n${problems.join('\n')}`);
    }
  }
});

// Contract: nothing is hidden at rest, judged by the rule the build applies, on the CSS every
// component, layout and page of the site writes (spec, decision 6 and criterion 3).
// Breaks when: a component gains `.hero-lede{opacity:0}`, a keyframe that starts at opacity 0 run
// without the html.motion-ok gate, or a selector list where one selector hides outside the gate,
// in any file under site/src (Hero, Header and Footer included).
// Not covered by: the per-component tests (site-demo, site-pipeline, site-pages) read their own
// files with their own patterns, and check-build, which holds the full rule, only runs in
// `npm run build`, which the CI does not run.
test('the CSS the site sources write passes the hidden-at-rest rule of check-build', () => {
  const found = [];
  let blocks = 0;
  for (const file of walk(join(SITE_DIR, 'src'))) {
    if (file.includes(`${join('styles', 'genius')}`) || file.includes(`${join('scripts', 'genius')}`)) continue;
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(SITE_DIR.length + 1);
    const sheets = file.endsWith('.css') ? [text] : file.endsWith('.astro') ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]) : [];
    for (const css of sheets) {
      blocks += 1;
      found.push(...checkCss(css.replace(/:global\(([^()]*)\)/g, '$1'), rel));
    }
  }
  assert.ok(blocks >= 10, `only ${blocks} style blocks read`);
  assert.deepEqual(found, []);
  // the rule is live on this kind of input
  assert.ok(checkCss('.hero-lede{opacity:0}', 'probe').length > 0);
});
