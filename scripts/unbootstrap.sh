#!/usr/bin/env bash
# scripts/unbootstrap.sh — tear down every bootstrap artefact in this workspace.
#
# Two passes:
#   1. `ai-toolkit remove --all` — the accounted path. Walks each tool's
#      lockfile and removes only assets it placed (so user-added siblings
#      survive). Leaves no trace when run against a clean install.
#   2. Bulldoze surviving orphans — when an earlier run wiped lockfiles
#      out-of-band (manual `rm -rf .claude/`, etc.), `remove --all` has
#      nothing to act on, so files placed *outside* those dirs (e.g.
#      .mcp.json at the project root, .vscode/mcp.json) get stranded.
#      Pass 2 enumerates every workspace path declared in config/tools.json
#      (defaultTarget.workspace + mcpConfig.file.workspace) and removes
#      whatever still exists.

set -euo pipefail

cd "$(dirname "$0")/.."

# Pass 1: the accounted path.
node bin/cli.js remove --all || true

# Pass 2: enumerate every workspace path the toolkit could possibly place
# under, and rm -rf any that survived. Reads config/tools.json so adding a
# new tool requires no edits to this script.
PATHS=$(node -e '
const tools = require("./config/tools.json").tools;
const out = new Set();
for (const tool of Object.values(tools)) {
  const ws = tool.defaultTarget && tool.defaultTarget.workspace;
  if (ws && !ws.startsWith("~")) out.add(ws.split("/")[0]);
  const mcp = tool.mcpConfig && tool.mcpConfig.file && tool.mcpConfig.file.workspace;
  if (mcp && !mcp.startsWith("~")) out.add(mcp.split("/")[0]);
}
console.log([...out].join("\n"));
')

orphans=()
for p in $PATHS; do
  if [ -e "$p" ]; then
    orphans+=("$p")
  fi
done

if [ ${#orphans[@]} -gt 0 ]; then
  echo "→ bulldozing orphan workspace paths (lockfile-less leftovers):"
  for p in "${orphans[@]}"; do
    echo "  rm -rf $p"
    rm -rf "$p"
  done
fi

echo "✓ Unbootstrap complete."
