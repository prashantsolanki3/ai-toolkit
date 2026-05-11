#!/usr/bin/env bash
# scripts/bootstrap.sh — set up the toolkit's own per-tool directories
# (.claude/, .cursor/, .github/, .kiro/, ...) using the toolkit itself.
# Run after cloning the repo so contributors immediately get the
# maintainer's skills/agents/commands in whichever tool they use.
#
# The list of assets to install is derived from manifest.json, so adding
# a new skill or agent only requires running `make register` once — no
# bootstrap.sh edits.
#
# Generated directories are gitignored. Re-run after editing source
# assets to refresh them.

set -euo pipefail

cd "$(dirname "$0")/.."

# Enumerate every asset of every type that the toolkit currently ships.
SKILLS=$(node -e "console.log(Object.keys(require('./manifest.json').skills).join(','))")
AGENTS=$(node -e "console.log(Object.keys(require('./manifest.json').agents).join(','))")
COMMANDS=$(node -e "console.log(Object.keys(require('./manifest.json').commands).join(','))")
HOOKS=$(node -e "console.log(Object.keys(require('./manifest.json').hooks).join(','))")
RULES=$(node -e "console.log(Object.keys(require('./manifest.json').rules).join(','))")
MCP=$(node -e "console.log(Object.keys(require('./manifest.json').mcp || {}).join(','))")

echo "→ Bootstrapping every configured tool with every shipped asset"
echo "  skills:   $SKILLS"
echo "  agents:   $AGENTS"
echo "  commands: $COMMANDS"
echo "  hooks:    $HOOKS"
echo "  rules:    $RULES"
echo "  mcp:      $MCP"
echo ""

# No --tool means: install for every tool in config/tools.json.
# Each tool picks up only the asset types it supports; unsupported types
# drop out with a warning per tool.
node bin/cli.js install \
  --link --force \
  --skills "$SKILLS" \
  --agents "$AGENTS" \
  --commands "$COMMANDS" \
  --hooks "$HOOKS" \
  --rules "$RULES" \
  --mcp "$MCP"

echo ""
echo "✓ Bootstrap complete. Generated trees:"
for d in .claude .cursor .github .kiro .gemini .agent; do
  if [ -d "$d" ]; then
    echo "  $d/"
  fi
done
echo ""
echo "  These directories are gitignored. Re-run 'make bootstrap' after"
echo "  editing source assets to refresh them."
