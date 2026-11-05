#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, sep } from 'node:path';
import pc from 'picocolors';

// --- Config ---

const REPO = 'pe-menezes/vibeflow';
const BRANCH = 'main';
const PLUGIN_MARKETPLACE_REPO = 'pe-menezes/vibeflow';

// The install log names this CLI's version, read from the package.json published beside it,
// so whoever runs an older copy through a cached npx sees which one ran.
const CLI_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

// Every download starts from this base. The override exists for tests and mirrors.
const BASE_URL_ENV = 'VIBEFLOW_BASE_URL';
const DEFAULT_BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const BASE_URL = (process.env[BASE_URL_ENV] || DEFAULT_BASE_URL).replace(/\/+$/, '');

// The loop kit has one source, inside the plugin's implement skill; its manifest lists the
// files, so a kit file added later needs no change here.
const KIT_BASE_URL = `${BASE_URL}/plugins/vibeflow/skills/implement/loop`;
// The shared skills, which an edition that runs them unchanged installs from their one source.
const SKILLS_BASE_URL = `${BASE_URL}/plugins/vibeflow/skills`;
const KIT_MANIFEST = 'manifest.json';
// A manifest entry is a plain relative path: no absolute path, no "..", no hidden segment. That
// stops lexical traversal only: a link already in the user's project can still lead out of it,
// and what keeps every write inside the project is the check in landsOutside, before any write.
const KIT_PATH_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

const COPILOT_FILES = [
  { src: 'github/prompts/vibeflow-analyze.prompt.md', dest: '.github/prompts/vibeflow-analyze.prompt.md' },
  { src: 'github/prompts/vibeflow-audit.prompt.md', dest: '.github/prompts/vibeflow-audit.prompt.md' },
  { src: 'github/prompts/vibeflow-discover.prompt.md', dest: '.github/prompts/vibeflow-discover.prompt.md' },
  { src: 'github/prompts/vibeflow-gen-spec.prompt.md', dest: '.github/prompts/vibeflow-gen-spec.prompt.md' },
  { src: 'github/prompts/vibeflow-hotfix.prompt.md', dest: '.github/prompts/vibeflow-hotfix.prompt.md' },
  { src: 'github/prompts/vibeflow-implement.prompt.md', dest: '.github/prompts/vibeflow-implement.prompt.md' },
  { src: 'github/prompts/vibeflow-prompt-pack.prompt.md', dest: '.github/prompts/vibeflow-prompt-pack.prompt.md' },
  { src: 'github/prompts/vibeflow-quick.prompt.md', dest: '.github/prompts/vibeflow-quick.prompt.md' },
  { src: 'github/prompts/vibeflow-stats.prompt.md', dest: '.github/prompts/vibeflow-stats.prompt.md' },
  { src: 'github/prompts/vibeflow-teach.prompt.md', dest: '.github/prompts/vibeflow-teach.prompt.md' },
  { src: 'github/agents/vibeflow-architect.agent.md', dest: '.github/agents/vibeflow-architect.agent.md' },
  { src: 'github/instructions/vibeflow/vibeflow.instructions.md', dest: '.github/instructions/vibeflow/vibeflow.instructions.md' },
];

const CURSOR_FILES = [
  { src: 'rules/vibeflow.mdc', dest: '.cursor/rules/vibeflow.mdc' },
  { src: 'rules/vibeflow-architect.mdc', dest: '.cursor/rules/vibeflow-architect.mdc' },
  { src: 'skills/vibeflow-analyze/SKILL.md', dest: '.cursor/skills/vibeflow-analyze/SKILL.md' },
  { src: 'skills/vibeflow-audit/SKILL.md', dest: '.cursor/skills/vibeflow-audit/SKILL.md' },
  { src: 'skills/vibeflow-discover/SKILL.md', dest: '.cursor/skills/vibeflow-discover/SKILL.md' },
  { src: 'skills/vibeflow-gen-spec/SKILL.md', dest: '.cursor/skills/vibeflow-gen-spec/SKILL.md' },
  { src: 'skills/vibeflow-hotfix/SKILL.md', dest: '.cursor/skills/vibeflow-hotfix/SKILL.md' },
  { src: 'skills/vibeflow-implement/SKILL.md', dest: '.cursor/skills/vibeflow-implement/SKILL.md' },
  { src: 'skills/vibeflow-prompt-pack/SKILL.md', dest: '.cursor/skills/vibeflow-prompt-pack/SKILL.md' },
  { src: 'skills/vibeflow-quick/SKILL.md', dest: '.cursor/skills/vibeflow-quick/SKILL.md' },
  { src: 'skills/vibeflow-teach/SKILL.md', dest: '.cursor/skills/vibeflow-teach/SKILL.md' },
  { src: 'skills/vibeflow-stats/SKILL.md', dest: '.cursor/skills/vibeflow-stats/SKILL.md' },
];

// OpenCode runs the shared skills as they are: each goes to .opencode/skills/<name>/, keeping
// its name, because the host loads a skill only when its name matches its folder, and the
// implement skill reaches the kit as loop/ beside its SKILL.md. An entry with its own baseUrl
// is fetched from there instead of the edition's base.
const OPENCODE_WORKFLOWS = ['analyze', 'audit', 'discover', 'gen-spec', 'hotfix', 'implement', 'prompt-pack', 'quick', 'stats', 'teach'];

const OPENCODE_FILES = [
  { src: 'agents/architect.md', dest: '.opencode/agents/architect.md' },
  { src: 'agents/executor.md', dest: '.opencode/agents/executor.md' },
  { src: 'agents/auditor.md', dest: '.opencode/agents/auditor.md' },
  ...OPENCODE_WORKFLOWS.map((name) => ({ src: `commands/vibeflow-${name}.md`, dest: `.opencode/commands/vibeflow-${name}.md` })),
  ...OPENCODE_WORKFLOWS.map((name) => ({ src: `${name}/SKILL.md`, dest: `.opencode/skills/${name}/SKILL.md`, baseUrl: SKILLS_BASE_URL })),
];

const EDITIONS = {
  copilot: {
    name: 'Copilot',
    baseUrl: `${BASE_URL}/copilot`,
    files: COPILOT_FILES,
    kitDest: '.github/vibeflow/loop',
    marker: '.github/prompts/vibeflow-analyze.prompt.md',
    markerLegacy: '.github/prompts/vibeflow/vibeflow-analyze.prompt.md',
    agentsSrc: 'AGENTS.md',
    doneMessage: `Run ${pc.bold('/vibeflow-analyze')} in Copilot Chat to get started.`,
    handleCopilotInstructions: true,
  },
  cursor: {
    name: 'Cursor',
    baseUrl: `${BASE_URL}/cursor`,
    files: CURSOR_FILES,
    kitDest: '.cursor/skills/vibeflow-implement/loop',
    marker: '.cursor/rules/vibeflow.mdc',
    markerLegacy: null,
    agentsSrc: 'AGENTS.md',
    doneMessage: `Type ${pc.bold('/vibeflow-analyze')} in Cursor Agent chat to get started.`,
    handleCopilotInstructions: false,
  },
  opencode: {
    name: 'OpenCode',
    baseUrl: `${BASE_URL}/opencode`,
    files: OPENCODE_FILES,
    kitDest: '.opencode/skills/implement/loop',
    marker: '.opencode/commands/vibeflow-analyze.md',
    markerLegacy: null,
    agentsSrc: 'AGENTS.md',
    doneMessage: `Type ${pc.bold('/vibeflow-analyze')} in OpenCode to get started.`,
    handleCopilotInstructions: false,
  },
};

const VIBEFLOW_START = '<!-- vibeflow:start -->';
const VIBEFLOW_END = '<!-- vibeflow:end -->';

const GITIGNORE_MARKER = '# Vibeflow — installed + generated (remove to track in git)';

const GITIGNORE_BLOCKS = {
  copilot: `
# Vibeflow — installed + generated (remove to track in git)
.vibeflow/
.github/prompts/vibeflow-*.prompt.md
.github/agents/vibeflow-architect.agent.md
.github/instructions/vibeflow/
.github/vibeflow/
`,
  cursor: `
# Vibeflow — installed + generated (remove to track in git)
.vibeflow/
.cursor/rules/vibeflow.mdc
.cursor/rules/vibeflow-architect.mdc
.cursor/skills/vibeflow-*/
`,
  opencode: `
# Vibeflow — installed + generated (remove to track in git)
.vibeflow/
.opencode/agents/architect.md
.opencode/agents/executor.md
.opencode/agents/auditor.md
.opencode/commands/vibeflow-*.md
${OPENCODE_WORKFLOWS.map((name) => `.opencode/skills/${name}/`).join('\n')}
`,
};

// What a reinstall may add to a Vibeflow block that is already in .gitignore. A line that an
// older block already had is never added back: the user may have changed or deleted it on
// purpose (the hotfix carve-out swaps `.vibeflow/` for `.vibeflow/*` + `!.vibeflow/hotfixes/`).
// `shared` lines belong to every edition's block. `since` lists, per edition, the lines that
// entered its block after its first release, each with the version that added it; a new
// line in GITIGNORE_BLOCKS goes here too, or existing installs never get it.
const GITIGNORE_UPDATES = {
  shared: ['.vibeflow/'],
  since: {
    copilot: [
      '.github/vibeflow/', // 0.17.0: the loop kit folder
    ],
    cursor: [],
    opencode: [],
  },
};

// --- Helpers ---

function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// The confinement: where a write lands, and whether it may happen. It takes its path module and
// its lstatSync and readlinkSync as arguments and reaches nothing else, so the same code runs
// under Windows path rules in the suite (test/cli-kit.test.mjs), which the CI cannot run otherwise.
function confinement(paths, fs) {
  const { sep, dirname, join, isAbsolute, parse, relative } = paths;
  const { lstatSync, readlinkSync } = fs;

  // A path's root comes from the path itself: `/`, a drive (`C:\`) or a share (`\\srv\share\`),
  // never the separator alone, which on Windows is no root at all (`\C:` names nothing). Its
  // names are what follows the root, split at every separator the path rules accept.
  const separators = sep === '\\' ? /[\\/]+/ : /\/+/;
  const rootOf = (path) => {
    const root = parse(path).root;
    return root ? join(root) : root;
  };
  const namesOf = (path, root) => path.slice(root.length).split(separators).filter(Boolean);

  // Where a write to the absolute `path` lands, walked the way the file system walks it: one name
  // at a time from the root, a link replaced by its target where it stands, so a `..` after a link
  // climbs from where the link really leads (`bridge/../x` with `bridge -> ../outside/deep` lands
  // in `outside/x`), never from the name as written. A name that is not there yet is a folder or
  // the file the installer would create, so it stands as written. A loop of links throws ELOOP.
  function landing(path) {
    const start = parse(path).root;
    const names = namesOf(path, start);
    let real = rootOf(path);
    let missing = false;
    let hops = 0;
    while (names.length > 0) {
      const name = names.shift();
      if (name === '.') continue;
      if (name === '..') {
        real = dirname(real);
        missing = false;
        continue;
      }
      const next = join(real, name);
      let stat = null;
      if (!missing) {
        try {
          stat = lstatSync(next);
        } catch (err) {
          if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
        }
      }
      if (stat && stat.isSymbolicLink()) {
        hops += 1;
        if (hops > 40) {
          const err = new Error(`${path} is a loop of links`);
          err.code = 'ELOOP';
          err.path = path;
          throw err;
        }
        // A relative target stands where the link stands; an absolute one starts again at its own
        // root, and one rooted at the separator alone (`\x` on Windows) at the root it is read on.
        const target = readlinkSync(next);
        if (isAbsolute(target)) {
          const own = parse(target).root;
          names.unshift(...namesOf(target, own));
          real = /^[\\/]$/.test(own) ? rootOf(real) : rootOf(target);
        } else {
          names.unshift(...namesOf(target, ''));
        }
        continue;
      }
      missing = !stat;
      real = next;
    }
    return real;
  }

  // Why writing `dest` (relative to cwd) would leave the project, or null when it would not: the
  // file and every folder on its way, links resolved, must land inside the project's real root.
  // --force does not change this: it overwrites Vibeflow's own files, it never follows a link out.
  function landsOutside(root, cwd, dest) {
    const inside = (path) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
    const parts = dest.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('/');
      const real = landing(join(cwd, prefix));
      if (!inside(real)) return `${prefix} leads to ${real}, outside the project (${root})`;
    }
    return null;
  }

  // Why writing `dest` would change a file under another name, or null when it would not: a
  // regular file with more than one name (a hard link) changes under every name it has, wherever
  // those are, outside the project included, so it is refused even when a link in the project
  // leads to it.
  function hardLinked(root, cwd, dest) {
    const real = landing(join(cwd, dest));
    let stat;
    try {
      stat = lstatSync(real);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
      throw err;
    }
    if (!stat.isFile() || stat.nlink < 2) return null;
    return `${relative(root, real) || real} is a hard link, one of ${stat.nlink} names for the same file: writing it would change the file under each of them, wherever they are`;
  }

  return { landing, landsOutside, hardLinked };
}

const { landing, landsOutside, hardLinked } = confinement({ sep, dirname, join, isAbsolute, parse, relative }, { lstatSync, readlinkSync });

// Writes `dest` only where landsOutside and hardLinked allow, creating the folders on its way.
function writeInside(root, cwd, dest, content) {
  const reason = landsOutside(root, cwd, dest) || hardLinked(root, cwd, dest);
  if (reason) throw new Error(reason);
  const destPath = join(cwd, dest);
  ensureDir(dirname(destPath));
  writeFileSync(destPath, content, 'utf-8');
}

async function downloadFile(baseUrl, srcPath) {
  const url = `${baseUrl}/${srcPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    error.status = res.status;
    throw error;
  }
  return res.text();
}

// The kit's files, or null when the base has no manifest (404): a base published before the
// kit, or a mirror without it, still installs the edition. A manifest that is there but
// malformed throws, so nothing is written from a list nobody can trust.
async function loadKitFiles(kitDest) {
  let raw;
  try {
    raw = await downloadFile(KIT_BASE_URL, KIT_MANIFEST);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error(`loop kit ${KIT_MANIFEST} is not valid JSON`);
  }
  if (!manifest || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`loop kit ${KIT_MANIFEST} has no "files" list`);
  }
  for (const path of manifest.files) {
    if (typeof path !== 'string' || !KIT_PATH_PATTERN.test(path)) {
      throw new Error(`loop kit ${KIT_MANIFEST} lists ${JSON.stringify(path)}, which is not a plain path inside the kit folder`);
    }
  }
  return manifest.files.map((path) => ({ src: path, dest: `${kitDest}/${path}`, baseUrl: KIT_BASE_URL }));
}

// The text below the source's `---`.
function extractAgentsAppendContent(fullContent) {
  const separatorIndex = fullContent.indexOf('\n---\n');
  return separatorIndex === -1 ? fullContent : fullContent.slice(separatorIndex + '\n---\n'.length);
}

function extractCopilotInstructionsSnippet(fullContent) {
  const match = fullContent.match(/```markdown\n([\s\S]*?)```/);
  if (!match) return null;
  return match[1].trim();
}

// A source that carries its own delimiters, for whoever copies the file by hand (the editions'
// AGENTS.md and the Copilot snippet do), gives what is between them: upsertDelimitedBlock adds the pair.
function withoutOwnDelimiters(block) {
  const starts = markerLines(block, VIBEFLOW_START);
  const ends = markerLines(block, VIBEFLOW_END);
  if (starts.length === 0 || ends.length === 0) return block;
  const startIdx = starts[0];
  const endIdx = ends[ends.length - 1];
  if (endIdx < startIdx) return block;
  return block.slice(startIdx + VIBEFLOW_START.length, endIdx);
}

// The lines of a text as Markdown reads them, the one reading that codeLines and markerLines
// share: a line ends at LF, CRLF or a lone CR, and nothing else ends it. Gives where each line
// starts and its text without the line end; a text that ends with a line end ends with an empty line.
function linesOf(text) {
  const lines = [];
  const lineEnd = /\r\n|\r|\n/g;
  let start = 0;
  for (let match = lineEnd.exec(text); match; match = lineEnd.exec(text)) {
    lines.push({ start, text: text.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  lines.push({ start, text: text.slice(start) });
  return lines;
}

// The column where a line's text starts, a tab advancing to the next multiple of four, and that text.
function indentOf(line) {
  let column = 0;
  let i = 0;
  for (; i < line.length; i += 1) {
    if (line[i] === ' ') column += 1;
    else if (line[i] === '\t') column += 4 - (column % 4);
    else break;
  }
  return { column, rest: line.slice(i) };
}

// The code in a Markdown text: the offset where each code line starts, and the fence still open
// at the end of the text, or null. A fence is a line of three or more backticks or tildes,
// indented less than four columns (a backtick fence's info string has no backtick); the first
// later line of the same character, at least as long and with nothing after it, closes it, and a
// fence never closed runs to the end. A line indented by four columns or more, a tab included,
// is code too.
function codeLines(text) {
  const code = new Set();
  let fence = null;
  for (const { start, text: line } of linesOf(text)) {
    const { column, rest } = indentOf(line);
    if (fence) {
      code.add(start);
      const close = column < 4 && rest.match(/^(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
    } else if (column >= 4) {
      code.add(start);
    } else {
      const open = rest.match(/^(`{3,}|~{3,})(.*)$/);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
        fence = open[1];
        code.add(start);
      }
    }
  }
  return { code, open: fence };
}

// A delimiter is a marker that is the whole line, spaces around it aside, outside any code. A
// marker quoted inside a line (between backticks, at the head of a sentence) or written in a
// fenced or indented code block (the user's example of the format) is the user's text, never a
// delimiter. Gives the offset of the marker in each such line, in file order.
function markerLines(text, marker) {
  const offsets = [];
  const { code } = codeLines(text);
  const whole = new RegExp(`^([ \\t]*)${marker}[ \\t]*$`);
  for (const { start, text: line } of linesOf(text)) {
    const match = whole.exec(line);
    if (match && !code.has(start)) offsets.push(start + match[1].length);
  }
  return offsets;
}

// The block goes at the end of the file, outside any code, and every byte the user wrote stays:
// a last line with no line end gets one, a fence the user left open there is closed with its own
// fence, which renders the same, so the block is found on the next run, and a blank line goes
// before the block unless the file already ends in one.
function appendBlock(existing, delimited) {
  const { open } = codeLines(existing);
  let text = existing;
  if (linesOf(text).at(-1).text !== '') text += '\n';
  if (open) text += `${open}\n`;
  const lines = linesOf(text);
  if (!(lines.length >= 3 && lines.at(-2).text.trim() === '')) text += '\n';
  return text + delimited + '\n';
}

// The block in the user's file is a real pair: the first end that has a start above it, with the
// last start above that end. A start with no end below it, or an end with no start above it, is
// the user's text and stays where it is, along with everything around it.
function findDelimitedPair(existing) {
  const starts = markerLines(existing, VIBEFLOW_START);
  for (const endIdx of markerLines(existing, VIBEFLOW_END)) {
    const above = starts.filter((startIdx) => startIdx < endIdx);
    if (above.length > 0) return { startIdx: above[above.length - 1], endIdx };
  }
  return null;
}

function upsertDelimitedBlock(existing, newBlock, legacyMarker) {
  const delimited = `${VIBEFLOW_START}\n${withoutOwnDelimiters(newBlock).trim()}\n${VIBEFLOW_END}`;

  if (!existing) {
    return { content: delimited + '\n', action: 'created' };
  }

  const pair = findDelimitedPair(existing);

  if (pair) {
    // An older CLI wrapped a source that had its own delimiters, and each rerun left one more
    // end delimiter: the extra start right above the block and the ends right below it, with
    // only blank space between, go with it. Only delimiter lines go; anything else around the
    // pair, a marker quoted in the user's text included, is left alone.
    const blank = (text) => text.trim() === '';
    let blockStart = pair.startIdx;
    const starts = markerLines(existing, VIBEFLOW_START);
    for (let i = starts.length - 1; i >= 0; i -= 1) {
      if (starts[i] >= blockStart) continue;
      if (!blank(existing.slice(starts[i] + VIBEFLOW_START.length, blockStart))) break;
      blockStart = starts[i];
    }
    const before = existing.slice(0, blockStart);
    let blockEnd = pair.endIdx + VIBEFLOW_END.length;
    for (const endIdx of markerLines(existing, VIBEFLOW_END)) {
      if (endIdx < blockEnd) continue;
      if (!blank(existing.slice(blockEnd, endIdx))) break;
      blockEnd = endIdx + VIBEFLOW_END.length;
    }
    const after = existing.slice(blockEnd);
    const content = before + delimited + after;
    return { content, action: 'replaced' };
  }

  if (legacyMarker && existing.includes(legacyMarker)) {
    return { content: appendBlock(existing, delimited), action: 'legacy-append', warning: true };
  }

  return { content: appendBlock(existing, delimited), action: 'appended' };
}

// The .gitignore block is a marker comment line followed by its paths, up to the first blank
// line. Pure, like upsertDelimitedBlock: marker absent → the block is appended. Marker present
// → the edition's lines listed in GITIGNORE_UPDATES.since that the file does not have yet
// (anywhere, as a whole line) are inserted right after the block. When the file has none of
// the edition's own lines, the block there is another edition's (they share the marker), and
// all of this edition's lines except the shared ones are the candidates instead.
function upsertGitignoreBlock(existing, block, edition) {
  const marker = GITIGNORE_MARKER;
  const paths = block.trim().split('\n').filter((line) => line !== marker);
  const lines = existing.split('\n');
  const bare = (line) => line.replace(/\r$/, '').trim();
  const markerIdx = lines.findIndex((line) => bare(line) === marker);
  if (markerIdx === -1) {
    const content = (existing.trimEnd() ? existing.trimEnd() + '\n' : '') + block.trim() + '\n';
    return { content, action: 'appended', added: paths };
  }
  const present = new Set(lines.map(bare));
  const since = GITIGNORE_UPDATES.since[edition] || [];
  const own = paths.filter((path) => !GITIGNORE_UPDATES.shared.includes(path));
  const firstRelease = own.filter((path) => !since.includes(path));
  const installed = firstRelease.some((path) => present.has(path));
  const candidates = installed ? since : own;
  const missing = candidates.filter((path) => !present.has(path));
  if (missing.length === 0) return { content: existing, action: 'present', added: [] };
  let end = markerIdx + 1;
  while (end < lines.length && bare(lines[end]) !== '') end += 1;
  const eol = lines[markerIdx].endsWith('\r') ? '\r' : '';
  lines.splice(end, 0, ...missing.map((path) => path + eol));
  return { content: lines.join('\n'), action: 'updated', added: missing };
}

function detectEdition() {
  const args = process.argv.slice(2);
  if (args.includes('--cursor')) return 'cursor';
  if (args.includes('--copilot')) return 'copilot';
  if (args.includes('--opencode')) return 'opencode';
  if (args.includes('--codex')) return 'codex';
  if (args.includes('--claude') || args.includes('--claude-code')) return 'claude';
  return null;
}

function printClaudeInstructions() {
  console.log('');
  console.log(`  ${pc.bold(pc.cyan('Vibeflow'))} ${pc.dim('— Claude Code Edition')}`);
  console.log('');
  console.log(`  Claude Code uses a ${pc.bold('plugin system')} — not file downloads.`);
  console.log('');
  console.log(`  ${pc.bold(pc.underline('Claude Desktop (Cowork)'))}`);
  console.log(`  ${pc.bold('1.')} Sidebar → ${pc.cyan('Customize')}`);
  console.log(`  ${pc.bold('2.')} Click ${pc.cyan('+')} next to "Personal plugins" → ${pc.cyan('Add marketplace')}`);
  console.log(`  ${pc.bold('3.')} Paste: ${pc.cyan(PLUGIN_MARKETPLACE_REPO)}`);
  console.log(`  ${pc.bold('4.')} Click ${pc.cyan('Sync')}`);
  console.log(`  ${pc.bold('5.')} ${pc.cyan('Browse plugins')} → Install ${pc.bold('Vibeflow')}`);
  console.log('');
  console.log(`  ${pc.bold(pc.underline('Claude Code CLI (terminal)'))}`);
  console.log(`  ${pc.bold('1.')} ${pc.cyan(`/plugin marketplace add ${PLUGIN_MARKETPLACE_REPO}`)}`);
  console.log(`  ${pc.bold('2.')} ${pc.cyan('/plugin install vibeflow@vibeflow-marketplace')}`);
  console.log('');
  console.log(`  ${pc.bold('Then run:')} ${pc.cyan('/vibeflow:analyze')} to get started.`);
  console.log('');
  console.log(`  ${pc.dim('Plugin repo:')} ${pc.dim(`https://github.com/${PLUGIN_MARKETPLACE_REPO}`)}`);
  console.log('');
}

function printCodexInstructions() {
  console.log('');
  console.log(`  ${pc.bold(pc.cyan('Vibeflow'))} ${pc.dim('— Codex Edition')}`);
  console.log('');
  console.log(`  ${pc.bold('1.')} ${pc.cyan(`codex plugin marketplace add ${PLUGIN_MARKETPLACE_REPO}`)}`);
  console.log(`  ${pc.bold('2.')} ${pc.cyan('codex plugin add vibeflow@vibeflow-marketplace')}`);
  console.log('');
  console.log(`  ${pc.bold('Then:')} start a new Codex task and ask it to analyze the project with Vibeflow.`);
  console.log('');
  console.log(`  ${pc.dim('Plugin repo:')} ${pc.dim(`https://github.com/${PLUGIN_MARKETPLACE_REPO}`)}`);
  console.log('');
}

function printUsage() {
  console.log('');
  console.log(`  ${pc.bold(pc.cyan('Vibeflow'))} ${pc.dim('— Setup')}`);
  console.log('');
  console.log(`  ${pc.bold('Usage:')} npx setup-vibeflow@latest ${pc.cyan('<edition>')}`);
  console.log('');
  console.log(`  ${pc.bold('Editions:')}`);
  console.log(`    ${pc.cyan('--copilot')}   Install for GitHub Copilot ${pc.dim('(.github/prompts, agents, instructions, vibeflow/loop)')}`);
  console.log(`    ${pc.cyan('--cursor')}    Install for Cursor ${pc.dim('(.cursor/rules, skills, the loop kit in skills/vibeflow-implement/loop)')}`);
  console.log(`    ${pc.cyan('--opencode')}  Install for OpenCode ${pc.dim('(.opencode/agents, commands, skills, the loop kit in skills/implement/loop)')}`);
  console.log(`    ${pc.cyan('--codex')}     Show install instructions for Codex ${pc.dim('(plugin system)')}`);
  console.log(`    ${pc.cyan('--claude')}    Show install instructions for Claude Code ${pc.dim('(plugin system)')}`);
  console.log('');
  console.log(`  ${pc.bold('Options:')}`);
  console.log(`    ${pc.cyan('--force')}     Overwrite existing files`);
  console.log('');
  console.log(`  ${pc.bold('Environment:')}`);
  console.log(`    ${pc.cyan(BASE_URL_ENV)}   Download from this base instead of ${pc.dim(DEFAULT_BASE_URL)}`);
  console.log(`    ${' '.repeat(BASE_URL_ENV.length)}   ${pc.dim('(for tests and mirrors; the layout below it must match the repository)')}`);
  console.log('');
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --copilot`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --cursor`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --opencode`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --codex`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --claude`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --cursor --force`);
  console.log('');
}

// --- Main ---

async function main() {
  const force = process.argv.includes('--force');
  const help = process.argv.includes('--help') || process.argv.includes('-h');
  const cwd = process.cwd();

  if (help) {
    printUsage();
    process.exit(0);
  }

  const editionKey = detectEdition();

  if (!editionKey) {
    printUsage();
    process.exit(1);
  }

  if (editionKey === 'claude') {
    printClaudeInstructions();
    process.exit(0);
  }

  if (editionKey === 'codex') {
    printCodexInstructions();
    process.exit(0);
  }

  const edition = EDITIONS[editionKey];

  console.log('');
  console.log(`  ${pc.dim(`setup-vibeflow ${CLI_VERSION}`)}`);
  console.log(`  ${pc.bold(pc.cyan('Vibeflow'))} ${pc.dim(`— ${edition.name} Edition`)}`);
  console.log('');

  // Check Node.js version
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  if (nodeVersion < 18) {
    log(pc.red('x'), `Node.js 18+ required (you have ${process.versions.node})`);
    process.exit(1);
  }

  // Check if already installed
  const markerPath = join(cwd, edition.marker);
  const markerLegacyPath = edition.markerLegacy ? join(cwd, edition.markerLegacy) : null;
  if ((existsSync(markerPath) || (markerLegacyPath && existsSync(markerLegacyPath))) && !force) {
    log(pc.yellow('!'), 'Vibeflow already installed. Use --force to reinstall.');
    console.log('');
    process.exit(0);
  }

  // The loop kit's manifest is read and checked before anything is written
  let kitFiles;
  try {
    kitFiles = await loadKitFiles(edition.kitDest);
  } catch (err) {
    log(pc.red('x'), `loop kit — ${err.message}`);
    process.exit(1);
  }
  if (kitFiles === null) {
    log(pc.yellow('!'), `loop kit — ${KIT_BASE_URL}/${KIT_MANIFEST} answered 404, so this base has no kit; installing ${edition.name} without it (implement --loop and stats need it: rerun with --force once the base has it)`);
    kitFiles = [];
  }
  const files = [...edition.files.map((file) => ({ baseUrl: edition.baseUrl, ...file })), ...kitFiles];

  // Every path the install may write is checked before the first download: a link in the project
  // that leads out of it refuses the whole install, so nothing lands half installed or outside.
  // A check that fails refuses like a path that leads out, with its reason: the project folder
  // itself first, since every other path is measured against where it lands. Each refusal has a
  // kind (a link, a hard link, a check that could not run), and the closing lines give the remedy
  // for each kind that is there, since what undoes a link does nothing for a hard link.
  const writes = [...files.map((file) => file.dest), 'AGENTS.md', '.gitignore'];
  if (edition.handleCopilotInstructions) writes.push('.github/copilot-instructions.md');
  const refused = [];
  const unresolved = (err, dest) => {
    const where = err.path ? relative(cwd, err.path) || '.' : dest;
    if (err.code === 'ELOOP') return { dest, reason: `${where} is a loop of links that never lands on a file or folder`, kind: 'link' };
    return { dest, reason: `${where} cannot be resolved (${err.code || err.message})`, kind: 'unchecked' };
  };
  let root = null;
  try {
    root = landing(cwd);
  } catch (err) {
    refused.push({ ...unresolved(err, '.'), reason: `the project folder ${cwd} cannot be resolved (${err.code || err.message})` });
  }
  for (const dest of root === null ? [] : writes) {
    try {
      const reason = landsOutside(root, cwd, dest);
      const hardLink = reason ? null : hardLinked(root, cwd, dest);
      if (reason) refused.push({ dest, reason, kind: 'link', outside: true });
      else if (hardLink) refused.push({ dest, reason: hardLink, kind: 'hard link' });
    } catch (err) {
      // A path whose links never land anywhere is refused like one that lands outside.
      refused.push(unresolved(err, dest));
    }
  }
  if (refused.length > 0) {
    for (const { dest, reason } of refused) log(pc.red('x'), `${dest} — ${reason}`);
    log(pc.red('x'), 'Nothing was installed, and --force does not change that.');
    const kinds = new Set(refused.map(({ kind }) => kind));
    if (kinds.has('link')) log(pc.dim('→'), 'Every file Vibeflow writes must land inside the project: replace each link above with a folder or file of its own, or point it inside the project.');
    if (kinds.has('hard link')) log(pc.dim('→'), 'A file with more than one name changes under every one of them when it is written, inside the project or not: give each hard link above a file of its own (copy it, then move the copy over it), and run the installer again.');
    if (kinds.has('unchecked')) log(pc.dim('→'), 'Where each path above leads could not be checked, so nothing is written through it: fix what its line names, and run the installer again.');
    if (refused.some(({ dest, outside }) => dest === 'AGENTS.md' && outside)) {
      const shared = dirname(landing(join(cwd, 'AGENTS.md')));
      log(pc.dim('→'), `AGENTS.md is shared through a link: to install with it, run the installer from ${shared}, the folder where the real file is.`);
    }
    console.log('');
    process.exit(1);
  }

  // Download and install files
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const destPath = join(cwd, file.dest);

    if (existsSync(destPath) && !force) {
      log(pc.dim('-'), `${pc.dim(file.dest)} ${pc.dim('(exists, skipped)')}`);
      skipped++;
      continue;
    }

    try {
      const content = await downloadFile(file.baseUrl, file.src);
      writeInside(root, cwd, file.dest, content);
      log(pc.green('+'), file.dest);
      created++;
    } catch (err) {
      log(pc.red('x'), `${file.dest} — ${err.message}`);
      process.exit(1);
    }
  }

  console.log('');

  // Handle AGENTS.md
  const agentsPath = join(cwd, 'AGENTS.md');
  try {
    const agentsSource = await downloadFile(edition.baseUrl, edition.agentsSrc);
    const appendContent = extractAgentsAppendContent(agentsSource);
    const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf-8') : null;
    const result = upsertDelimitedBlock(existing, appendContent, '## Vibeflow Methodology');
    writeInside(root, cwd, 'AGENTS.md', result.content);

    if (result.action === 'created') {
      log(pc.green('+'), `AGENTS.md ${pc.dim('(created)')}`);
    } else if (result.action === 'replaced') {
      log(pc.green('+'), `AGENTS.md ${pc.dim('(vibeflow block updated)')}`);
    } else if (result.action === 'appended') {
      log(pc.green('+'), `AGENTS.md ${pc.dim('(appended vibeflow block)')}`);
    } else if (result.warning) {
      log(pc.yellow('!'), `AGENTS.md ${pc.dim('(new delimited block appended — please remove the old vibeflow block manually)')}`);
    }
  } catch (err) {
    log(pc.red('x'), `AGENTS.md — ${err.message}`);
  }

  // Handle copilot-instructions.md (Copilot only)
  if (edition.handleCopilotInstructions) {
    const copilotInstrPath = join(cwd, '.github/copilot-instructions.md');
    try {
      if (existsSync(copilotInstrPath)) {
        const existing = readFileSync(copilotInstrPath, 'utf-8');
        const snippetSource = await downloadFile(edition.baseUrl, 'copilot-instructions.md');
        const snippet = extractCopilotInstructionsSnippet(snippetSource);
        if (snippet) {
          const result = upsertDelimitedBlock(existing, snippet, '## Vibeflow');
          writeInside(root, cwd, '.github/copilot-instructions.md', result.content);

          if (result.action === 'replaced') {
            log(pc.green('+'), `.github/copilot-instructions.md ${pc.dim('(vibeflow snippet updated)')}`);
          } else if (result.action === 'appended') {
            log(pc.green('+'), `.github/copilot-instructions.md ${pc.dim('(appended vibeflow snippet)')}`);
          } else if (result.warning) {
            log(pc.yellow('!'), `.github/copilot-instructions.md ${pc.dim('(new delimited snippet appended — please remove the old vibeflow block manually)')}`);
          }
        }
      } else {
        log(pc.dim('-'), `${pc.dim('.github/copilot-instructions.md')} ${pc.dim('(not found, skipping — instructions auto-loaded)')}`);
      }
    } catch (err) {
      log(pc.red('x'), `.github/copilot-instructions.md — ${err.message}`);
    }
  }

  // Append Vibeflow paths to .gitignore (default: do not track; user can remove to track)
  const gitignorePath = join(cwd, '.gitignore');
  try {
    const block = GITIGNORE_BLOCKS[editionKey];
    if (block) {
      let content = '';
      if (existsSync(gitignorePath)) {
        content = readFileSync(gitignorePath, 'utf-8');
      }
      const result = upsertGitignoreBlock(content, block, editionKey);
      if (result.action === 'present') {
        log(pc.dim('-'), `${pc.dim('.gitignore')} ${pc.dim('(Vibeflow block already present)')}`);
      } else {
        writeInside(root, cwd, '.gitignore', result.content);
        if (result.action === 'appended') {
          log(pc.green('+'), `.gitignore ${pc.dim('(Vibeflow paths added — remove that block to track in git)')}`);
        } else {
          log(pc.green('+'), `.gitignore ${pc.dim(`(Vibeflow block gained ${result.added.join(', ')})`)}`);
        }
      }
    }
  } catch (err) {
    log(pc.red('x'), `.gitignore — ${err.message}`);
  }

  // Summary
  console.log('');
  if (created > 0) {
    log(pc.green('✓'), pc.bold(`Done! ${created} files installed.`));
  } else if (skipped > 0) {
    log(pc.yellow('!'), pc.bold('All files already exist. Nothing to do.'));
  }
  console.log('');
  log(pc.cyan('→'), edition.doneMessage);
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error(`  ${pc.red('Error:')} ${err.message}`);
  console.error('');
  process.exit(1);
});
