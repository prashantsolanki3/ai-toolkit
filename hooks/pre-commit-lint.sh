#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: pre-commit-lint
# description: Sample lint-staged pre-commit hook.
# author: ai-toolkit
# presets:
#   - quality-gates
# === end metadata ===

# pre-commit-lint.sh — sample pre-commit hook
#
# Place at .git/hooks/pre-commit (or wire via lint-staged / husky).
# Lints staged files. Exits non-zero if any issues found.

set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|jsx|tsx)$' || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

# Replace this with the project's lint command.
# Examples:
#   npx eslint $STAGED
#   ruff check $STAGED
#   gofmt -l $STAGED
echo "Linting staged files:"
echo "$STAGED"

# Sample no-op: fail if any staged file contains TODO without a tracking ID.
if echo "$STAGED" | xargs grep -nE '\bTODO\b(?!\([A-Z0-9-]+\))' 2>/dev/null; then
  echo "Found bare TODO. Use TODO(ISSUE-123) or remove."
  exit 1
fi

exit 0
