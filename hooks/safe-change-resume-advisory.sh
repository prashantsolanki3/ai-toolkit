#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: safe-change-resume-advisory
# description: SessionStart advisory — surface resumable safe-change work (worktrees + state files) so the next session continues instead of restarting
# author: ai-toolkit-dev-skills
# presets:
#   - dev-skills
# tools:
#   - claude-code
#   - kiro
# event: SessionStart
# === end metadata ===

set -euo pipefail

# safe-change-resume-advisory v1 — SessionStart advisory.
# Never blocks. Never exits non-zero. stderr is informational.
# Companion to skills/safe-change/SKILL.md "Resume protocol" section.

# Escape hatch.
if [ "${SAFE_CHANGE_RESUME_SKIP:-0}" = "1" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Only run inside a git working tree.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

WORKTREES_DIR=".claude/worktrees"
STATE_DIR=".claude/state"

# Quick exit if neither exists.
if [ ! -d "$WORKTREES_DIR" ] && [ ! -d "$STATE_DIR" ]; then
  exit 0
fi

# Collect non-stale resumable work.
RESUMABLE=()

# State files trump worktree scans — they tell us the exact step.
if [ -d "$STATE_DIR" ]; then
  for state_file in "$STATE_DIR"/*.json; do
    [ -f "$state_file" ] || continue
    branch=$(basename "$state_file" .json)
    # Extract step + pr without jq (small JSON, regex is enough).
    step=$(grep -o '"step"[[:space:]]*:[[:space:]]*"[^"]*"' "$state_file" 2>/dev/null \
      | sed 's/.*"\([^"]*\)"$/\1/' | head -1)
    next=$(grep -o '"next"[[:space:]]*:[[:space:]]*"[^"]*"' "$state_file" 2>/dev/null \
      | sed 's/.*"\([^"]*\)"$/\1/' | head -1)
    pr=$(grep -o '"pr"[[:space:]]*:[[:space:]]*[0-9]*' "$state_file" 2>/dev/null \
      | sed 's/.*:[[:space:]]*//' | head -1)

    # Skip terminal states.
    if [ "$step" = "merged" ]; then
      continue
    fi

    label="$branch (step: ${step:-unknown}, next: ${next:-unknown}"
    if [ -n "${pr:-}" ] && [ "$pr" != "null" ]; then
      label+=", PR #$pr"
    fi
    label+=")"
    RESUMABLE+=("$label")
  done
fi

# Bare worktrees (no state file) — useful but lower-signal.
if [ -d "$WORKTREES_DIR" ]; then
  for wt in "$WORKTREES_DIR"/*/; do
    [ -d "$wt" ] || continue
    slug=$(basename "$wt")
    # Skip agent-* worktrees (runtime managed).
    case "$slug" in
      agent-*) continue ;;
    esac
    # Skip if a state file already covered this branch.
    branch_state="$STATE_DIR/$slug.json"
    if [ -f "$branch_state" ]; then
      continue
    fi
    RESUMABLE+=("$slug (no state file — inspect git status / log to infer step)")
  done
fi

if [ "${#RESUMABLE[@]}" -eq 0 ]; then
  exit 0
fi

# Print advisory to stderr (informational, never blocks).
{
  echo ""
  echo "[safe-change-resume-advisory] Resumable safe-change work detected:"
  for item in "${RESUMABLE[@]}"; do
    echo "  - $item"
  done
  echo ""
  echo "  Read .claude/state/<branch>.json and continue from the recorded step."
  echo "  See skills/safe-change/SKILL.md → 'Resume protocol' for the decision tree."
  echo "  Set SAFE_CHANGE_RESUME_SKIP=1 to silence this advisory."
  echo ""
} >&2

exit 0
