#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: safe-change-checkpoint-state
# description: PostToolUse — auto-write .claude/state/<branch>.json after every git commit on a safe-change worktree branch; infers step from the commit message
# author: ai-toolkit-dev-skills
# presets:
#   - dev-skills
# tools:
#   - claude-code
# event: PostToolUse
# matcher: Bash
# === end metadata ===

set -euo pipefail

# safe-change-checkpoint-state v1 — PostToolUse on Bash.
# After a successful `git commit` on a `.claude/worktrees/<slug>/` branch,
# write/update `.claude/state/<branch>.json` so the resume protocol in
# skills/safe-change/SKILL.md has a usable artefact without the agent
# having to remember to write it.
# Never blocks. Never exits non-zero. stderr is informational.

# Escape hatch.
if [ "${SAFE_CHANGE_CHECKPOINT_SKIP:-0}" = "1" ]; then
  exit 0
fi

# Read the tool input from stdin (Claude Code passes JSON to PostToolUse hooks).
TOOL_INPUT=$(cat 2>/dev/null || true)

# Only act on Bash tool calls that ran `git commit ...`.
case "$TOOL_INPUT" in
  *'"git commit'*) : ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Must be in a git working tree.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Resolve current branch (skip if detached HEAD).
BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
[ -n "${BRANCH:-}" ] || exit 0

# Only auto-checkpoint for branches that live in a safe-change worktree.
# Heuristic: the worktree path contains `.claude/worktrees/`.
WORKTREE_PATH=$(git rev-parse --show-toplevel 2>/dev/null || true)
case "$WORKTREE_PATH" in
  */.claude/worktrees/*) : ;;
  *) exit 0 ;;
esac

# Get the latest commit's SHA + subject.
SHA=$(git rev-parse HEAD 2>/dev/null || true)
SUBJECT=$(git log -1 --pretty=%s 2>/dev/null || true)
[ -n "${SHA:-}" ] || exit 0

# Infer the step from the commit subject. We match only properly-formed
# conventional wip(...) prefixes — not loose substrings — so commit subjects
# containing words like "simplify" don't trigger the impl branch.
# Acceptable shapes:
#   wip(<scope>): RED ...              → step="RED tests committed"
#   wip(<scope>): impl ...             → step="impl committed"
#   wip(<scope>): implementation ...   → step="impl committed"
#   wip(<scope>): docs ...             → step="docs synced"
#   anything else (feat/fix/chore/...) → step="committed"
STEP="committed"
NEXT="push + PR"
case "$SUBJECT" in
  "wip("*"): RED"*|"wip("*"): RED:"*)               STEP="RED tests committed"; NEXT="implement" ;;
  "wip("*"): impl"|"wip("*"): impl "*|"wip("*"): impl:"*) STEP="impl committed"; NEXT="green check + docs" ;;
  "wip("*"): implementation"|"wip("*"): implementation "*) STEP="impl committed"; NEXT="green check + docs" ;;
  "wip("*"): docs"|"wip("*"): docs "*|"wip("*"): docs:"*)  STEP="docs synced"; NEXT="push + PR" ;;
esac

# State files live in the MAIN repo's .claude/state/, NOT the worktree's
# — that way the SessionStart advisory (which runs in the main repo) can
# discover every pending checkpoint across every worktree in one place.
# `git rev-parse --git-common-dir` resolves to the main repo's .git dir
# (the symlink target for worktrees); its parent is the main repo root.
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null || true)
[ -n "${GIT_COMMON_DIR:-}" ] || exit 0
# Resolve to absolute path (git can return relative).
case "$GIT_COMMON_DIR" in
  /*) ABS_COMMON_DIR="$GIT_COMMON_DIR" ;;
  *)  ABS_COMMON_DIR=$(cd "$GIT_COMMON_DIR" 2>/dev/null && pwd) || exit 0 ;;
esac
MAIN_REPO_DIR=$(dirname "$ABS_COMMON_DIR")
STATE_DIR="$MAIN_REPO_DIR/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

# Filename encoding: branches contain '/' which isn't a valid filename char.
# Convention shared with safe-change-resume-advisory.sh + SKILL.md:
#     branch  feat/foo  -->  filename  feat___foo.json
# The `branch` field IN the JSON is always the canonical real branch name.
ENCODED_BRANCH=$(printf '%s' "$BRANCH" | sed 's@/@___@g')
STATE_FILE="$STATE_DIR/${ENCODED_BRANCH}.json"

# Write the JSON. Sanitise SUBJECT for the file by stripping quotes.
SUBJECT_ESC=${SUBJECT//\\/\\\\}
SUBJECT_ESC=${SUBJECT_ESC//\"/\\\"}
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")

cat > "$STATE_FILE" <<EOF
{
  "branch": "$BRANCH",
  "step": "$STEP",
  "next": "$NEXT",
  "sha": "$SHA",
  "last_subject": "$SUBJECT_ESC",
  "ts": "$TS"
}
EOF

# Quiet success — no chatter on every commit.
exit 0
