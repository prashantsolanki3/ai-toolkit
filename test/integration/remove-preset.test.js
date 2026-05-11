import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

test('remove --preset tears down every tracked asset in that preset', async () => {
  const target = createTmpProject();
  try {
    // Install BOTH presets so the lockfile holds assets from each.
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger: silentLogger() });
    await install({ tool: 'claude-code', preset: 'maintenance-mode', target, sourceRoot: REPO_ROOT, logger: silentLogger() });

    const dir = toolDir(target, 'claude-code');
    const lockBefore = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    assert.ok(lockBefore.tools['claude-code'].assets.skills['api-endpoint-design']);   // backend-essentials
    assert.ok(lockBefore.tools['claude-code'].assets.skills['dependency-upgrade']);     // maintenance-mode

    await remove({
      target,
      tool: 'claude-code',
      sourceRoot: REPO_ROOT,
      preset: 'backend-essentials',
      logger: silentLogger(),
    });

    const lockAfter = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    const afterAssets = lockAfter.tools['claude-code'].assets;

    // backend-essentials assets: gone.
    assert.equal(afterAssets.skills['api-endpoint-design'], undefined);
    assert.equal(afterAssets.skills['code-review-checklist'], undefined);
    assert.equal(afterAssets.agents['senior-architect'], undefined);
    assert.equal(afterAssets.commands['summarize-diff'], undefined);

    // maintenance-mode assets: still there.
    assert.ok(afterAssets.skills['dependency-upgrade']);
    assert.ok(afterAssets.agents['refactoring-specialist']);

    // Files on disk also removed.
    assert.equal(fs.existsSync(path.join(dir, 'skills', 'api-endpoint-design')), false);
    assert.equal(fs.existsSync(path.join(dir, 'agents', 'senior-architect.md')), false);
    assert.ok(fs.existsSync(path.join(dir, 'skills', 'dependency-upgrade'))); // maintenance-mode skill kept
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove --preset + explicit lists union both selections', async () => {
  const target = createTmpProject();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger: silentLogger() });
    await install({ tool: 'claude-code', preset: 'maintenance-mode', target, sourceRoot: REPO_ROOT, logger: silentLogger() });

    await remove({
      target,
      tool: 'claude-code',
      sourceRoot: REPO_ROOT,
      preset: 'backend-essentials',
      skills: ['dependency-upgrade'], // belongs to maintenance-mode
      logger: silentLogger(),
    });

    const lock = JSON.parse(
      fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'),
    );
    const a = lock.tools['claude-code'].assets;
    assert.equal(a.skills['api-endpoint-design'], undefined); // from preset
    assert.equal(a.skills['dependency-upgrade'], undefined);  // from --skills
    assert.ok(a.agents['refactoring-specialist']);            // untouched
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove --preset is a no-op when none of its assets are tracked', async () => {
  const target = createTmpProject();
  const lines = [];
  const logger = {
    info: () => {}, success: () => {},
    warn: (m) => lines.push(['warn', m]),
    error: () => {}, dryRun: () => {}, verbose: () => {},
  };
  try {
    // Install ONLY backend-essentials; ask to remove maintenance-mode preset.
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger: silentLogger() });
    await remove({
      target,
      tool: 'claude-code',
      sourceRoot: REPO_ROOT,
      preset: 'maintenance-mode',
      logger,
    });
    // backend-essentials assets still intact.
    const lock = JSON.parse(
      fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'),
    );
    assert.ok(lock.tools['claude-code'].assets.skills['api-endpoint-design']);
  } finally {
    cleanupTmpProject(target);
  }
});
