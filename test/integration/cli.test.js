import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'bin', 'cli.js');

function run(args, opts = {}) {
  return spawnSync('node', [CLI, ...args], {
    cwd: opts.cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

test('cli: --help shows usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage|install|update|remove|list|installed/);
});

test('cli: list runs and prints skills section', () => {
  const r = run(['list']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /api-endpoint-design/);
});

test('cli: list --type presets', () => {
  const r = run(['list', '--type', 'presets']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /backend-essentials/);
});

test('cli: install / installed / remove flow via CLI', () => {
  const target = createTmpProject();
  try {
    const install = run(['install', '--tool', 'claude-code', '--preset', 'backend-essentials', '--target', target]);
    assert.equal(install.status, 0, `install failed: ${install.stderr}`);
    assert.ok(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design', 'SKILL.md')));

    const inst = run(['installed', '--target', target]);
    assert.equal(inst.status, 0);
    assert.match(inst.stdout, /claude-code/);
    assert.match(inst.stdout, /api-endpoint-design/);

    const rem = run(['remove', '--target', target, '--skills', 'api-endpoint-design']);
    assert.equal(rem.status, 0);
    assert.equal(fs.existsSync(path.join(target, 'skills', 'api-endpoint-design')), false);
  } finally {
    cleanupTmpProject(target);
  }
});

test('cli: unknown command exits non-zero', () => {
  const r = run(['no-such-command']);
  assert.notEqual(r.status, 0);
});

test('cli: install --dry-run does not write files', () => {
  const target = createTmpProject();
  try {
    const r = run(['install', '--tool', 'claude-code', '--preset', 'backend-essentials', '--target', target, '--dry-run']);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(path.join(target, 'skills')), false);
    assert.match(r.stdout, /dry|would/i);
  } finally {
    cleanupTmpProject(target);
  }
});
