#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d -t ai-toolkit-smoke-XXXXXX)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Smoke testing in $TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/test-project"
cd "$TMPDIR/test-project"

# Install the only preset the repo currently ships (skill-development).
node "$REPO_ROOT/bin/cli.js" install --preset skill-development --tool claude-code
test -f .claude/skills/skill-evaluator/SKILL.md
test -f .claude/agents/docs-maintainer.md
test -f .claude/commands/eval-skill.md
test -f .claude/commands/improve-skill.md
test -f .ai-toolkit-lock.json

node "$REPO_ROOT/bin/cli.js" installed
node "$REPO_ROOT/bin/cli.js" update --tool claude-code --dry-run
node "$REPO_ROOT/bin/cli.js" remove --tool claude-code --skills skill-evaluator
test ! -d .claude/skills/skill-evaluator

echo "✓ Smoke test passed"
