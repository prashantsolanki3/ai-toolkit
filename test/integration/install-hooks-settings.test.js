import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { toolDir } from '../helpers/tool-paths.js';
import { generateManifest } from '../../src/lib/manifest-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function silentLogger() {
  const lines = [];
  const push = (lvl) => (m) => lines.push([lvl, m]);
  return {
    logger: {
      info: push('info'),
      success: push('success'),
      warn: push('warn'),
      error: push('error'),
      dryRun: push('dryRun'),
      verbose: push('verbose'),
    },
    lines,
  };
}

// Build a minimal source repo with a single SessionStart hook so we control
// the frontmatter event: end-to-end.
function buildHookSource() {
  const dir = createTmpProject('ai-toolkit-hooksrc-');
  // Re-use the real tools.json so install hits the real claude-code config
  // (including the new hooksConfig block).
  const cfg = path.join(dir, 'config');
  fs.mkdirSync(cfg, { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'config', 'tools.json'), path.join(cfg, 'tools.json'));
  fs.copyFileSync(path.join(REPO_ROOT, 'config', 'tools.schema.json'), path.join(cfg, 'tools.schema.json'));
  fs.writeFileSync(
    path.join(cfg, 'presets.json'),
    JSON.stringify({ version: '1.0', presets: { 'dev-skills': { description: 'fixture' } } }, null, 2),
  );

  const hookPath = path.join(dir, 'hooks', 'branch-from-main.sh');
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(
    hookPath,
    [
      '#!/usr/bin/env bash',
      '# === ai-toolkit metadata ===',
      '# name: branch-from-main',
      '# description: SessionStart advisory',
      '# author: fixture',
      '# presets:',
      '#   - dev-skills',
      '# tools:',
      '#   - claude-code',
      '# event: SessionStart',
      '# === end metadata ===',
      '',
      'set -euo pipefail',
      'echo "advisory"',
      '',
    ].join('\n'),
  );
  fs.chmodSync(hookPath, 0o755);

  const manifest = generateManifest(dir);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return dir;
}

function readSettings(target) {
  const p = path.join(toolDir(target, 'claude-code'), 'settings.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('install: a SessionStart hook is registered in .claude/settings.json under hooks', async () => {
  const source = buildHookSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({
      tool: 'claude-code',
      hooks: ['branch-from-main'],
      target,
      sourceRoot: source,
      logger,
    });

    const installDir = toolDir(target, 'claude-code');
    // Script copied.
    assert.ok(fs.existsSync(path.join(installDir, 'hooks', 'branch-from-main.sh')));
    // AND registered in settings.json.
    const settings = readSettings(target);
    assert.ok(settings.hooks, 'settings.json has a hooks block');
    assert.ok(Array.isArray(settings.hooks.SessionStart), 'SessionStart array present');
    const commands = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.equal(commands.length, 1);
    assert.match(commands[0], /branch-from-main\.sh/);
    assert.match(commands[0], /^bash "/);
    // Entry shape is schema-valid.
    assert.equal(settings.hooks.SessionStart[0].hooks[0].type, 'command');
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('install: re-installing a hook is idempotent and preserves unrelated settings', async () => {
  const source = buildHookSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    // Seed a pre-existing user settings.json with unrelated content.
    const installDir = toolDir(target, 'claude-code');
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(
      path.join(installDir, 'settings.json'),
      JSON.stringify(
        {
          permissions: { allow: ['Bash(npm test)'] },
          hooks: {
            Stop: [{ hooks: [{ type: 'command', command: 'bash "/me/stop.sh"' }] }],
          },
        },
        null,
        2,
      ),
    );

    const opts = {
      tool: 'claude-code',
      hooks: ['branch-from-main'],
      target,
      sourceRoot: source,
      logger,
      force: true,
    };
    await install(opts);
    await install(opts);
    await install(opts);

    const settings = readSettings(target);
    // Unrelated content preserved.
    assert.deepEqual(settings.permissions, { allow: ['Bash(npm test)'] });
    assert.equal(settings.hooks.Stop[0].hooks[0].command, 'bash "/me/stop.sh"');
    // Our hook present exactly once despite three installs.
    const ssCommands = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
    assert.equal(ssCommands.filter((c) => /branch-from-main\.sh/.test(c)).length, 1);
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('remove: unwires the hook from settings.json but keeps unrelated entries', async () => {
  const source = buildHookSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    const installDir = toolDir(target, 'claude-code');
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(
      path.join(installDir, 'settings.json'),
      JSON.stringify(
        { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'bash "/me/stop.sh"' }] }] } },
        null,
        2,
      ),
    );

    await install({
      tool: 'claude-code',
      hooks: ['branch-from-main'],
      target,
      sourceRoot: source,
      logger,
      force: true,
    });
    await remove({
      tool: 'claude-code',
      hooks: ['branch-from-main'],
      target,
      sourceRoot: source,
      logger,
    });

    const settings = readSettings(target);
    // Our SessionStart entry gone; unrelated Stop hook still there.
    assert.ok(!settings.hooks.SessionStart, 'SessionStart removed (empty event dropped)');
    assert.equal(settings.hooks.Stop[0].hooks[0].command, 'bash "/me/stop.sh"');
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});
