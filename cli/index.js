#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

// --- Config ---

const REPO = 'pe-menezes/vibeflow';
const BRANCH = 'main';
const PLUGIN_MARKETPLACE_REPO = 'pe-menezes/vibeflow';

// Every download starts from this base. The override exists for tests and mirrors.
const BASE_URL_ENV = 'VIBEFLOW_BASE_URL';
const DEFAULT_BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const BASE_URL = (process.env[BASE_URL_ENV] || DEFAULT_BASE_URL).replace(/\/+$/, '');

// The loop kit has one source, inside the plugin's implement skill; its manifest lists the
// files, so a kit file added later needs no change here.
const KIT_BASE_URL = `${BASE_URL}/plugins/vibeflow/skills/implement/loop`;
const KIT_MANIFEST = 'manifest.json';
// A manifest entry is a plain relative path: no absolute path, no "..", no hidden segment,
// so nothing it names can land outside the edition's kit folder.
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

function extractAgentsAppendContent(fullContent) {
  const separatorIndex = fullContent.indexOf('\n---\n');
  if (separatorIndex === -1) return fullContent;
  return fullContent.slice(separatorIndex + '\n---\n'.length);
}

function extractCopilotInstructionsSnippet(fullContent) {
  const match = fullContent.match(/```markdown\n([\s\S]*?)```/);
  if (!match) return null;
  return match[1].trim();
}

function upsertDelimitedBlock(existing, newBlock, legacyMarker) {
  const delimited = `${VIBEFLOW_START}\n${newBlock.trim()}\n${VIBEFLOW_END}`;

  if (!existing) {
    return { content: delimited + '\n', action: 'created' };
  }

  const startIdx = existing.indexOf(VIBEFLOW_START);
  const endIdx = existing.indexOf(VIBEFLOW_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + VIBEFLOW_END.length);
    const content = before + delimited + after;
    return { content, action: 'replaced' };
  }

  if (legacyMarker && existing.includes(legacyMarker)) {
    const content = existing.trimEnd() + '\n\n' + delimited + '\n';
    return { content, action: 'legacy-append', warning: true };
  }

  const content = existing.trimEnd() + '\n\n' + delimited + '\n';
  return { content, action: 'appended' };
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
  const files = [...edition.files.map((file) => ({ ...file, baseUrl: edition.baseUrl })), ...kitFiles];

  // Download and install files
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const destPath = join(cwd, file.dest);
    const destDir = join(destPath, '..');

    if (existsSync(destPath) && !force) {
      log(pc.dim('-'), `${pc.dim(file.dest)} ${pc.dim('(exists, skipped)')}`);
      skipped++;
      continue;
    }

    try {
      const content = await downloadFile(file.baseUrl, file.src);
      ensureDir(destDir);
      writeFileSync(destPath, content, 'utf-8');
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
    writeFileSync(agentsPath, result.content, 'utf-8');

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
          writeFileSync(copilotInstrPath, result.content, 'utf-8');

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
        writeFileSync(gitignorePath, result.content, 'utf-8');
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
