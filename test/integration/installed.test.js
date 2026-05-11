import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { installed } from '../../src/commands/installed.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

function captureLogger() {
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

test('installed: reads lockfile and prints human-readable summary', async () => {
  const target = createTmpProject();
  const { logger: installLogger } = captureLogger();
  const { logger, lines } = captureLogger();
  try {
    await install({
      tool: 'claude-code',
      preset: 'backend-essentials',
      target,
      sourceRoot: REPO_ROOT,
      logger: installLogger,
    });
    await installed({ target, sourceRoot: REPO_ROOT, logger });
    const output = lines.map((l) => l[1]).join('\n');
    assert.match(output, /claude-code/);
    assert.match(output, /backend-essentials/);
    assert.match(output, /api-endpoint-design/);
    assert.match(output, /senior-architect/);
    assert.match(output, /summarize-diff/);
  } finally {
    cleanupTmpProject(target);
  }
});

test('installed: warns clearly when no lockfile exists', async () => {
  const target = createTmpProject();
  const { logger, lines } = captureLogger();
  try {
    await installed({ target, sourceRoot: REPO_ROOT, logger });
    const output = lines.map((l) => l[1]).join('\n');
    assert.match(output, /not installed|no lockfile|nothing installed/i);
  } finally {
    cleanupTmpProject(target);
  }
});
