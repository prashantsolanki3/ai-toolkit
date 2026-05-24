import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('install lands the unified lockfile at the project root, NOT inside .claude/', () => {
  const tmp = createTmpProject();
  try {
    execFileSync(
      'node',
      [path.join(REPO_ROOT, 'bin', 'cli.js'), 'install', '--tool', 'claude-code', '--preset', 'skill-development', '--target', tmp],
      { cwd: REPO_ROOT, stdio: 'pipe' },
    );

    assert.ok(
      fs.existsSync(path.join(tmp, '.ai-toolkit-lock.json')),
      'unified v2.0 lockfile must exist at the project root',
    );
    assert.ok(
      !fs.existsSync(path.join(tmp, '.claude', '.ai-toolkit-lock.json')),
      'lockfile must NOT exist inside .claude/ (that is the v1-era path the cleanup scripts had drifted to)',
    );

    const lock = JSON.parse(fs.readFileSync(path.join(tmp, '.ai-toolkit-lock.json'), 'utf8'));
    assert.equal(lock.version, '2.0', 'lockfile schema must be v2.0');
    assert.ok(lock.tools && lock.tools['claude-code'], 'lockfile must record the claude-code tool');
  } finally {
    cleanupTmpProject(tmp);
  }
});
