#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: safe-change-guard-push-main
# description: PreToolUse — block `git push origin main` / `git push origin master` / `git push` from a main/master checkout. PR-only is one of safe-change's hard rules.
# author: ai-toolkit-dev-skills
# presets:
#   - dev-skills
# tools:
#   - claude-code
# event: PreToolUse
# matcher: Bash
# === end metadata ===

set -euo pipefail

# safe-change-guard-push-main v1 — PreToolUse on Bash.
# Blocks any direct push to main/master. PR-only is the SDLC contract.
# Catches: `git push origin main`, `git push origin master`, `git push` from
# a main/master checkout. Also catches the explicit force variants.
#
# Exit codes:
#   0  — allow
#   2  — block (Claude Code treats non-zero PreToolUse as a denial)

# Escape hatch.
if [ "${SAFE_CHANGE_GUARD_PUSH_SKIP:-0}" = "1" ]; then
  exit 0
fi

TOOL_INPUT=$(cat 2>/dev/null || true)
COMMAND=$(echo "$TOOL_INPUT" \
  | python3 -c 'import json,sys
try:
  print(json.loads(sys.stdin.read()).get("command",""))
except Exception:
  pass' 2>/dev/null || true)

[ -n "${COMMAND:-}" ] || exit 0

# Only police git push.
case "$COMMAND" in
  *"git push"*) : ;;
  *) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_DIR" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

BLOCKED=0
REASON=""

# Explicit `git push <remote> main` / master.
case " $COMMAND " in
  *" git push "*" main"*|*" git push "*":main"*) BLOCKED=1; REASON="explicit push to main" ;;
  *" git push "*" master"*|*" git push "*":master"*) BLOCKED=1; REASON="explicit push to master" ;;
  *" git push "*" main:"*) BLOCKED=1; REASON="explicit push to main (refspec)" ;;
  *" git push "*" master:"*) BLOCKED=1; REASON="explicit push to master (refspec)" ;;
esac

# `git push` (bare) from a main/master checkout pushes the current branch
# upstream — if upstream is main/master, that's the same as explicit push.
if [ "$BLOCKED" -eq 0 ]; then
  CURRENT_BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  case "$CURRENT_BRANCH" in
    main|master)
      # If the command is bare-ish (no refspec), still block.
      case "$COMMAND" in
        *"git push"*"$CURRENT_BRANCH"*) ;;  # already covered above
        *"git push -u"*|*"git push --set-upstream"*) BLOCKED=1; REASON="push from $CURRENT_BRANCH checkout" ;;
        *"git push origin"*|*"git push"*$'\n'*|*"git push;"*|*"git push&"*) BLOCKED=1; REASON="push from $CURRENT_BRANCH checkout" ;;
      esac
      case "$COMMAND" in
        *"git push") BLOCKED=1; REASON="push from $CURRENT_BRANCH checkout (bare push)" ;;
      esac
    ;;
  esac
fi

if [ "$BLOCKED" -eq 1 ]; then
  {
    echo ""
    echo "[safe-change-guard-push-main] BLOCKED: $REASON"
    echo ""
    echo "  PR-only is the SDLC contract. Direct push to main/master bypasses review."
    echo "  Hard rule from skills/safe-change/SKILL.md."
    echo ""
    echo "  Push your branch instead:"
    echo "    git checkout -b <type>/<slug>"
    echo "    git push -u origin <type>/<slug>"
    echo "    gh pr create --base main --head <type>/<slug> ..."
    echo ""
    echo "  Override (e.g. seeding a fresh repo's main):"
    echo "    SAFE_CHANGE_GUARD_PUSH_SKIP=1 git push ..."
    echo ""
  } >&2
  exit 2
fi

exit 0
