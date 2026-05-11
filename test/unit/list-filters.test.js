import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { list } from '../../src/commands/list.js';

import { buildLegacyFixture } from '../helpers/legacy-fixture.js';
const REPO_ROOT = buildLegacyFixture();

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

test('list --tool cursor: only shows assets the tool supports', async () => {
  const { logger, lines } = recordingLogger();
  await list({ sourceRoot: REPO_ROOT, tool: 'cursor', logger });
  const out = lines.map((l) => l[1]).join('\n');
  // Cursor supports skills, rules, agents.
  assert.match(out, /skills/i);
  assert.match(out, /rules/i);
  assert.match(out, /agents/i);
  // Cursor does NOT support commands or hooks — sections should be absent.
  assert.doesNotMatch(out, /^commands:/m);
  assert.doesNotMatch(out, /^hooks:/m);
});

test('list --tool cursor + --type skills: only shows skills the tool supports', async () => {
  const { logger, lines } = recordingLogger();
  await list({ sourceRoot: REPO_ROOT, tool: 'cursor', type: 'skills', logger });
  const out = lines.map((l) => l[1]).join('\n');
  assert.match(out, /api-endpoint-design/);
  assert.doesNotMatch(out, /senior-architect/);   // an agent
});

test('list --tool cursor: drops assets restricted to other tools via the tools: allowlist', async () => {
  const { logger, lines } = recordingLogger();
  // no-bare-todos has tools:[cursor,claude-code] — cursor IS allowed.
  await list({ sourceRoot: REPO_ROOT, tool: 'cursor', type: 'rules', logger });
  const out = lines.map((l) => l[1]).join('\n');
  assert.match(out, /no-bare-todos/);
});

test('list --tool antigravity: hides assets the tool does not support', async () => {
  const { logger, lines } = recordingLogger();
  await list({ sourceRoot: REPO_ROOT, tool: 'antigravity', logger });
  const out = lines.map((l) => l[1]).join('\n');
  // Antigravity supports skills only.
  assert.match(out, /skills/i);
  assert.doesNotMatch(out, /^agents:/m);
  assert.doesNotMatch(out, /^commands:/m);
  assert.doesNotMatch(out, /^rules:/m);
  assert.doesNotMatch(out, /^hooks:/m);
});

test('list --tool <unknown> throws helpful error', async () => {
  const { logger } = recordingLogger();
  await assert.rejects(
    () => list({ sourceRoot: REPO_ROOT, tool: 'unknown-tool', logger }),
    /unknown-tool/,
  );
});
