#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: safe-change-guard-add-all
# description: PreToolUse — block `git add -A`, `git add .`, `git add -u` (sweeps in .env, outputs/, agent worktrees). One of safe-change's hard rules.
# author: ai-toolkit-dev-skills
# presets:
#   - dev-skills
# tools:
#   - claude-code
# event: PreToolUse
# matcher: Bash
# === end metadata ===

set -euo pipefail

# safe-change-guard-add-all v1 — PreToolUse on Bash.
# Blocks the most common safe-change rule violation: `git add -A` / `git add .`
# pulls in untracked secrets (.env), generated outputs/, agent worktrees, etc.
# Force the agent to `git add <specific paths>` instead.
#
# Exit codes:
#   0  — allow (no `git add` detected, or specific paths only)
#   2  — block (Claude Code treats non-zero PreToolUse as a denial)

# Escape hatch — owner overrides via env var.
if [ "${SAFE_CHANGE_GUARD_ADD_SKIP:-0}" = "1" ]; then
  exit 0
fi

# Read the tool input from stdin.
TOOL_INPUT=$(cat 2>/dev/null || true)

# Extract the command string. Claude Code Bash payload looks like:
#   {"command":"git add -A","description":"..."}
COMMAND=$(echo "$TOOL_INPUT" \
  | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read()).get("command",""))
except Exception:
  pass' 2>/dev/null || true)

# If we couldn't parse, fall through silently — never break unrelated tools.
[ -n "${COMMAND:-}" ] || exit 0

# Only police `git add` invocations.
case "$COMMAND" in
  *"git add "*|*"git add"*) : ;;
  *) exit 0 ;;
esac

# Block the sweeping forms. Use word-boundary-ish patterns to avoid false
# positives on filenames like `add-tests`.
BLOCKED=0
case " $COMMAND " in
  *" git add -A "*|*" git add -A;"*|*" git add -A&"*) BLOCKED=1 ;;
  *" git add . "*|*" git add .;"*|*" git add .&"*|*" git add ."*$'\n'*) BLOCKED=1 ;;
  *" git add -u "*|*" git add -u;"*|*" git add -u&"*) BLOCKED=1 ;;
  *" git add --all "*|*" git add --all;"*) BLOCKED=1 ;;
  *" git add --update "*|*" git add --update;"*) BLOCKED=1 ;;
esac

# Trailing-at-end-of-line patterns (the patterns above need a trailing space).
case "$COMMAND" in
  *"git add -A") BLOCKED=1 ;;
  *"git add .") BLOCKED=1 ;;
  *"git add -u") BLOCKED=1 ;;
  *"git add --all") BLOCKED=1 ;;
  *"git add --update") BLOCKED=1 ;;
esac

if [ "$BLOCKED" -eq 1 ]; then
  {
    echo ""
    echo "[safe-change-guard-add-all] BLOCKED: 'git add -A' / 'git add .' / 'git add -u' / '--all' / '--update'"
    echo ""
    echo "  Sweeps in .env, outputs/, agent worktrees, generated artefacts."
    echo "  Hard rule from skills/safe-change/SKILL.md (Rules section)."
    echo ""
    echo "  Use selective staging instead:"
    echo "    git add <specific/path1> <specific/path2>"
    echo ""
    echo "  Override (e.g. legitimate bulk stage in a sandbox dir):"
    echo "    SAFE_CHANGE_GUARD_ADD_SKIP=1 git add ..."
    echo ""
  } >&2
  exit 2
fi

exit 0
