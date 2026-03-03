#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

// --- Config ---

const REPO = 'pe-menezes/vibeflow';
const BRANCH = 'main';
const BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/copilot`;

const FILES = [
  { src: 'github/prompts/vibeflow-analyze.prompt.md', dest: '.github/prompts/vibeflow-analyze.prompt.md' },
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

const DUPLICATE_MARKER = 'vibeflow-architect';

// --- Helpers ---

function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

async function downloadFile(srcPath) {
  const url = `${BASE_URL}/${srcPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function extractAgentsAppendContent(fullContent) {
  // Remove the instruction note at the top (everything before and including the first ---)
  const separatorIndex = fullContent.indexOf('\n---\n');
  if (separatorIndex === -1) return fullContent;
  return fullContent.slice(separatorIndex + '\n---\n'.length);
}

function extractCopilotInstructionsSnippet(fullContent) {
  // Extract the markdown block between ```markdown and ```
  const match = fullContent.match(/```markdown\n([\s\S]*?)```/);
  if (!match) return null;
  return match[1].trim();
}

// --- Main ---

async function main() {
  const force = process.argv.includes('--force');
  const cwd = process.cwd();

  console.log('');
  console.log(`  ${pc.bold(pc.cyan('Vibeflow'))} ${pc.dim('— Copilot Edition')}`);
  console.log('');

  // Check Node.js version
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  if (nodeVersion < 18) {
    log(pc.red('x'), `Node.js 18+ required (you have ${process.versions.node})`);
    process.exit(1);
  }

  // Check if already installed (flat structure or legacy subdirectory structure)
  const markerFlat = join(cwd, '.github/prompts/vibeflow-analyze.prompt.md');
  const markerLegacy = join(cwd, '.github/prompts/vibeflow/vibeflow-analyze.prompt.md');
  if ((existsSync(markerFlat) || existsSync(markerLegacy)) && !force) {
    log(pc.yellow('!'), 'Vibeflow already installed. Use --force to reinstall.');
    console.log('');
    process.exit(0);
  }

  // Download and install files
  let created = 0;
  let skipped = 0;

  for (const file of FILES) {
    const destPath = join(cwd, file.dest);
    const destDir = join(destPath, '..');

    if (existsSync(destPath) && !force) {
      log(pc.dim('-'), `${pc.dim(file.dest)} ${pc.dim('(exists, skipped)')}`);
      skipped++;
      continue;
    }

    try {
      const content = await downloadFile(file.src);
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
    const agentsSource = await downloadFile('AGENTS.md');
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

  // Handle copilot-instructions.md
  const copilotInstrPath = join(cwd, '.github/copilot-instructions.md');
  try {
    if (existsSync(copilotInstrPath)) {
      const existing = readFileSync(copilotInstrPath, 'utf-8');
      if (existing.includes('vibeflow') && !force) {
        log(pc.dim('-'), `${pc.dim('.github/copilot-instructions.md')} ${pc.dim('(vibeflow snippet exists, skipped)')}`);
      } else {
        const snippetSource = await downloadFile('copilot-instructions.md');
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

  // Summary
  console.log('');
  if (created > 0) {
    log(pc.green('✓'), pc.bold(`Done! ${created} files installed.`));
  } else if (skipped > 0) {
    log(pc.yellow('!'), pc.bold('All files already exist. Nothing to do.'));
  }
  console.log('');
  log(pc.cyan('→'), `Run ${pc.bold('/vibeflow-analyze')} in Copilot Chat to get started.`);
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error(`  ${pc.red('Error:')} ${err.message}`);
  console.error('');
  process.exit(1);
});
