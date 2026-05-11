#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d -t ai-toolkit-smoke-XXXXXX)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Smoke testing in $TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR/test-project"
cd "$TMPDIR/test-project"

node "$REPO_ROOT/bin/cli.js" install --preset backend-essentials --tool claude-code --target .claude
test -f .claude/skills/api-endpoint-design/SKILL.md
test -f .claude/agents/senior-architect.md
test -f .claude/commands/summarize-diff.md
test -f .claude/.ai-toolkit-lock.json

node "$REPO_ROOT/bin/cli.js" installed
node "$REPO_ROOT/bin/cli.js" update --dry-run
node "$REPO_ROOT/bin/cli.js" remove --skills api-endpoint-design
test ! -d .claude/skills/api-endpoint-design

echo "✓ Smoke test passed"
