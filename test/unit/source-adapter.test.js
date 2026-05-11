import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveSourcePath,
  copyAssetAdaptive,
} from '../../src/lib/source-adapter.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

test('resolveSourcePath: dir-format source, dir-format dest returns the source dir', () => {
  const dir = createTmpProject();
  try {
    const skillDir = path.join(dir, 'skills', 'demo');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
    const resolved = resolveSourcePath({
      sourceRoot: dir,
      assetType: 'skills',
      name: 'demo',
      destFormat: { type: 'directory', filename: 'SKILL.md' },
    });
    assert.equal(resolved.path, skillDir);
    assert.equal(resolved.kind, 'directory');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('resolveSourcePath: dir-format source, file-format dest with sourceFile picks the file', () => {
  const dir = createTmpProject();
  try {
    const skillDir = path.join(dir, 'skills', 'demo');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'skill body');
    fs.writeFileSync(path.join(skillDir, 'extra.md'), 'extra');
    const resolved = resolveSourcePath({
      sourceRoot: dir,
      assetType: 'skills',
      name: 'demo',
      destFormat: { type: 'file', filename: '{name}.instructions.md', sourceFile: 'SKILL.md' },
    });
    assert.equal(resolved.path, path.join(skillDir, 'SKILL.md'));
    assert.equal(resolved.kind, 'file');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('resolveSourcePath: file-format source returns the matching file', () => {
  const dir = createTmpProject();
  try {
    fs.mkdirSync(path.join(dir, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'commands', 'do-thing.md'), 'cmd body');
    const resolved = resolveSourcePath({
      sourceRoot: dir,
      assetType: 'commands',
      name: 'do-thing',
      destFormat: { type: 'file', filename: '{name}.md' },
      sourceFormatHint: { type: 'file', filename: '{name}.md' },
    });
    assert.equal(resolved.path, path.join(dir, 'commands', 'do-thing.md'));
    assert.equal(resolved.kind, 'file');
  } finally {
    cleanupTmpProject(dir);
  }
});

test('resolveSourcePath: throws clear error when sourceFile is required but missing', () => {
  const dir = createTmpProject();
  try {
    const skillDir = path.join(dir, 'skills', 'demo');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'OTHER.md'), 'x');
    assert.throws(
      () =>
        resolveSourcePath({
          sourceRoot: dir,
          assetType: 'skills',
          name: 'demo',
          destFormat: { type: 'file', filename: '{name}.md', sourceFile: 'SKILL.md' },
        }),
      /SKILL\.md|sourceFile|missing/i,
    );
  } finally {
    cleanupTmpProject(dir);
  }
});

test('copyAssetAdaptive: dir source + file dest with sourceFile copies just the file', () => {
  const dir = createTmpProject();
  try {
    const srcDir = path.join(dir, 'skills', 'demo');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), 'primary');
    fs.writeFileSync(path.join(srcDir, 'extra.md'), 'extra');
    const dest = path.join(dir, 'target', 'demo.instructions.md');
    copyAssetAdaptive({
      sourcePath: srcDir,
      sourceKind: 'directory',
      sourceFile: 'SKILL.md',
      destPath: dest,
      destFormat: { type: 'file', filename: '{name}.instructions.md', sourceFile: 'SKILL.md' },
    });
    assert.ok(fs.existsSync(dest));
    assert.equal(fs.readFileSync(dest, 'utf8'), 'primary');
    assert.equal(fs.existsSync(path.join(dir, 'target', 'extra.md')), false);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('copyAssetAdaptive: dir source + dir dest copies the whole directory', () => {
  const dir = createTmpProject();
  try {
    const srcDir = path.join(dir, 'skills', 'demo');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), 'primary');
    fs.writeFileSync(path.join(srcDir, 'extra.md'), 'extra');
    const dest = path.join(dir, 'target', 'demo');
    copyAssetAdaptive({
      sourcePath: srcDir,
      sourceKind: 'directory',
      destPath: dest,
      destFormat: { type: 'directory', filename: 'SKILL.md' },
    });
    assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(dest, 'extra.md')));
  } finally {
    cleanupTmpProject(dir);
  }
});

test('copyAssetAdaptive: file source + file dest copies the file', () => {
  const dir = createTmpProject();
  try {
    fs.mkdirSync(path.join(dir, 'commands'), { recursive: true });
    const src = path.join(dir, 'commands', 'do.md');
    fs.writeFileSync(src, 'cmd');
    const dest = path.join(dir, 'out', 'do.md');
    copyAssetAdaptive({
      sourcePath: src,
      sourceKind: 'file',
      destPath: dest,
      destFormat: { type: 'file', filename: '{name}.md' },
    });
    assert.equal(fs.readFileSync(dest, 'utf8'), 'cmd');
  } finally {
    cleanupTmpProject(dir);
  }
});
