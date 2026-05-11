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

test('remove: single asset deletes files and updates lockfile', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    const dir = toolDir(target, 'claude-code');
    assert.ok(fs.existsSync(path.join(dir, 'skills', 'api-endpoint-design')));
    await remove({ target, sourceRoot: REPO_ROOT, skills: ['api-endpoint-design'], logger });
    assert.equal(fs.existsSync(path.join(dir, 'skills', 'api-endpoint-design')), false);
    const lock = JSON.parse(fs.readFileSync(path.join(dir, LOCKFILE_NAME), 'utf8'));
    assert.equal(lock.assets.skills['api-endpoint-design'], undefined);
    assert.ok(lock.assets.skills['code-review-checklist']);
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: --all removes every tracked asset and clears lockfile entries', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    await remove({ target, sourceRoot: REPO_ROOT, all: true, logger });
    const dir = toolDir(target, 'claude-code');
    assert.equal(fs.existsSync(path.join(dir, 'skills', 'api-endpoint-design')), false);
    assert.equal(fs.existsSync(path.join(dir, 'agents', 'senior-architect.md')), false);
    assert.equal(fs.existsSync(path.join(dir, 'commands', 'summarize-diff.md')), false);
    // Lockfile should be deleted when all assets are removed
    assert.equal(fs.existsSync(path.join(dir, LOCKFILE_NAME)), false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: non-installed asset warns, does not error', async () => {
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    await remove({ target, sourceRoot: REPO_ROOT, skills: ['not-installed'], logger });
    assert.ok(lines.some(([level, m]) => level === 'warn' && /not-installed/.test(m)));
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: throws when no installed tools exist under target', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await assert.rejects(
      () => remove({ target, sourceRoot: REPO_ROOT, skills: ['x'], logger }),
      /no installed|installed tools found|lockfile/i,
    );
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: --all without --tool removes from all installed tools', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    // Install for multiple tools
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    await install({ tool: 'cursor', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    
    // Verify both are installed
    assert.ok(fs.existsSync(toolDir(target, 'claude-code')));
    assert.ok(fs.existsSync(toolDir(target, 'cursor')));
    
    // Remove all from both tools
    await remove({ target, sourceRoot: REPO_ROOT, all: true, logger });
    
    // Verify both tool dirs are cleaned
    const claudeDir = toolDir(target, 'claude-code');
    const cursorDir = toolDir(target, 'cursor');
    
    // Lockfiles should be deleted when all assets are removed
    assert.equal(fs.existsSync(path.join(claudeDir, LOCKFILE_NAME)), false);
    assert.equal(fs.existsSync(path.join(cursorDir, LOCKFILE_NAME)), false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: --all deletes lockfile when all assets are removed', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    const dir = toolDir(target, 'claude-code');
    const lockfilePath = path.join(dir, LOCKFILE_NAME);
    assert.ok(fs.existsSync(lockfilePath), 'lockfile should exist after install');
    
    await remove({ target, sourceRoot: REPO_ROOT, all: true, logger });
    
    assert.equal(fs.existsSync(lockfilePath), false, 'lockfile should be deleted after remove --all');
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: --all cleans up empty directories up to tool root', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    const dir = toolDir(target, 'claude-code');
    
    // Verify structure exists
    assert.ok(fs.existsSync(path.join(dir, 'skills')));
    assert.ok(fs.existsSync(path.join(dir, 'agents')));
    
    await remove({ target, sourceRoot: REPO_ROOT, all: true, logger });
    
    // Tool root should be deleted if all contents are removed
    assert.equal(fs.existsSync(dir), false, 'empty tool root directory should be deleted');
    
    // Project root should still exist
    assert.ok(fs.existsSync(target), 'project root should not be deleted');
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: --all without --tool dedupes tools that share a workspace dir', async () => {
  // vscode-copilot and copilot-cli both install at .github/ (same workspace
  // subdir). findInstalledTools returns one entry per tool, but the second
  // pass through the same dir would fail because the first iteration
  // already removed the lockfile. The fan-out must dedupe by directory.
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    // Install for ALL tools, which exercises both vscode-copilot+copilot-cli
    // (sharing .github/) and kiro+kiro-cli (sharing .kiro/).
    await install({ preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });

    await remove({ target, sourceRoot: REPO_ROOT, all: true, logger });

    // No "No lockfile at ..." errors should have surfaced.
    const errors = lines.filter(([level]) => level === 'error').map(([, m]) => m);
    assert.equal(
      errors.length,
      0,
      `expected zero error lines, got: ${errors.join(' | ')}`,
    );

    // Every tool's workspace dir is gone.
    for (const dirName of ['.claude', '.cursor', '.github', '.gemini', '.kiro', '.agent']) {
      assert.equal(
        fs.existsSync(path.join(target, dirName)),
        false,
        `${dirName} should be cleaned up`,
      );
    }
  } finally {
    cleanupTmpProject(target);
  }
});

test('remove: does not delete non-empty directories', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    const dir = toolDir(target, 'claude-code');
    
    // Add a custom file to skills directory
    const customFile = path.join(dir, 'skills', 'custom-skill.md');
    fs.writeFileSync(customFile, '# Custom Skill');
    
    // Remove all tracked skills
    await remove({ target, sourceRoot: REPO_ROOT, all: true, logger });
    
    // Skills directory should still exist because custom file is there
    assert.ok(fs.existsSync(path.join(dir, 'skills')), 'non-empty skills directory should not be deleted');
    assert.ok(fs.existsSync(customFile), 'custom file should be preserved');
  } finally {
    cleanupTmpProject(target);
  }
});
