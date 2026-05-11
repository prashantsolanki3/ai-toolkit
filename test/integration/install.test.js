import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

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

    assert.ok(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(target, 'skills', 'code-review-checklist', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(target, 'agents', 'senior-architect.md')));
    assert.ok(fs.existsSync(path.join(target, 'commands', 'summarize-diff.md')));
    assert.ok(fs.existsSync(path.join(target, LOCKFILE_NAME)));
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

    // Cursor maps skills source -> .cursor/rules/<name>.mdc (file format with
    // SKILL.md extracted from the source directory). It does not support
    // agents/commands/hooks.
    assert.ok(fs.existsSync(path.join(target, 'rules', 'api-endpoint-design.mdc')));
    assert.equal(fs.existsSync(path.join(target, 'agents')), false);
    assert.equal(fs.existsSync(path.join(target, 'commands')), false);
    assert.ok(lines.some(([level, m]) => level === 'warn' && /agents|commands/.test(m)));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: antigravity places skills at target root (assetPaths.skills="")', async () => {
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
    assert.ok(fs.existsSync(path.join(target, 'api-endpoint-design', 'SKILL.md')));
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
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
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
    assert.equal(fs.existsSync(path.join(target, 'skills')), false);
    assert.equal(fs.existsSync(path.join(target, LOCKFILE_NAME)), false);
    assert.ok(lines.some(([level]) => level === 'dryRun'));
  } finally {
    cleanupTmpProject(target);
  }
});

test('install: --target override is respected', async () => {
  const target = createTmpProject();
  const customTarget = path.join(target, 'custom-dir');
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target: customTarget,
      sourceRoot: REPO_ROOT,
      logger,
    });
    assert.ok(fs.existsSync(path.join(customTarget, 'skills', 'api-endpoint-design', 'SKILL.md')));
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
    assert.ok(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design', 'SKILL.md')));
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
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
    assert.ok(fs.existsSync(path.join(target, 'skills', 'dependency-upgrade', 'SKILL.md')));
    assert.equal(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design')), false);
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
