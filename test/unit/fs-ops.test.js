import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  hashFile,
  hashDir,
  copyAsset,
  pathExists,
  removePath,
} from '../../src/lib/fs-ops.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

test('hashFile() returns deterministic SHA-256 hex string', () => {
  const dir = createTmpProject();
  try {
    const file = path.join(dir, 'a.txt');
    fs.writeFileSync(file, 'hello world');
    const h1 = hashFile(file);
    const h2 = hashFile(file);
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('hashFile() returns different hashes for different content', () => {
  const dir = createTmpProject();
  try {
    const a = path.join(dir, 'a.txt');
    const b = path.join(dir, 'b.txt');
    fs.writeFileSync(a, 'one');
    fs.writeFileSync(b, 'two');
    assert.notEqual(hashFile(a), hashFile(b));
  } finally {
    cleanupTmpProject(dir);
  }
});

test('hashDir() returns deterministic hash of contents (order-independent)', () => {
  const dir = createTmpProject();
  try {
    const d = path.join(dir, 'mydir');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'a.txt'), 'AAA');
    fs.writeFileSync(path.join(d, 'b.txt'), 'BBB');
    const h1 = hashDir(d);
    const h2 = hashDir(d);
    assert.equal(h1, h2);
    assert.match(h1, /^[a-f0-9]{64}$/);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('hashDir() differs when content changes', () => {
  const dir = createTmpProject();
  try {
    const d = path.join(dir, 'mydir');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'a.txt'), 'AAA');
    const h1 = hashDir(d);
    fs.writeFileSync(path.join(d, 'a.txt'), 'XXX');
    const h2 = hashDir(d);
    assert.notEqual(h1, h2);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('hashDir() includes nested files', () => {
  const dir = createTmpProject();
  try {
    const d = path.join(dir, 'mydir');
    fs.mkdirSync(path.join(d, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(d, 'sub', 'a.txt'), 'AAA');
    const h1 = hashDir(d);
    fs.writeFileSync(path.join(d, 'sub', 'a.txt'), 'XXX');
    const h2 = hashDir(d);
    assert.notEqual(h1, h2);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('copyAsset() copies a directory (directory format)', () => {
  const dir = createTmpProject();
  try {
    const src = path.join(dir, 'src-skill');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'SKILL.md'), 'skill content');
    fs.writeFileSync(path.join(src, 'extra.md'), 'extra');
    const dest = path.join(dir, 'dest', 'src-skill');
    copyAsset(src, dest, { type: 'directory' });
    assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8'), 'skill content');
    assert.equal(fs.readFileSync(path.join(dest, 'extra.md'), 'utf8'), 'extra');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('copyAsset() copies a single file (file format)', () => {
  const dir = createTmpProject();
  try {
    const src = path.join(dir, 'src.md');
    fs.writeFileSync(src, 'cmd');
    const dest = path.join(dir, 'sub', 'dest.md');
    copyAsset(src, dest, { type: 'file' });
    assert.equal(fs.readFileSync(dest, 'utf8'), 'cmd');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('copyAsset() overwrites existing destination', () => {
  const dir = createTmpProject();
  try {
    const src = path.join(dir, 'src.md');
    const dest = path.join(dir, 'dest.md');
    fs.writeFileSync(src, 'new');
    fs.writeFileSync(dest, 'old');
    copyAsset(src, dest, { type: 'file' });
    assert.equal(fs.readFileSync(dest, 'utf8'), 'new');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('pathExists() returns true for existing path', () => {
  const dir = createTmpProject();
  try {
    fs.writeFileSync(path.join(dir, 'x'), 'x');
    assert.equal(pathExists(path.join(dir, 'x')), true);
    assert.equal(pathExists(dir), true);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('pathExists() returns false for missing path', () => {
  assert.equal(pathExists('/nonexistent-aitoolkit-test-path-xyz'), false);
});

test('removePath() removes a file', () => {
  const dir = createTmpProject();
  try {
    const f = path.join(dir, 'x');
    fs.writeFileSync(f, 'x');
    removePath(f);
    assert.equal(fs.existsSync(f), false);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('removePath() removes a directory recursively', () => {
  const dir = createTmpProject();
  try {
    const d = path.join(dir, 'sub');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'x'), 'x');
    removePath(d);
    assert.equal(fs.existsSync(d), false);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('removePath() is idempotent on missing path', () => {
  assert.doesNotThrow(() => removePath('/nonexistent-aitoolkit-test-xyz'));
});
