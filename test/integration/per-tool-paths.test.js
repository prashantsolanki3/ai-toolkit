import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function silentLogger() {
  return {
    info() {},
    success() {},
    warn() {},
    error() {},
    dryRun() {},
    verbose() {},
  };
}

// These tests pin each tool's expected destination layout. If a tool's
// documented paths change, this is the file to update — and the change is
// reviewable as a single diff. Pair every change here with a manual run
// from docs/verification-matrix.md.

test('claude-code: skills are dirs, agents are flat files, commands flat .md, hooks .sh', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      skills: ['code-review-checklist'],
      agents: ['senior-architect'],
      commands: ['summarize-diff'],
      hooks: ['pre-commit-lint'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(
      fs.existsSync(path.join(target, 'skills', 'code-review-checklist', 'SKILL.md')),
      'skill should land as a directory containing SKILL.md',
    );
    assert.ok(
      fs.existsSync(path.join(target, 'agents', 'senior-architect.md')),
      'agent should land as a flat file at agents/<name>.md',
    );
    assert.ok(!fs.existsSync(path.join(target, 'agents', 'senior-architect', 'agent.md')));
    assert.ok(fs.existsSync(path.join(target, 'commands', 'summarize-diff.md')));
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'pre-commit-lint.sh')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor: skills land as .cursor/rules/<name>.mdc, no skills/ subdir', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'rules', 'code-review-checklist.mdc')));
    assert.ok(!fs.existsSync(path.join(target, 'skills')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor: explicit rules land as .cursor/rules/<name>.mdc', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      rules: ['no-bare-todos'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'rules', 'no-bare-todos.mdc')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('claude-code: rules land as .claude/rules/<name>.md', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      rules: ['no-bare-todos'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'rules', 'no-bare-todos.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('antigravity: skills directory lands at target root (no skills/ subdir)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'antigravity',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'code-review-checklist', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(target, 'skills', 'code-review-checklist')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('gemini-cli: skills under skills/<name>/SKILL.md (workspace .gemini)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'gemini-cli',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'skills', 'code-review-checklist', 'SKILL.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('vscode-copilot: skills→instructions, commands→prompts, agents→chatmodes', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'vscode-copilot',
      skills: ['code-review-checklist'],
      commands: ['summarize-diff'],
      agents: ['senior-architect'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(
      fs.existsSync(path.join(target, 'instructions', 'code-review-checklist.instructions.md')),
    );
    assert.ok(fs.existsSync(path.join(target, 'prompts', 'summarize-diff.prompt.md')));
    assert.ok(fs.existsSync(path.join(target, 'chatmodes', 'senior-architect.chatmode.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('copilot-cli: skills→.github/instructions, commands→.github/prompts', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'copilot-cli',
      skills: ['code-review-checklist'],
      commands: ['summarize-diff'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(
      fs.existsSync(path.join(target, 'instructions', 'code-review-checklist.instructions.md')),
    );
    assert.ok(fs.existsSync(path.join(target, 'prompts', 'summarize-diff.prompt.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('kiro: skills→.kiro/steering/<name>.md, hooks→.kiro/hooks/<name>.sh', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'kiro',
      skills: ['code-review-checklist'],
      hooks: ['pre-commit-lint'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'steering', 'code-review-checklist.md')));
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'pre-commit-lint.sh')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('kiro-cli: skills→steering/<name>.md', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'kiro-cli',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'steering', 'code-review-checklist.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('vscode-copilot: skill body is the SKILL.md content, not the directory', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'vscode-copilot',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const file = path.join(target, 'instructions', 'code-review-checklist.instructions.md');
    const body = fs.readFileSync(file, 'utf8');
    const sourceBody = fs.readFileSync(
      path.join(REPO_ROOT, 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    assert.equal(body, sourceBody, 'instruction file content must match the source SKILL.md');
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor: skill body is the SKILL.md content extracted into a .mdc file', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const file = path.join(target, 'rules', 'code-review-checklist.mdc');
    const body = fs.readFileSync(file, 'utf8');
    const sourceBody = fs.readFileSync(
      path.join(REPO_ROOT, 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    assert.equal(body, sourceBody);
  } finally {
    cleanupTmpProject(target);
  }
});
