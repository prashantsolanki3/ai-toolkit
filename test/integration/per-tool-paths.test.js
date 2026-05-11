import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

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
    const dir = toolDir(target, 'claude-code');
    assert.ok(
      fs.existsSync(path.join(dir, 'skills', 'code-review-checklist', 'SKILL.md')),
      'skill should land as a directory containing SKILL.md',
    );
    assert.ok(
      fs.existsSync(path.join(dir, 'agents', 'senior-architect.md')),
      'agent should land as a flat file at agents/<name>.md',
    );
    assert.ok(!fs.existsSync(path.join(dir, 'agents', 'senior-architect', 'agent.md')));
    assert.ok(fs.existsSync(path.join(dir, 'commands', 'summarize-diff.md')));
    assert.ok(fs.existsSync(path.join(dir, 'hooks', 'pre-commit-lint.sh')));
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
    const dir = toolDir(target, 'cursor');
    assert.ok(fs.existsSync(path.join(dir, 'rules', 'code-review-checklist.mdc')));
    assert.ok(!fs.existsSync(path.join(dir, 'skills')));
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
    assert.ok(fs.existsSync(path.join(toolDir(target, 'cursor'), 'rules', 'no-bare-todos.mdc')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor: agents land as .cursor/agents/<name>.md per Cursor subagents docs', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'cursor',
      agents: ['senior-architect'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(
      fs.existsSync(path.join(toolDir(target, 'cursor'), 'agents', 'senior-architect.md')),
    );
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
    assert.ok(fs.existsSync(path.join(toolDir(target, 'claude-code'), 'rules', 'no-bare-todos.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('antigravity: skills land directly under .agent/skills/ (assetPaths.skills = "")', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'antigravity',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const dir = toolDir(target, 'antigravity');
    assert.ok(fs.existsSync(path.join(dir, 'code-review-checklist', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'skills', 'code-review-checklist')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('gemini-cli: skills under .gemini/skills/<name>/SKILL.md', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'gemini-cli',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(
      fs.existsSync(
        path.join(toolDir(target, 'gemini-cli'), 'skills', 'code-review-checklist', 'SKILL.md'),
      ),
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('vscode-copilot: skills→instructions, commands→prompts, agents→.github/agents/ (under .github/)', async () => {
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
    const dir = toolDir(target, 'vscode-copilot');
    assert.ok(fs.existsSync(path.join(dir, 'instructions', 'code-review-checklist.instructions.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'summarize-diff.prompt.md')));
    assert.ok(
      fs.existsSync(path.join(dir, 'agents', 'senior-architect.md')),
      'agents should land at .github/agents/<name>.md per GitHub custom-agents docs',
    );
    assert.equal(
      fs.existsSync(path.join(dir, 'chatmodes')),
      false,
      'chatmodes path is no longer used — agents land at .github/agents/',
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('copilot-cli: skills→.github/instructions, commands→.github/prompts, agents→.github/agents/', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'copilot-cli',
      skills: ['code-review-checklist'],
      commands: ['summarize-diff'],
      agents: ['senior-architect'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const dir = toolDir(target, 'copilot-cli');
    assert.ok(fs.existsSync(path.join(dir, 'instructions', 'code-review-checklist.instructions.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'summarize-diff.prompt.md')));
    assert.ok(fs.existsSync(path.join(dir, 'agents', 'senior-architect.md')));
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
    const dir = toolDir(target, 'kiro');
    assert.ok(fs.existsSync(path.join(dir, 'steering', 'code-review-checklist.md')));
    assert.ok(fs.existsSync(path.join(dir, 'hooks', 'pre-commit-lint.sh')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('kiro-cli: skills→.kiro/steering/<name>.md', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'kiro-cli',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(toolDir(target, 'kiro-cli'), 'steering', 'code-review-checklist.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('vscode-copilot: body after frontmatter matches the source SKILL.md body', async () => {
  const target = createTmpProject();
  try {
    const { parseFrontmatter } = await import('../../src/lib/frontmatter.js');
    await install({
      tool: 'vscode-copilot',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const written = fs.readFileSync(
      path.join(toolDir(target, 'vscode-copilot'), 'instructions', 'code-review-checklist.instructions.md'),
      'utf8',
    );
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    const writtenBody = parseFrontmatter(written).body;
    const sourceBody = parseFrontmatter(source).body;
    assert.equal(writtenBody.trim(), sourceBody.trim());
  } finally {
    cleanupTmpProject(target);
  }
});

test('cursor: body after frontmatter matches the source SKILL.md body', async () => {
  const target = createTmpProject();
  try {
    const { parseFrontmatter } = await import('../../src/lib/frontmatter.js');
    await install({
      tool: 'cursor',
      skills: ['code-review-checklist'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const written = fs.readFileSync(
      path.join(toolDir(target, 'cursor'), 'rules', 'code-review-checklist.mdc'),
      'utf8',
    );
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'skills', 'code-review-checklist', 'SKILL.md'),
      'utf8',
    );
    const writtenBody = parseFrontmatter(written).body;
    const sourceBody = parseFrontmatter(source).body;
    assert.equal(writtenBody.trim(), sourceBody.trim());
  } finally {
    cleanupTmpProject(target);
  }
});
