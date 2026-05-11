import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getCurrentSha, isGitRepo } from '../../src/lib/git-ops.js';
import { createTmpProject, cleanupTmpProject } from '../helpers/tmp-project.js';

function git(args, cwd) {
  execFileSync('git', args, {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@e' },
  });
}

function initRepoWithCommit(dir) {
  git(['init', '-q', '-b', 'main'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(['add', '.'], dir);
  git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init'], dir);
}

test('isGitRepo() returns true inside a git repo', () => {
  const dir = createTmpProject();
  try {
    initRepoWithCommit(dir);
    assert.equal(isGitRepo(dir), true);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('isGitRepo() returns false outside a git repo', () => {
  const dir = createTmpProject();
  try {
    assert.equal(isGitRepo(dir), false);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('getCurrentSha() returns commit SHA for HEAD', () => {
  const dir = createTmpProject();
  try {
    initRepoWithCommit(dir);
    const sha = getCurrentSha(dir);
    assert.match(sha, /^[a-f0-9]{40}$/);
  } finally {
    cleanupTmpProject(dir);
  }
});

test('getCurrentSha() throws outside a git repo', () => {
  const dir = createTmpProject();
  try {
    assert.throws(() => getCurrentSha(dir));
  } finally {
    cleanupTmpProject(dir);
  }
});
