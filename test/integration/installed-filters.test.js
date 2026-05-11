import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { installed } from '../../src/commands/installed.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function recordingLogger() {
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

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

test('installed --type skills filters the report to only skills', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    await installed({ target, sourceRoot: REPO_ROOT, type: 'skills', logger });
    const out = lines.map((l) => l[1]).join('\n');
    assert.match(out, /skills/i);
    assert.match(out, /api-endpoint-design/);
    // Agents and commands sections should NOT appear in the report.
    assert.doesNotMatch(out, /^agents \(/m);
    assert.doesNotMatch(out, /^commands \(/m);
  } finally {
    cleanupTmpProject(target);
  }
});

test('installed --preset filters to assets in that preset', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    // Install both presets.
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger: silentLogger() });
    await install({ tool: 'claude-code', preset: 'maintenance-mode', target, sourceRoot: REPO_ROOT, logger: silentLogger() });

    await installed({
      target,
      sourceRoot: REPO_ROOT,
      preset: 'backend-essentials',
      logger,
    });

    const out = lines.map((l) => l[1]).join('\n');
    // backend-essentials assets visible
    assert.match(out, /api-endpoint-design/);
    assert.match(out, /senior-architect/);
    // maintenance-mode-only assets hidden
    assert.doesNotMatch(out, /dependency-upgrade/);
    assert.doesNotMatch(out, /refactoring-specialist/);
  } finally {
    cleanupTmpProject(target);
  }
});

test('installed --type + --preset combined', async () => {
  const target = createTmpProject();
  const { logger, lines } = recordingLogger();
  try {
    await install({ tool: 'claude-code', preset: 'backend-essentials', target, sourceRoot: REPO_ROOT, logger: silentLogger() });
    await installed({ target, sourceRoot: REPO_ROOT, type: 'skills', preset: 'backend-essentials', logger });
    const out = lines.map((l) => l[1]).join('\n');
    assert.match(out, /api-endpoint-design/);          // skill, in preset
    assert.doesNotMatch(out, /senior-architect/);      // agent, in preset but filtered by type
    assert.doesNotMatch(out, /summarize-diff/);        // command, in preset but filtered by type
  } finally {
    cleanupTmpProject(target);
  }
});
