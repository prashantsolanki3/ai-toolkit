import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../../src/commands/install.js';
import { remove } from '../../src/commands/remove.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function silentLogger() {
  return { info() {}, success() {}, warn() {}, error() {}, dryRun() {}, verbose() {} };
}

test('kiro: installing a hook generates the .sh AND a sibling .kiro.hook JSON', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'kiro',
      hooks: ['pre-commit-lint'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    const script = path.join(target, 'hooks', 'pre-commit-lint.sh');
    const sidecar = path.join(target, 'hooks', 'pre-commit-lint.kiro.hook');
    assert.ok(fs.existsSync(script), 'hook script must exist');
    assert.ok(fs.existsSync(sidecar), 'Kiro hook sidecar must be generated alongside the script');
    const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    assert.equal(meta.name, 'pre-commit-lint');
    assert.equal(meta.command, './pre-commit-lint.sh');
    assert.ok(typeof meta.description === 'string' && meta.description.length > 0);
  } finally {
    cleanupTmpProject(target);
  }
});

test('kiro: removing a hook also tears down the sidecar', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'kiro',
      hooks: ['pre-commit-lint'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    await remove({
      tool: 'kiro',
      target,
      sourceRoot: REPO_ROOT,
      hooks: ['pre-commit-lint'],
      logger: silentLogger(),
    });
    assert.equal(fs.existsSync(path.join(target, 'hooks', 'pre-commit-lint.sh')), false);
    assert.equal(fs.existsSync(path.join(target, 'hooks', 'pre-commit-lint.kiro.hook')), false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('claude-code: hooks do not generate a sidecar (no sidecar spec in config)', async () => {
  const target = createTmpProject();
  try {
    await install({
      tool: 'claude-code',
      hooks: ['pre-commit-lint'],
      target,
      sourceRoot: REPO_ROOT,
      logger: silentLogger(),
    });
    assert.ok(fs.existsSync(path.join(target, 'hooks', 'pre-commit-lint.sh')));
    assert.equal(
      fs.existsSync(path.join(target, 'hooks', 'pre-commit-lint.kiro.hook')),
      false,
      'sidecar must NOT be generated for tools that did not opt in',
    );
  } finally {
    cleanupTmpProject(target);
  }
});
