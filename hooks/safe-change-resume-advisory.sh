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

# Filename encoding: branches contain '/' which isn't a valid filename char.
# Convention shared with safe-change-checkpoint-state.sh + SKILL.md:
#     branch  feat/foo  -->  filename  feat___foo.json
# Display uses the `branch` field from the JSON payload, never the filename.
encode_branch() { printf '%s' "$1" | sed 's@/@___@g'; }

# State files trump worktree scans — they tell us the exact step.
# Parse each JSON via Python (one subprocess per file) so the extraction is
# robust to value ordering, missing keys, and embedded quotes. Errors are
# best-effort and never abort the hook (set -e contract).
SEEN_BRANCHES=""
if [ -d "$STATE_DIR" ]; then
  for state_file in "$STATE_DIR"/*.json; do
    [ -f "$state_file" ] || continue

    # One Python call extracts everything; failures yield empty lines so the
    # surrounding shell stays under set -euo pipefail.
    parsed=$(python3 - "$state_file" 2>/dev/null <<'PYEOF' || true
import json, sys
try:
    with open(sys.argv[1]) as f:
        d = json.load(f)
    print(d.get("branch", "") or "")
    print(d.get("step", "") or "")
    print(d.get("next", "") or "")
    pr = d.get("pr", "")
    print(pr if pr not in (None, "null") else "")
except Exception:
    print(""); print(""); print(""); print("")
PYEOF
    )

    branch=$(printf '%s\n' "$parsed" | sed -n '1p')
    step=$(printf '%s\n' "$parsed" | sed -n '2p')
    next=$(printf '%s\n' "$parsed" | sed -n '3p')
    pr=$(printf '%s\n' "$parsed" | sed -n '4p')

    # Skip empty states.
    [ -n "${branch:-}" ] || continue

    # Record that we saw this branch so the worktree-scan loop doesn't
    # re-list it as "no state file" — even when the state is terminal.
    SEEN_BRANCHES="${SEEN_BRANCHES}|${branch}|"

    # Skip terminal states from the RESUMABLE list (worktree may still exist
    # awaiting `/clean-gone` but it's not actually resumable work).
    [ "$step" = "merged" ] && continue

    label="$branch (step: ${step:-unknown}, next: ${next:-unknown}"
    if [ -n "${pr:-}" ]; then
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
    # Resolve the worktree's actual branch (the slug is just the dir name).
    branch=$(git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
    [ -n "${branch:-}" ] || branch="$slug"
    # Skip if a state file already covered this branch (de-dupe via the
    # cached SEEN_BRANCHES list from the loop above).
    case "$SEEN_BRANCHES" in
      *"|${branch}|"*) continue ;;
    esac
    RESUMABLE+=("$branch (worktree: $wt — no state file, inspect git status/log)")
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
