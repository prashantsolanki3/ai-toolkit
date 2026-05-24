#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: branch-from-main
# description: SessionStart advisory — warn when local main is behind origin/main before any branching
# author: ai-toolkit-dev-skills
# presets:
#   - dev-skills
# tools:
#   - claude-code
#   - kiro
# event: SessionStart
# === end metadata ===

set -euo pipefail

# branch-from-main v1 — SessionStart advisory.
# Never blocks. Never exits non-zero. stderr is informational.
# v2 (future ADR) adds PreToolUse opt-in with BRANCH_FROM_MAIN_SKIP=1 escape hatch.

# Escape hatch (v2 forward-compat; in v1 it short-circuits the whole hook).
if [ "${BRANCH_FROM_MAIN_SKIP:-0}" = "1" ]; then
  exit 0
fi

# Resolve the project root.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Only run inside a git working tree.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Skip silently in detached HEAD.
HEAD_REF="$(git symbolic-ref --quiet HEAD 2>/dev/null || true)"
if [ -z "$HEAD_REF" ]; then
  exit 0
fi

# Skip silently if there is no `origin` remote.
git remote get-url origin >/dev/null 2>&1 || exit 0

# Determine upstream main ref name. Default to main; fall back to master.
MAIN_BRANCH="main"
if ! git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  if git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then
    MAIN_BRANCH="master"
  else
    exit 0
  fi
fi

# Skip if local mainline ref doesn't exist.
if ! git rev-parse --verify --quiet "refs/heads/${MAIN_BRANCH}" >/dev/null; then
  exit 0
fi

# Fetch quietly, time-bound so a hung network doesn't stall session start.
if command -v timeout >/dev/null 2>&1; then
  timeout 5 git fetch --quiet origin "$MAIN_BRANCH" 2>/dev/null || {
    echo "branch-from-main: (offline — skipped main freshness check)" >&2
    exit 0
  }
else
  git fetch --quiet origin "$MAIN_BRANCH" 2>/dev/null || {
    echo "branch-from-main: (offline — skipped main freshness check)" >&2
    exit 0
  }
fi

# Count commits local main is behind origin/main.
BEHIND="$(git rev-list --count "${MAIN_BRANCH}..origin/${MAIN_BRANCH}" 2>/dev/null || echo 0)"

if [ "${BEHIND:-0}" -gt 0 ]; then
  echo "branch-from-main: local ${MAIN_BRANCH} is ${BEHIND} commit(s) behind origin/${MAIN_BRANCH} — run 'git pull --ff-only origin ${MAIN_BRANCH}' before branching." >&2
fi

exit 0
