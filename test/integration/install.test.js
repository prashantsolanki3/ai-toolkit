import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
  const lines = [];
  return {
    logger: {
      info: (m) => lines.push(['info', m]),
      success: (m) => lines.push(['success', m]),
      warn: (m) => lines.push(['warn', m]),
      error: (m) => lines.push(['error', m]),
      dryRun: (m) => lines.push(['dryRun', m]),
      verbose: (m) => lines.push(['verbose', m]),
    },
    lines,
  };
}

test('install: claude-code with backend-essentials preset writes expected files', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const installDir = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(installDir, 'skills', 'api-endpoint-design', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(installDir, 'skills', 'code-review-checklist', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(installDir, 'agents', 'senior-architect.md')));
    assert.ok(fs.existsSync(path.join(installDir, 'commands', 'summarize-diff.md')));
    assert.ok(fs.existsSync(path.join(installDir, LOCKFILE_NAME)));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: cursor uses .cursor-style paths and skips unsupported types', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({
      tool: 'cursor',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });

    const installDir = toolDir(target, 'cursor');
    // Cursor maps skills source -> .cursor/rules/<name>.mdc and agents ->
    // .cursor/agents/<name>.md. It does not support commands or hooks.
    assert.ok(fs.existsSync(path.join(installDir, 'rules', 'api-endpoint-design.mdc')));
    assert.ok(fs.existsSync(path.join(installDir, 'agents', 'senior-architect.md')));
    assert.equal(fs.existsSync(path.join(installDir, 'commands')), false);
    assert.ok(lines.some(([level, m]) => level === 'warn' && /commands/.test(m)));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: antigravity places skills at the resolved subdir (.agent/skills/)', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'antigravity',
      skills: ['api-endpoint-design'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const installDir = toolDir(target, 'antigravity');
    assert.ok(fs.existsSync(path.join(installDir, 'api-endpoint-design', 'SKILL.md')));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: lockfile carries tool name, scope, source, and asset entries', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const installDir = toolDir(target, 'claude-code');
    const lock = JSON.parse(fs.readFileSync(path.join(installDir, LOCKFILE_NAME), 'utf8'));
    assert.equal(lock.tool, 'claude-code');
    assert.equal(lock.preset, 'backend-essentials');
    assert.ok(lock.assets.skills['api-endpoint-design']);
    assert.match(lock.assets.skills['api-endpoint-design'].sha, /^[a-f0-9]{64}$/);
    assert.ok(lock.assets.agents['senior-architect']);
    assert.ok(lock.assets.commands['summarize-diff']);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: dryRun writes no files but logs plan', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger,
      dryRun: true,
    });
    const installDir = toolDir(target, 'claude-code');
    assert.equal(fs.existsSync(path.join(installDir, 'skills')), false);
    assert.equal(fs.existsSync(path.join(installDir, LOCKFILE_NAME)), false);
    assert.ok(lines.some(([level]) => level === 'dryRun'));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: --target project root resolves to the tool subdir', async () => {
  const target = createTmpProject();
  const projectRoot = path.join(target, 'a-project');
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target: projectRoot,
      sourceRoot: REPO_ROOT,
      logger,
    });
    assert.ok(
      fs.existsSync(path.join(projectRoot, '.claude', 'skills', 'api-endpoint-design', 'SKILL.md')),
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: re-running on the same target is idempotent (no errors, assets present)', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const installDir = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(installDir, 'skills', 'api-endpoint-design', 'SKILL.md')));
    const lock = JSON.parse(fs.readFileSync(path.join(installDir, LOCKFILE_NAME), 'utf8'));
    const apiCount = Object.keys(lock.assets.skills).filter((s) => s === 'api-endpoint-design').length;
    assert.equal(apiCount, 1);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: explicit skills flag without a preset works', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      skills: ['dependency-upgrade'],
      target,
      sourceRoot: REPO_ROOT,
      logger,
    });
    const installDir = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(installDir, 'skills', 'dependency-upgrade', 'SKILL.md')));
    assert.equal(fs.existsSync(path.join(installDir, 'skills', 'api-endpoint-design')), false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: unknown tool throws with helpful error', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await assert.rejects(
      () =>
        install({
          tool: 'no-such-tool',
          preset: 'backend-essentials',
          target,
          sourceRoot: REPO_ROOT,
          logger,
        }),
      /no-such-tool/,
    );
  } finally {
    cleanupTmpProject(target);
  }
});
