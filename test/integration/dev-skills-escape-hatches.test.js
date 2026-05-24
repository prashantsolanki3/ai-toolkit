import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('hook documents BRANCH_FROM_MAIN_SKIP=1 escape hatch and exits 0 when set (ADR-0005 decision 5)', () => {
  const hookPath = path.join(REPO_ROOT, 'hooks', 'branch-from-main.sh');
  const body = fs.readFileSync(hookPath, 'utf8');
  assert.match(body, /BRANCH_FROM_MAIN_SKIP/, 'hook must document the BRANCH_FROM_MAIN_SKIP escape hatch in its body');

  // Run the hook with the env var set; expect exit 0 even outside a git repo.
  const result = spawnSync('bash', [hookPath], {
    env: { ...process.env, BRANCH_FROM_MAIN_SKIP: '1' },
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `hook must exit 0 when BRANCH_FROM_MAIN_SKIP=1 (got ${result.status}, stderr: ${result.stderr})`);
});

test('clean-gone documents --dry-run; parallel-reviewers documents --scope', () => {
  const cleanGone = fs.readFileSync(path.join(REPO_ROOT, 'commands', 'clean-gone.md'), 'utf8');
  assert.match(cleanGone, /--dry-run/, 'commands/clean-gone.md must document the --dry-run flag');

  const parallel = fs.readFileSync(path.join(REPO_ROOT, 'commands', 'parallel-reviewers.md'), 'utf8');
  assert.match(parallel, /--scope/, 'commands/parallel-reviewers.md must document the --scope flag');
});

test('gh-project-sync and clean-gone bodies cite the three SMART_AGENTS env vars', () => {
  const ghSync = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'gh-project-sync', 'SKILL.md'), 'utf8');
  assert.match(ghSync, /SMART_AGENTS_PROJECT_OWNER/);
  assert.match(ghSync, /SMART_AGENTS_PROJECT_NUMBER/);

  const cleanGone = fs.readFileSync(path.join(REPO_ROOT, 'commands', 'clean-gone.md'), 'utf8');
  assert.match(cleanGone, /SMART_AGENTS_REPOS_ROOT/);
});
