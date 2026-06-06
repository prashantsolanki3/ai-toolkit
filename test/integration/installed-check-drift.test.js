import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { installed } from '../../src/commands/installed.js';
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

function buildHookSource() {
  const dir = createTmpProject('ai-toolkit-driftsrc-');
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
      '# event: SessionStart',
      '# === end metadata ===',
      '',
      'echo "advisory"',
      '',
    ].join('\n'),
  );
  fs.chmodSync(hookPath, 0o755);
  const manifest = generateManifest(dir);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return dir;
}

test('installed --check: clean install reports no drift (drift is empty)', async () => {
  const source = buildHookSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', hooks: ['branch-from-main'], target, sourceRoot: source, logger });
    const res = await installed({ check: true, target, sourceRoot: source, logger });
    assert.ok(res, 'installed --check returns a result object');
    assert.deepEqual(res.drift, [], 'no drift on a fresh install');
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('installed --check --scope global without --tool errors (no autodiscovery)', async () => {
  const source = buildHookSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await assert.rejects(
      () => installed({ check: true, scope: 'global', target, sourceRoot: source, logger }),
      /requires --tool/,
    );
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('installed --check: detects a tampered installed hook', async () => {
  const source = buildHookSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'claude-code', hooks: ['branch-from-main'], target, sourceRoot: source, logger });

    // Tamper with the installed hook script — simulate a hand-edit / drift.
    const installedHook = path.join(toolDir(target, 'claude-code'), 'hooks', 'branch-from-main.sh');
    fs.appendFileSync(installedHook, '\n# tampered locally\n');

    const res = await installed({ check: true, target, sourceRoot: source, logger });
    assert.ok(res.drift.length >= 1, 'drift detected');
    const entry = res.drift.find((d) => d.name === 'branch-from-main' && d.type === 'hooks');
    assert.ok(entry, 'the tampered hook is reported');
    assert.equal(entry.reason, 'installed content drifted from lockfile');
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});
