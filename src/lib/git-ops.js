import { execFileSync } from 'node:child_process';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

export function isGitRepo(repoPath) {
  try {
    git(['rev-parse', '--git-dir'], repoPath);
    return true;
  } catch {
    return false;
  }
}

export function getCurrentSha(repoPath) {
  return git(['rev-parse', 'HEAD'], repoPath);
}

export function fetchLatest(repoPath, remote = 'origin') {
  git(['fetch', remote], repoPath);
}

export function getRemoteSha(repoPath, branch = 'main', remote = 'origin') {
  return git(['rev-parse', `${remote}/${branch}`], repoPath);
}
