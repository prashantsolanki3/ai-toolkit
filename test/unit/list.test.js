import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list } from '../../src/commands/list.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

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

test('list (no type) outputs all assets grouped by type', async () => {
  const { logger, lines } = captureLogger();
  await list({ sourceRoot: REPO_ROOT, logger });
  const output = lines.map((l) => l[1]).join('\n');
  assert.match(output, /skills/i);
  assert.match(output, /agents/i);
  assert.match(output, /commands/i);
  assert.match(output, /api-endpoint-design/);
  assert.match(output, /senior-architect/);
  assert.match(output, /summarize-diff/);
});

test('list --type skills outputs only skills', async () => {
  const { logger, lines } = captureLogger();
  await list({ sourceRoot: REPO_ROOT, type: 'skills', logger });
  const output = lines.map((l) => l[1]).join('\n');
  assert.match(output, /api-endpoint-design/);
  assert.doesNotMatch(output, /senior-architect/);
  assert.doesNotMatch(output, /summarize-diff/);
});

test('list --type presets outputs presets with their contents', async () => {
  const { logger, lines } = captureLogger();
  await list({ sourceRoot: REPO_ROOT, type: 'presets', logger });
  const output = lines.map((l) => l[1]).join('\n');
  assert.match(output, /backend-essentials/);
  assert.match(output, /maintenance-mode/);
  assert.match(output, /quality-gates/);
  assert.match(output, /api-endpoint-design/);
});

test('list --type tools outputs available tools', async () => {
  const { logger, lines } = captureLogger();
  await list({ sourceRoot: REPO_ROOT, type: 'tools', logger });
  const output = lines.map((l) => l[1]).join('\n');
  assert.match(output, /claude-code/);
  assert.match(output, /cursor/);
});
