import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { install } from '../../src/commands/install.js';
import { update } from '../../src/commands/update.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';
import { createFakeSource } from '../helpers/fake-source.js';
import { LOCKFILE_NAME } from '../../src/lib/lockfile.js';

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

const TOOL_CONFIG = {
  version: '1.0',
  tools: {
    'demo-tool': {
      displayName: 'Demo',
      defaultTarget: { global: null, workspace: '.demo' },
      assetPaths: { skills: 'skills', commands: 'commands' },
      assetFormats: {
        skills: { filename: 'SKILL.md', type: 'directory' },
        commands: { filename: '{name}.md', type: 'file' },
      },
      supportedAssets: ['skills', 'commands'],
    },
  },
};

const BASE_MANIFEST = {
  version: '1.0',
  skills: {
    'sample-skill': { description: 'sample' },
  },
  commands: {
    'sample-cmd': { description: 'cmd' },
  },
  presets: {
    basic: { skills: ['sample-skill'], commands: ['sample-cmd'] },
  },
};

function buildSource(skillContent = 'v1', cmdContent = '# v1') {
  return createFakeSource({
    manifest: BASE_MANIFEST,
    tools: TOOL_CONFIG,
    skills: {
      'sample-skill': { 'SKILL.md': skillContent, 'extra.md': 'extra' },
    },
    commands: { 'sample-cmd': cmdContent },
  });
}

test('update: no source changes is a no-op (assets unchanged, lockfile timestamp refreshed)', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'demo-tool', preset: 'basic', target, sourceRoot: source, logger });
    const before = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    const beforeSha = before.assets.skills['sample-skill'].sha;
    await new Promise((r) => setTimeout(r, 10));
    const result = await update({ target, sourceRoot: source, logger });
    const after = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    assert.equal(after.assets.skills['sample-skill'].sha, beforeSha);
    assert.notEqual(after.lastUpdatedAt, before.lastUpdatedAt);
    assert.deepEqual(result.updated, []);
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('update: source change is propagated; sha bumped', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'demo-tool', preset: 'basic', target, sourceRoot: source, logger });
    const before = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    fs.writeFileSync(path.join(source, 'skills', 'sample-skill', 'SKILL.md'), 'v2-content');
    const result = await update({ target, sourceRoot: source, logger });
    const after = JSON.parse(fs.readFileSync(path.join(target, LOCKFILE_NAME), 'utf8'));
    const installed = fs.readFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'utf8');
    assert.equal(installed, 'v2-content');
    assert.notEqual(after.assets.skills['sample-skill'].sha, before.assets.skills['sample-skill'].sha);
    assert.ok(result.updated.some((u) => u.name === 'sample-skill' && u.type === 'skills'));
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('update: local edit + no force = skip with warning', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({ tool: 'demo-tool', preset: 'basic', target, sourceRoot: source, logger });
    fs.writeFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'local-edit');
    fs.writeFileSync(path.join(source, 'skills', 'sample-skill', 'SKILL.md'), 'upstream-update');
    const result = await update({ target, sourceRoot: source, logger });
    const installed = fs.readFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'utf8');
    assert.equal(installed, 'local-edit');
    assert.ok(result.skipped.some((s) => s.name === 'sample-skill' && /local/i.test(s.reason)));
    assert.ok(lines.some(([level, m]) => level === 'warn' && /sample-skill/.test(m)));
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('update: local edit + force = overwrite', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'demo-tool', preset: 'basic', target, sourceRoot: source, logger });
    fs.writeFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'local-edit');
    fs.writeFileSync(path.join(source, 'skills', 'sample-skill', 'SKILL.md'), 'upstream-update');
    await update({ target, sourceRoot: source, logger, force: true });
    const installed = fs.readFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'utf8');
    assert.equal(installed, 'upstream-update');
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('update: source asset removed upstream is flagged, not auto-deleted', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger, lines } = silentLogger();
  try {
    await install({ tool: 'demo-tool', preset: 'basic', target, sourceRoot: source, logger });
    fs.rmSync(path.join(source, 'skills', 'sample-skill'), { recursive: true, force: true });
    const result = await update({ target, sourceRoot: source, logger });
    assert.ok(fs.existsSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md')));
    assert.ok(result.missing.some((m) => m.name === 'sample-skill'));
    assert.ok(lines.some(([level, m]) => level === 'warn' && /sample-skill/.test(m)));
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('update: dryRun never writes', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await install({ tool: 'demo-tool', preset: 'basic', target, sourceRoot: source, logger });
    fs.writeFileSync(path.join(source, 'skills', 'sample-skill', 'SKILL.md'), 'v2-content');
    const before = fs.readFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'utf8');
    await update({ target, sourceRoot: source, logger, dryRun: true });
    const after = fs.readFileSync(path.join(target, 'skills', 'sample-skill', 'SKILL.md'), 'utf8');
    assert.equal(after, before);
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});

test('update: throws when target has no lockfile', async () => {
  const source = buildSource();
  const target = createTmpProject();
  const { logger } = silentLogger();
  try {
    await assert.rejects(
      () => update({ target, sourceRoot: source, logger }),
      /lockfile|not installed/i,
    );
  } finally {
    cleanupTmpProject(source);
    cleanupTmpProject(target);
  }
});
