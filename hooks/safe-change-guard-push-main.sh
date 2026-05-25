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

CURRENT_BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)

# Decide: does this push target main/master?
# We use shlex.split + a small Python helper so refspecs are parsed correctly
# and branch names like `main-fix` / `:main-fix` don't trigger false positives.
# The helper writes "BLOCK|<reason>" on stdout when the push should be
# blocked, otherwise nothing.
#
# Pass the command as an env var (NOT via stdin) — the heredoc IS stdin so
# any pipe would collide and Python would parse the script as the command.
DECISION=$(CURRENT_BRANCH="$CURRENT_BRANCH" GUARD_COMMAND="$COMMAND" python3 - <<'PYEOF' 2>/dev/null || true
import os, shlex, sys

try:
    cmd = os.environ.get("GUARD_COMMAND", "")
    argv = shlex.split(cmd)
except ValueError:
    sys.exit(0)

# Locate the `git push ...` segment. Operators like `&&` / `;` / `|` are
# preserved as separate tokens by shlex; walk left-to-right and reset when
# we hit one.
segments = []
current = []
for tok in argv:
    if tok in (";", "&&", "||", "|", "&"):
        if current:
            segments.append(current)
        current = []
    else:
        current.append(tok)
if current:
    segments.append(current)

PROTECTED = ("main", "master")
current_branch = os.environ.get("CURRENT_BRANCH", "") or ""

def refspec_target(spec: str) -> str:
    """For `local:remote` return `remote`; for `local` return `local`."""
    return spec.split(":", 1)[1] if ":" in spec else spec

for seg in segments:
    if len(seg) < 2 or seg[0] != "git" or seg[1] != "push":
        continue
    # Strip flags (anything starting with `-`) but keep their values' flag
    # markers — for git push the only flag that consumes a value is `-o` /
    # `--push-option=...` and its value is opaque, so dropping flags is safe.
    args = [t for t in seg[2:] if not t.startswith("-")]
    # Drop the `--` separator if present.
    args = [t for t in args if t != "--"]
    if not args:
        # Bare `git push`. Block iff currently on main/master.
        if current_branch in PROTECTED:
            print(f"BLOCK|bare push from {current_branch} checkout")
            sys.exit(0)
        continue
    # First non-flag arg is the remote; the rest are refspecs.
    remote = args[0]
    refspecs = args[1:]
    if not refspecs:
        # `git push <remote>` — push current branch upstream-mapped.
        if current_branch in PROTECTED:
            print(f"BLOCK|push from {current_branch} checkout to {remote}")
            sys.exit(0)
        continue
    for spec in refspecs:
        target = refspec_target(spec.lstrip("+"))
        if target in PROTECTED:
            print(f"BLOCK|explicit push to {target} via `{spec}`")
            sys.exit(0)
PYEOF
)

BLOCKED=0
REASON=""
case "$DECISION" in
  BLOCK\|*) BLOCKED=1; REASON="${DECISION#BLOCK|}" ;;
esac

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
