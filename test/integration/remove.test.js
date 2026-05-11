import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
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

test('remove: single asset deletes files and updates lockfile', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger });
    assert.ok(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design')));
    await remove({ target, sourceRoot: REPO_ROOT, skills: ['api-endpoint-design'], logger });
    assert.equal(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design')), false);
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
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
    assert.equal(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design')), false);
    assert.equal(fs.existsSync(path.join(target, 'agents', 'senior-architect')), false);
    assert.equal(fs.existsSync(path.join(target, 'commands', 'summarize-diff.md')), false);
    const lock = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    for (const type of Object.keys(lock.assets)) {
      assert.deepEqual(Object.keys(lock.assets[type]), []);
    }
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

test('remove: throws when no lockfile exists', async () => {
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await assert.rejects(
      () => remove({ target, sourceRoot: REPO_ROOT, skills: ['x'], logger }),
      /lockfile|not installed/i,
    );
  } finally {
    cleanupTmpProject(target);
  }
});
