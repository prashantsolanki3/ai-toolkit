import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolDir } from '../helpers/tool-paths.js';

// bootstrap.sh runs the REAL CLI binary, which reads from its own
// __dirname/.. SOURCE_ROOT — we can't redirect to a fake fixture here.
// Assertions check against the assets actually shipped (skill-development
// preset: skill-evaluator, docs-maintainer, eval-skill, improve-skill).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// scripts/bootstrap.sh is the contributor-facing entry into self-hosting
// the toolkit. It's hardcoded to write at the repo root, so to test it
// safely we copy the script (and its dependencies) into a tmp project
// and invoke it there with the real toolkit pointed at via the cli.

test('bootstrap script produces a working .claude/ tree with symlinked skills', () => {
  // Run the real CLI against a tmp target. Asserts against the actually
  // shipped assets (skill-evaluator skill, docs-maintainer agent,
  // eval-skill command).
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
        '--skills', 'skill-evaluator',
        '--agents', 'docs-maintainer',
        '--commands', 'eval-skill',
      ],
      { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
    );
    assert.equal(result.status, 0, `install failed: ${result.stderr}`);

    const dir = toolDir(target, 'claude-code');
    // Skills are symlinked (dir→dir, no transform)
    const skill = path.join(dir, 'skills', 'skill-evaluator');
    assert.ok(fs.lstatSync(skill).isSymbolicLink(), 'skill should be a symlink');

    // Agent file is symlinked (dir→file via sourceFile, no transform)
    const agent = path.join(dir, 'agents', 'docs-maintainer.md');
    assert.ok(fs.lstatSync(agent).isSymbolicLink(), 'agent should be a symlink');

    // Command file is symlinked (file→file, no transform)
    const cmd = path.join(dir, 'commands', 'eval-skill.md');
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
        '--skills', 'skill-evaluator',
      ],
      { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } },
    );
    assert.equal(result.status, 0, `install failed: ${result.stderr}`);

    const inst = path.join(
      toolDir(target, 'vscode-copilot'),
      'instructions',
      'skill-evaluator.instructions.md',
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
