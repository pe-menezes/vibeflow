#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

// --- Config ---

const REPO = 'pe-menezes/vibeflow';
const BRANCH = 'main';

const COPILOT_FILES = [
  { src: 'github/prompts/vibeflow-analyze.prompt.md', dest: '.github/prompts/vibeflow-analyze.prompt.md' },
  { src: 'github/prompts/vibeflow-analyze-satellite.prompt.md', dest: '.github/prompts/vibeflow-analyze-satellite.prompt.md' },
  { src: 'github/prompts/vibeflow-audit.prompt.md', dest: '.github/prompts/vibeflow-audit.prompt.md' },
  { src: 'github/prompts/vibeflow-discover.prompt.md', dest: '.github/prompts/vibeflow-discover.prompt.md' },
  { src: 'github/prompts/vibeflow-gen-spec.prompt.md', dest: '.github/prompts/vibeflow-gen-spec.prompt.md' },
  { src: 'github/prompts/vibeflow-prompt-pack.prompt.md', dest: '.github/prompts/vibeflow-prompt-pack.prompt.md' },
  { src: 'github/prompts/vibeflow-quick.prompt.md', dest: '.github/prompts/vibeflow-quick.prompt.md' },
  { src: 'github/prompts/vibeflow-stats.prompt.md', dest: '.github/prompts/vibeflow-stats.prompt.md' },
  { src: 'github/prompts/vibeflow-teach.prompt.md', dest: '.github/prompts/vibeflow-teach.prompt.md' },
  { src: 'github/agents/vibeflow-architect.agent.md', dest: '.github/agents/vibeflow-architect.agent.md' },
  { src: 'github/skills/vibeflow-spec-driven-dev/SKILL.md', dest: '.github/skills/vibeflow-spec-driven-dev/SKILL.md' },
  { src: 'github/instructions/vibeflow/vibeflow.instructions.md', dest: '.github/instructions/vibeflow/vibeflow.instructions.md' },
];

const CURSOR_FILES = [
  { src: 'rules/vibeflow.mdc', dest: '.cursor/rules/vibeflow.mdc' },
  { src: 'rules/vibeflow-architect.mdc', dest: '.cursor/rules/vibeflow-architect.mdc' },
  { src: 'skills/vibeflow-analyze/SKILL.md', dest: '.cursor/skills/vibeflow-analyze/SKILL.md' },
  { src: 'skills/vibeflow-analyze-satellite/SKILL.md', dest: '.cursor/skills/vibeflow-analyze-satellite/SKILL.md' },
  { src: 'skills/vibeflow-audit/SKILL.md', dest: '.cursor/skills/vibeflow-audit/SKILL.md' },
  { src: 'skills/vibeflow-discover/SKILL.md', dest: '.cursor/skills/vibeflow-discover/SKILL.md' },
  { src: 'skills/vibeflow-gen-spec/SKILL.md', dest: '.cursor/skills/vibeflow-gen-spec/SKILL.md' },
  { src: 'skills/vibeflow-prompt-pack/SKILL.md', dest: '.cursor/skills/vibeflow-prompt-pack/SKILL.md' },
  { src: 'skills/vibeflow-quick/SKILL.md', dest: '.cursor/skills/vibeflow-quick/SKILL.md' },
  { src: 'skills/vibeflow-teach/SKILL.md', dest: '.cursor/skills/vibeflow-teach/SKILL.md' },
  { src: 'skills/vibeflow-stats/SKILL.md', dest: '.cursor/skills/vibeflow-stats/SKILL.md' },
  { src: 'skills/vibeflow-spec-driven-dev/SKILL.md', dest: '.cursor/skills/vibeflow-spec-driven-dev/SKILL.md' },
];

const EDITIONS = {
  copilot: {
    name: 'Copilot',
    baseUrl: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/copilot`,
    files: COPILOT_FILES,
    marker: '.github/prompts/vibeflow-analyze.prompt.md',
    markerLegacy: '.github/prompts/vibeflow/vibeflow-analyze.prompt.md',
    agentsSrc: 'AGENTS.md',
    doneMessage: `Run ${pc.bold('/vibeflow-analyze')} in Copilot Chat to get started.`,
    handleCopilotInstructions: true,
  },
  cursor: {
    name: 'Cursor',
    baseUrl: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/cursor`,
    files: CURSOR_FILES,
    marker: '.cursor/rules/vibeflow.mdc',
    markerLegacy: null,
    agentsSrc: 'AGENTS.md',
    doneMessage: `Type ${pc.bold('/vibeflow-analyze')} in Cursor Agent chat to get started.`,
    handleCopilotInstructions: false,
  },
};

const DUPLICATE_MARKER = 'vibeflow-architect';

const GITIGNORE_MARKER = '# Vibeflow — installed + generated (remove to track in git)';

const GITIGNORE_BLOCKS = {
  copilot: `
# Vibeflow — installed + generated (remove to track in git)
.vibeflow/
.github/prompts/vibeflow-*.prompt.md
.github/agents/vibeflow-architect.agent.md
.github/skills/vibeflow-spec-driven-dev/
.github/instructions/vibeflow/
`,
  cursor: `
# Vibeflow — installed + generated (remove to track in git)
.vibeflow/
.cursor/rules/vibeflow.mdc
.cursor/rules/vibeflow-architect.mdc
.cursor/skills/vibeflow-*/
`,
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
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
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

function detectEdition() {
  const args = process.argv.slice(2);
  if (args.includes('--cursor')) return 'cursor';
  if (args.includes('--copilot')) return 'copilot';
  return null;
}

function printUsage() {
  console.log('');
  console.log(`  ${pc.bold(pc.cyan('Vibeflow'))} ${pc.dim('— Setup')}`);
  console.log('');
  console.log(`  ${pc.bold('Usage:')} npx setup-vibeflow@latest ${pc.cyan('<edition>')}`);
  console.log('');
  console.log(`  ${pc.bold('Editions:')}`);
  console.log(`    ${pc.cyan('--copilot')}   Install for GitHub Copilot ${pc.dim('(.github/prompts, agents, instructions)')}`);
  console.log(`    ${pc.cyan('--cursor')}    Install for Cursor ${pc.dim('(.cursor/rules, skills)')}`);
  console.log('');
  console.log(`  ${pc.bold('Options:')}`);
  console.log(`    ${pc.cyan('--force')}     Overwrite existing files`);
  console.log('');
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --copilot`);
  console.log(`    ${pc.dim('$')} npx setup-vibeflow@latest --cursor`);
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

  // Download and install files
  let created = 0;
  let skipped = 0;

  for (const file of edition.files) {
    const destPath = join(cwd, file.dest);
    const destDir = join(destPath, '..');

    if (existsSync(destPath) && !force) {
      log(pc.dim('-'), `${pc.dim(file.dest)} ${pc.dim('(exists, skipped)')}`);
      skipped++;
      continue;
    }

    try {
      const content = await downloadFile(edition.baseUrl, file.src);
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

    if (existsSync(agentsPath)) {
      const existing = readFileSync(agentsPath, 'utf-8');
      if (existing.includes(DUPLICATE_MARKER) && !force) {
        log(pc.dim('-'), `${pc.dim('AGENTS.md')} ${pc.dim('(vibeflow block exists, skipped)')}`);
      } else {
        const updated = existing.trimEnd() + '\n\n' + appendContent;
        writeFileSync(agentsPath, updated, 'utf-8');
        log(pc.green('+'), `AGENTS.md ${pc.dim('(appended vibeflow block)')}`);
      }
    } else {
      writeFileSync(agentsPath, appendContent, 'utf-8');
      log(pc.green('+'), `AGENTS.md ${pc.dim('(created)')}`);
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
        if (existing.includes('vibeflow') && !force) {
          log(pc.dim('-'), `${pc.dim('.github/copilot-instructions.md')} ${pc.dim('(vibeflow snippet exists, skipped)')}`);
        } else {
          const snippetSource = await downloadFile(edition.baseUrl, 'copilot-instructions.md');
          const snippet = extractCopilotInstructionsSnippet(snippetSource);
          if (snippet) {
            const updated = existing.trimEnd() + '\n\n' + snippet + '\n';
            writeFileSync(copilotInstrPath, updated, 'utf-8');
            log(pc.green('+'), `.github/copilot-instructions.md ${pc.dim('(appended vibeflow snippet)')}`);
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
      if (!content.includes(GITIGNORE_MARKER)) {
        const updated = (content.trimEnd() ? content.trimEnd() + '\n' : '') + block.trim() + '\n';
        writeFileSync(gitignorePath, updated, 'utf-8');
        log(pc.green('+'), `.gitignore ${pc.dim('(Vibeflow paths added — remove that block to track in git)')}`);
      } else {
        log(pc.dim('-'), `${pc.dim('.gitignore')} ${pc.dim('(Vibeflow block already present)')}`);
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
