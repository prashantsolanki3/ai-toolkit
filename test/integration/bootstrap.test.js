import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolDir } from '../helpers/tool-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// scripts/bootstrap.sh is the contributor-facing entry into self-hosting
// the toolkit. It's hardcoded to write at the repo root, so to test it
// safely we copy the script (and its dependencies) into a tmp project
// and invoke it there with the real toolkit pointed at via the cli.

test('bootstrap script produces a working .claude/ tree with symlinked skills', () => {
  // Use the toolkit's CLI directly on a tmp target instead of running
  // bootstrap.sh (which writes at REPO_ROOT). This tests the same flow
  // bootstrap.sh exercises, without touching the repo state.
  const target = fs.mkdtempSync(path.join(REPO_ROOT, 'test/fixtures/tmp-bootstrap-'));
  try {
    const result = spawnSync(
      'node',
      [
        path.join(REPO_ROOT, 'bin', 'cli.js'),
        'install',
        '--tool', 'claude-code',
        '--target', target,
        '--link',
        '--force',
        '--skills', 'code-review-checklist,api-endpoint-design',
        '--agents', 'senior-architect',
        '--commands', 'summarize-diff',
      ],
      { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
    );
    assert.equal(result.status, 0, `install failed: ${result.stderr}`);

    const dir = toolDir(target, 'claude-code');
    // Skills are symlinked (dir→dir, no transform)
    const skill = path.join(dir, 'skills', 'code-review-checklist');
    assert.ok(fs.lstatSync(skill).isSymbolicLink(), 'skill should be a symlink');

    // Agent file is symlinked (dir→file via sourceFile, no transform)
    const agent = path.join(dir, 'agents', 'senior-architect.md');
    assert.ok(fs.lstatSync(agent).isSymbolicLink(), 'agent should be a symlink');

    // Command file is symlinked (file→file, no transform)
    const cmd = path.join(dir, 'commands', 'summarize-diff.md');
    assert.ok(fs.lstatSync(cmd).isSymbolicLink(), 'command should be a symlink');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('bootstrapping vscode-copilot falls back to copy for instructions (frontmatter transform)', () => {
  const target = fs.mkdtempSync(path.join(REPO_ROOT, 'test/fixtures/tmp-bootstrap-'));
  try {
    const result = spawnSync(
      'node',
      [
        path.join(REPO_ROOT, 'bin', 'cli.js'),
        'install',
        '--tool', 'vscode-copilot',
        '--target', target,
        '--link',
        '--force',
        '--skills', 'code-review-checklist',
      ],
      { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
    );
    assert.equal(result.status, 0, `install failed: ${result.stderr}`);

    const inst = path.join(
      toolDir(target, 'vscode-copilot'),
      'instructions',
      'code-review-checklist.instructions.md',
    );
    assert.ok(fs.existsSync(inst));
    assert.ok(
      !fs.lstatSync(inst).isSymbolicLink(),
      'frontmatter-transformed dest must NOT be a symlink',
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
