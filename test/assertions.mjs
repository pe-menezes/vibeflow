// Artifact-contract assertions for the pipeline smoke test.
//
// Every assertion here is mechanical: a file exists, a marker balances, a
// section is present, a count falls in range. None of them judges whether the
// artifact is any good — see the "Not checked" list in README.md, which the
// runner also prints so the limit travels with the output.
//
// Formats are read from the prompts that produce them
// (claude-code/skills/*/SKILL.md), not from the work order's summary table.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AUTO_START = '<!-- vibeflow:auto:start -->';
const AUTO_END = '<!-- vibeflow:auto:end -->';
const PATTERNS_START = '<!-- vibeflow:patterns:start -->';
const PATTERNS_END = '<!-- vibeflow:patterns:end -->';

const check = (name, ok, detail = '') => ({ name, ok: Boolean(ok), detail });
const skipped = (name, why) => ({ name, ok: null, detail: why });

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const countOf = (text, needle) => text.split(needle).length - 1;

// A markdown heading at any level whose text starts with `label`.
// Case-insensitive; tolerates bold, numbering and trailing text.
const hasHeading = (text, label) =>
  new RegExp(`^#{1,6}\\s+\\**\\s*(\\d+\\.?\\s*)?${label}`, 'im').test(text);

const headingIndex = (text, label) => {
  const match = new RegExp(
    `^#{1,6}\\s+\\**\\s*(\\d+\\.?\\s*)?${label}`,
    'im',
  ).exec(text);
  return match ? match.index : -1;
};

// ---------------------------------------------------------------- analyze

export function assertAnalyze(fixtureDir) {
  const vf = join(fixtureDir, '.vibeflow');
  const out = [];

  const index = read(join(vf, 'index.md'));
  out.push(check('index.md exists', index !== null, join(vf, 'index.md')));
  if (index === null) return out;

  // The registry block lives in index.md, between the patterns markers.
  const pStart = countOf(index, PATTERNS_START);
  const pEnd = countOf(index, PATTERNS_END);
  out.push(
    check(
      'vibeflow:patterns markers present and balanced in index.md',
      pStart >= 1 && pStart === pEnd,
      `start=${pStart} end=${pEnd}`,
    ),
  );

  // The auto markers wrap generated content in conventions.md and in every
  // pattern doc. Balance is checked per file: a global tally would hide a file
  // with two starts against another with two ends.
  const autoFiles = [];
  const conventions = read(join(vf, 'conventions.md'));
  if (conventions !== null) autoFiles.push(['conventions.md', conventions]);

  const patternsDir = join(vf, 'patterns');
  const patternFiles = existsSync(patternsDir)
    ? readdirSync(patternsDir).filter((f) => f.endsWith('.md'))
    : [];
  for (const file of patternFiles) {
    autoFiles.push([`patterns/${file}`, readFileSync(join(patternsDir, file), 'utf8')]);
  }

  const unbalanced = autoFiles.filter(
    ([, body]) => countOf(body, AUTO_START) !== countOf(body, AUTO_END),
  );
  const withAuto = autoFiles.filter(([, body]) => countOf(body, AUTO_START) >= 1);
  out.push(
    check(
      'vibeflow:auto markers present and balanced',
      withAuto.length >= 1 && unbalanced.length === 0,
      unbalanced.length
        ? `unbalanced: ${unbalanced.map(([f]) => f).join(', ')}`
        : `${withAuto.length}/${autoFiles.length} generated files carry the markers`,
    ),
  );

  const budget = /Suggested budget:\s*(≤|<=)\s*(\d+)/i.exec(index);
  out.push(
    check(
      'index.md carries a "Suggested budget: ≤ N" line',
      budget !== null,
      budget ? `≤ ${budget[2]} files` : 'line absent',
    ),
  );

  out.push(
    check(
      'at least one pattern doc was written',
      patternFiles.length >= 1,
      `${patternFiles.length} pattern docs`,
    ),
  );

  // Frontmatter must sit before the first auto marker, so `/vibeflow:teach`
  // edits to tags survive an incremental regeneration.
  const badFrontmatter = [];
  for (const file of patternFiles) {
    const body = readFileSync(join(patternsDir, file), 'utf8');
    const hasFm = body.startsWith('---\n') && body.indexOf('\n---', 4) !== -1;
    const autoAt = body.indexOf(AUTO_START);
    const fmEndsAt = hasFm ? body.indexOf('\n---', 4) : -1;
    if (!hasFm || autoAt === -1 || fmEndsAt > autoAt) badFrontmatter.push(file);
  }
  out.push(
    check(
      'every patterns/*.md has YAML frontmatter outside the auto markers',
      patternFiles.length >= 1 && badFrontmatter.length === 0,
      badFrontmatter.length ? `offenders: ${badFrontmatter.join(', ')}` : 'all clean',
    ),
  );

  return out;
}

// --------------------------------------------------------------- gen-spec

const SPEC_SECTIONS = [
  'Objective',
  'Context',
  'Definition of Done',
  'Scope',
  'Anti-?scope',
  'Technical Decisions',
  'Applicable Patterns',
  'Risks',
];

// Words that mark a check as a craftsmanship gate rather than a feature check.
// Keyword heuristic, stated as such in README.md.
const CRAFTSMANSHIP = [
  'convention', 'conventions.md', "don't", 'donts', "don'ts", 'lint',
  'no new any', 'any types', 'pattern', 'style', 'craftsmanship',
  'no violations', 'naming',
];

// Words that mark a check as naming an executable test.
const EXECUTABLE_TEST = [
  'npm test', 'node --test', 'yarn test', 'pnpm test', 'vitest', 'jest',
  'test suite', 'tests pass', 'passing test', '.test.js', 'test file',
];

export function findSpec(fixtureDir) {
  const dir = join(fixtureDir, '.vibeflow', 'specs');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files.length ? join(dir, files[0]) : null;
}

// The DoD block: everything between the "Definition of Done" heading and the
// next heading of the same or higher level.
function dodBlock(spec) {
  const start = headingIndex(spec, 'Definition of Done');
  if (start === -1) return '';
  const level = /^(#{1,6})/.exec(spec.slice(start))[1].length;
  const rest = spec.slice(start);
  const next = new RegExp(`\\n#{1,${level}}\\s`, 'm').exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
}

// A DoD check is a list item: "- [ ] ...", "- ...", or "1. ...".
function dodChecks(spec) {
  return dodBlock(spec)
    .split('\n')
    .filter((line) => /^\s*([-*]\s+(\[[ xX]\]\s*)?|\d+\.\s+)\S/.test(line))
    .map((line) => line.trim())
    .filter((line) => line.length > 8);
}

export function assertGenSpec(fixtureDir) {
  const out = [];
  const specPath = findSpec(fixtureDir);
  out.push(
    check(
      'spec written to .vibeflow/specs/<slug>.md',
      specPath !== null,
      specPath ?? 'no spec found',
    ),
  );
  if (!specPath) return out;

  const spec = readFileSync(specPath, 'utf8');

  const missing = SPEC_SECTIONS.filter((s) => !hasHeading(spec, s));
  out.push(
    check(
      'spec carries its named sections',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : `all ${SPEC_SECTIONS.length} present`,
    ),
  );

  const checks = dodChecks(spec);
  out.push(
    check(
      'DoD has 3–7 binary checks',
      checks.length >= 3 && checks.length <= 7,
      `${checks.length} checks`,
    ),
  );

  const lower = checks.map((c) => c.toLowerCase());
  const craft = lower.filter((c) => CRAFTSMANSHIP.some((k) => c.includes(k)));
  out.push(
    check(
      'at least one craftsmanship check',
      craft.length >= 1,
      craft.length ? `${craft.length} matched` : 'no check matched the craftsmanship keywords',
    ),
  );

  const exec = lower.filter((c) => EXECUTABLE_TEST.some((k) => c.includes(k)));
  out.push(
    check(
      'at least one check names an executable test',
      exec.length >= 1,
      exec.length ? `${exec.length} matched` : 'no check matched the executable-test keywords',
    ),
  );

  return out;
}

// ------------------------------------------------------------ prompt-pack

const PACK_OPENER = 'You are only seeing this prompt; there is no context outside it.';

// Two sections are named twice in the prompt and not identically: its outline
// says "Project patterns to follow" and "How to run and test", while the
// format blocks it tells the pack to emit say "## Patterns to Follow" and
// "## How to validate". Packs follow the format blocks, which is the more
// specific instruction, so both spellings are accepted here. Measured on both
// arms 2026-08-15, so the inconsistency predates the unhobbling series.
const PACK_SECTIONS = [
  'Objective and Definition of Done',
  'Anti-?scope',
  'Budget',
  '(Project p|P)atterns to [Ff]ollow',
  'Where to [Ww]ork',
  'Directional [Gg]uidance',
  '(How to run and test|How to [Vv]alidate)',
  'Docs to [Uu]pdate',
];

// Identifiers that exist only in the fixture's own source. Finding one inside a
// fenced block proves the pack embedded real code instead of citing a path.
const FIXTURE_CODE = ['assertShape', 'ValidationError', 'function ok(', 'fail(', 'nextId'];

export function assertPromptPack(fixtureDir) {
  const out = [];
  const dir = join(fixtureDir, '.vibeflow', 'prompt-packs');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  out.push(
    check(
      'pack written to .vibeflow/prompt-packs/<slug>.md',
      files.length >= 1,
      files.length ? files.join(', ') : 'no pack found',
    ),
  );
  if (!files.length) return out;

  const pack = readFileSync(join(dir, files[0]), 'utf8');

  out.push(
    check(
      'pack opens with the self-containment line',
      pack.includes(PACK_OPENER),
      pack.includes(PACK_OPENER) ? '' : 'opening line absent',
    ),
  );

  const positions = PACK_SECTIONS.map((s) => [s, headingIndex(pack, s)]);
  const absent = positions.filter(([, i]) => i === -1).map(([s]) => s);
  out.push(
    check(
      'pack carries its named sections',
      absent.length === 0,
      absent.length ? `missing: ${absent.join(', ')}` : `all ${PACK_SECTIONS.length} present`,
    ),
  );

  const found = positions.filter(([, i]) => i !== -1).map(([, i]) => i);
  const ordered = found.every((v, i) => i === 0 || found[i - 1] < v);
  out.push(
    check(
      'pack sections appear in the specified order',
      ordered,
      ordered ? '' : 'sections out of order',
    ),
  );

  // Fenced blocks only: a mention of `assertShape` in prose is a reference,
  // an occurrence inside a fence is embedded code.
  const fences = [...pack.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join('\n');
  const embedded = FIXTURE_CODE.filter((id) => fences.includes(id));
  out.push(
    check(
      'pattern code embedded, not referenced by path',
      embedded.length >= 1,
      embedded.length
        ? `fixture identifiers inside code fences: ${embedded.join(', ')}`
        : 'no fixture source found inside any code fence',
    ),
  );

  return out;
}

// --------------------------------------------------------------- implement

// Anti-scope items that name a concrete repo path can be checked against the
// diff. Items phrased as prose cannot, and are reported as unchecked rather
// than silently counted as passing.
function antiScopePaths(spec) {
  const start = headingIndex(spec, 'Anti-?scope');
  if (start === -1) return { paths: [], prose: 0 };
  const level = /^(#{1,6})/.exec(spec.slice(start))[1].length;
  const rest = spec.slice(start);
  const next = new RegExp(`\\n#{1,${level}}\\s`, 'm').exec(rest.slice(1));
  const block = next ? rest.slice(0, next.index + 1) : rest;

  const items = block
    .split('\n')
    .filter((line) => /^\s*([-*]\s+|\d+\.\s+)\S/.test(line));

  const paths = [];
  let prose = 0;
  for (const item of items) {
    const hits = [...item.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((t) => /^[\w./-]+\.(js|mjs|json|md)$/.test(t) || /^(src|test)\//.test(t));
    if (hits.length) paths.push(...hits);
    else prose += 1;
  }
  return { paths: [...new Set(paths)], prose };
}

export function assertImplement(fixtureDir, { changedFiles, budget, testsPass }) {
  const out = [];

  out.push(
    check(
      `files touched within budget (≤ ${budget})`,
      changedFiles.length <= budget,
      `${changedFiles.length} files: ${changedFiles.join(', ') || 'none'}`,
    ),
  );

  out.push(
    check(
      'implementation actually changed something',
      changedFiles.length >= 1,
      changedFiles.length ? '' : 'no non-.vibeflow file was touched',
    ),
  );

  const specPath = findSpec(fixtureDir);
  if (specPath) {
    const { paths, prose } = antiScopePaths(readFileSync(specPath, 'utf8'));
    if (paths.length) {
      const violated = paths.filter((p) =>
        changedFiles.some((f) => f === p || f.startsWith(p.replace(/\/$/, '') + '/')),
      );
      out.push(
        check(
          'no path-naming anti-scope item violated',
          violated.length === 0,
          violated.length ? `touched: ${violated.join(', ')}` : `${paths.length} paths checked`,
        ),
      );
    } else {
      out.push(
        skipped(
          'no path-naming anti-scope item violated',
          'the spec names no anti-scope path — nothing mechanically checkable',
        ),
      );
    }
    if (prose > 0) {
      out.push(
        skipped(
          'prose anti-scope items',
          `${prose} item(s) phrased without a path — not machine-checkable, not verified`,
        ),
      );
    }
  }

  out.push(check("the fixture's tests pass", testsPass, testsPass ? 'npm test exit 0' : 'npm test failed'));

  return out;
}

// ------------------------------------------------------------------ audit

const AUDIT_SECTIONS = ['DoD Checklist', 'Pattern Compliance', 'Critical Gate'];

export function assertAudit(fixtureDir) {
  const out = [];
  const dir = join(fixtureDir, '.vibeflow', 'audits');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  const named = files.filter((f) => f.endsWith('-audit.md'));

  out.push(
    check(
      'report written to .vibeflow/audits/<slug>-audit.md',
      named.length >= 1,
      files.length ? files.join(', ') : 'no report found',
    ),
  );
  if (!files.length) return out;

  const report = readFileSync(join(dir, named[0] ?? files[0]), 'utf8');

  const verdict = /\*\*\s*Verdict:\s*(PASS|PARTIAL|FAIL)/i.exec(report)
    ?? /^#{1,6}\s*Verdict[:\s]+(PASS|PARTIAL|FAIL)/im.exec(report);
  out.push(
    check(
      'verdict parseable as PASS / PARTIAL / FAIL',
      verdict !== null,
      verdict ? verdict[1].toUpperCase() : 'no parseable verdict line',
    ),
  );

  const missing = AUDIT_SECTIONS.filter((s) => !hasHeading(report, s));
  out.push(
    check(
      'report carries Verdict, DoD Checklist, Pattern Compliance and Critical Gate',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : 'all present',
    ),
  );

  return out;
}

export const VERDICT_OF = (fixtureDir) => {
  const dir = join(fixtureDir, '.vibeflow', 'audits');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (!files.length) return null;
  const report = readFileSync(join(dir, files[0]), 'utf8');
  const m = /\*\*\s*Verdict:\s*(PASS|PARTIAL|FAIL)/i.exec(report);
  return m ? m[1].toUpperCase() : null;
};
