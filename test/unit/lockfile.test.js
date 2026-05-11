import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  read,
  write,
  addAsset,
  removeAsset,
  emptyLockfile,
  getOrInitTool,
  migrate,
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
} from '../../src/lib/lockfile.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

test('LOCKFILE_NAME is .ai-toolkit-lock.json', () => {
  assert.equal(LOCKFILE_NAME, '.ai-toolkit-lock.json');
});

test('LOCKFILE_VERSION is 2.0 (multi-tool schema)', () => {
  assert.equal(LOCKFILE_VERSION, '2.0');
});

test('read() returns null when lockfile is missing', () => {
  const dir = createTmpProject();
  try {
    assert.equal(read(dir), null);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('read() parses an existing v2.0 lockfile', () => {
  const dir = createTmpProject();
  try {
    const lock = {
      version: '2.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      lastUpdatedAt: '2026-01-01T00:00:00.000Z',
      tools: {
        'claude-code': { scope: 'workspace', assets: {} },
      },
    };
    fs.writeFileSync(path.join(dir, LOCKFILE_NAME), JSON.stringify(lock));
    const result = read(dir);
    assert.equal(result.version, '2.0');
    assert.ok(result.tools['claude-code']);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('emptyLockfile() returns a v2.0 shell with an empty tools map', () => {
  const lf = emptyLockfile();
  assert.equal(lf.version, '2.0');
  assert.deepEqual(lf.tools, {});
  assert.match(lf.installedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(lf.lastUpdatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('write() persists lockfile atomically (no temp leftover)', () => {
  const dir = createTmpProject();
  try {
    write(dir, emptyLockfile());
    const tempFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(tempFiles, []);
    const content = JSON.parse(fs.readFileSync(path.join(dir, LOCKFILE_NAME), 'utf8'));
    assert.equal(content.version, '2.0');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('getOrInitTool() lazily creates a tool section the first time', () => {
  const lf = emptyLockfile();
  const updated = getOrInitTool(lf, 'claude-code', { scope: 'workspace', preset: 'p1' });
  assert.ok(updated.tools['claude-code']);
  assert.equal(updated.tools['claude-code'].scope, 'workspace');
  assert.equal(updated.tools['claude-code'].preset, 'p1');
  assert.match(updated.tools['claude-code'].installedAt, /^\d{4}-\d{2}-\d{2}T/);
  // The input lockfile must not be mutated.
  assert.equal(lf.tools['claude-code'], undefined);
});

test('getOrInitTool() preserves an existing tool section', () => {
  const lf = emptyLockfile();
  const first = getOrInitTool(lf, 'claude-code', { scope: 'workspace', preset: 'p1' });
  const second = getOrInitTool(first, 'claude-code', { scope: 'workspace', preset: 'p2' });
  // Existing section wins on conflict — we don't overwrite scope/preset.
  assert.equal(second.tools['claude-code'].preset, 'p1');
});

test('addAsset() places the entry under tools.<tool>.assets.<type>.<name>', () => {
  let lf = emptyLockfile();
  lf = getOrInitTool(lf, 'claude-code', { scope: 'workspace' });
  const updated = addAsset(lf, 'claude-code', 'skills', 'my-skill', {
    sha: 'abc',
    sourcePath: 'skills/my-skill',
  });
  assert.equal(updated.tools['claude-code'].assets.skills['my-skill'].sha, 'abc');
  assert.ok(updated.tools['claude-code'].assets.skills['my-skill'].installedAt);
  // immutability
  assert.equal(lf.tools['claude-code'].assets.skills, undefined);
});

test('addAsset() creates the asset-type bucket lazily', () => {
  let lf = emptyLockfile();
  lf = getOrInitTool(lf, 'claude-code', { scope: 'workspace' });
  const updated = addAsset(lf, 'claude-code', 'agents', 'arch', { sha: 'x' });
  assert.ok(updated.tools['claude-code'].assets.agents.arch);
});

test('addAsset() lazily initialises a missing tool section', () => {
  const lf = emptyLockfile();
  const updated = addAsset(lf, 'cursor', 'skills', 'foo', { sha: 'x' });
  assert.ok(updated.tools.cursor);
  assert.ok(updated.tools.cursor.assets.skills.foo);
});

test('removeAsset() removes only the named entry under the named tool', () => {
  let lf = emptyLockfile();
  lf = addAsset(lf, 'claude-code', 'skills', 'a', { sha: 'x' });
  lf = addAsset(lf, 'claude-code', 'skills', 'b', { sha: 'y' });
  lf = addAsset(lf, 'cursor', 'skills', 'a', { sha: 'z' });
  const updated = removeAsset(lf, 'claude-code', 'skills', 'a');
  assert.equal(updated.tools['claude-code'].assets.skills.a, undefined);
  assert.ok(updated.tools['claude-code'].assets.skills.b);
  // Other tools' entries with the same name must survive.
  assert.ok(updated.tools.cursor.assets.skills.a);
});

test('removeAsset() is a no-op when the asset is absent', () => {
  let lf = emptyLockfile();
  lf = getOrInitTool(lf, 'claude-code', { scope: 'workspace' });
  const updated = removeAsset(lf, 'claude-code', 'skills', 'nope');
  assert.deepEqual(updated.tools['claude-code'].assets, lf.tools['claude-code'].assets);
});

test('removeAsset() is a no-op when the tool is absent', () => {
  const lf = emptyLockfile();
  const updated = removeAsset(lf, 'ghost-tool', 'skills', 'x');
  assert.deepEqual(updated.tools, {});
});

test('migrate() recognises a current-version lockfile unchanged', () => {
  const current = {
    version: '2.0',
    installedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    tools: { 'claude-code': { scope: 'workspace', assets: { skills: { x: { sha: 'a' } } } } },
  };
  const result = migrate(current);
  assert.equal(result.version, '2.0');
  assert.equal(result.tools['claude-code'].assets.skills.x.sha, 'a');
});

test('migrate() throws on the old v1.0 single-tool schema (user must re-install)', () => {
  // No auto-migration from v1.0 — the user wiped state on purpose. Surface
  // a clear, actionable error rather than silently dropping content.
  const oldShape = { version: '1.0', tool: 'claude-code', assets: { skills: {} } };
  assert.throws(() => migrate(oldShape), /reinstall|upgrade|v1\.0|version/i);
});
