#!/usr/bin/env bash
# post-merge-install.sh — sample post-merge hook
#
# Place at .git/hooks/post-merge.
# Runs `npm install` (or your project's equivalent) when the lockfile
# changes after a pull or merge.

set -euo pipefail

CHANGED=$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)

if echo "$CHANGED" | grep -q '^package-lock\.json$'; then
  echo "package-lock.json changed — running npm install."
  npm install
fi

if echo "$CHANGED" | grep -q '^pnpm-lock\.yaml$'; then
  echo "pnpm-lock.yaml changed — running pnpm install."
  pnpm install
fi

if echo "$CHANGED" | grep -q '^yarn\.lock$'; then
  echo "yarn.lock changed — running yarn install."
  yarn install
fi
