import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  read,
  write,
  addAsset,
  removeAsset,
  migrate,
  LOCKFILE_NAME,
} from '../../src/lib/lockfile.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

test('LOCKFILE_NAME is .ai-toolkit-lock.json', () => {
  assert.equal(LOCKFILE_NAME, '.ai-toolkit-lock.json');
});

test('read() returns null when lockfile is missing', () => {
  const dir = createTmpProject();
  try {
    assert.equal(read(dir), null);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('read() parses existing lockfile', () => {
  const dir = createTmpProject();
  try {
    const lock = { version: '1.0', tool: 'claude-code', assets: {} };
    fs.writeFileSync(path.join(dir, LOCKFILE_NAME), JSON.stringify(lock));
    const result = read(dir);
    assert.equal(result.tool, 'claude-code');
    assert.equal(result.version, '1.0');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('write() persists lockfile atomically (no temp leftover)', () => {
  const dir = createTmpProject();
  try {
    write(dir, { version: '1.0', tool: 'cursor', assets: {} });
    const content = JSON.parse(fs.readFileSync(path.join(dir, LOCKFILE_NAME), 'utf8'));
    assert.equal(content.tool, 'cursor');
    const tempFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(tempFiles, []);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('addAsset() returns new lockfile with entry', () => {
  const original = { version: '1.0', tool: 'claude-code', assets: { skills: {} } };
  const updated = addAsset(original, 'skills', 'my-skill', {
    sha: 'abc',
    sourcePath: 'skills/my-skill',
  });
  assert.ok(updated.assets.skills['my-skill']);
  assert.equal(updated.assets.skills['my-skill'].sha, 'abc');
  assert.ok(updated.assets.skills['my-skill'].installedAt);
  assert.deepEqual(original.assets.skills, {});
});

test('addAsset() creates the asset type bucket if absent', () => {
  const original = { version: '1.0', tool: 'claude-code', assets: {} };
  const updated = addAsset(original, 'agents', 'arch', { sha: 'x', sourcePath: 'agents/arch' });
  assert.ok(updated.assets.agents.arch);
});

test('removeAsset() returns new lockfile without entry', () => {
  const original = {
    version: '1.0',
    tool: 'claude-code',
    assets: {
      skills: {
        a: { sha: 'x' },
        b: { sha: 'y' },
      },
    },
  };
  const updated = removeAsset(original, 'skills', 'a');
  assert.equal(updated.assets.skills.a, undefined);
  assert.ok(updated.assets.skills.b);
  assert.ok(original.assets.skills.a, 'original must not be mutated');
});

test('removeAsset() is a no-op when asset is absent', () => {
  const original = { version: '1.0', tool: 'claude-code', assets: { skills: {} } };
  const updated = removeAsset(original, 'skills', 'nope');
  assert.deepEqual(updated.assets, original.assets);
});

test('migrate() upgrades old schemas to current version', () => {
  const old = { tool: 'claude-code', skills: { x: { sha: 'a' } } };
  const upgraded = migrate(old);
  assert.equal(upgraded.version, '1.0');
  assert.ok(upgraded.assets.skills.x);
});

test('migrate() passes through current-version lockfile unchanged', () => {
  const current = {
    version: '1.0',
    tool: 'claude-code',
    assets: { skills: { x: { sha: 'a' } } },
  };
  const result = migrate(current);
  assert.equal(result.version, '1.0');
  assert.equal(result.assets.skills.x.sha, 'a');
});
