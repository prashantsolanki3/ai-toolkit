#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: preserve-effort-max
# description: SessionStart hook — keep Claude Code pinned to "max" effort by restoring effortLevel in ~/.claude/settings.json after any CLI rewrite.
# author: ai-toolkit-dev-skills
# presets:
#   - dots-baseline
# tools:
#   - claude-code
# event: SessionStart
# === end metadata ===

# preserve-effort-max.sh — keep Claude Code pinned to "max" effort.
#
# Why: ~/.claude/settings.json gets rewritten by the Claude CLI whenever the
# user toggles plugins, edits permissions, or accepts a security prompt. These
# rewrites have historically dropped the `effortLevel` key (see Anthropic
# changelog: "Fixed `--effort` CLI flag being reset by unrelated settings
# writes on startup"). This hook restores it.
#
# Behaviour:
#   - Missing file               → create with {"effortLevel":"max"}
#   - Missing key                → add effortLevel: max
#   - Wrong value                → reset to max
#   - Already max                → no-op (mtime preserved)
#   - Malformed JSON             → exit 0 silently (don't clobber user data)
#
# Usage:
#   - Invoked from settings.json `hooks.SessionStart` on every Claude session.
#   - Safe to run manually:  ~/.claude/hooks/preserve-effort-max.sh
#
# Exit code: always 0. Hooks should never block session start; if we can't
# fix it, the user already has the same broken state they had before.
set -u

# Hooks must never fail if HOME is unavailable in the environment. Without a
# usable HOME we have nothing to repair, so exit cleanly.
[ -n "${HOME:-}" ] || exit 0

SETTINGS="${HOME}/.claude/settings.json"

# Need python3 — present on every dev box we target. Bail silently if not.
command -v python3 >/dev/null 2>&1 || exit 0

mkdir -p "$(dirname "$SETTINGS")" 2>/dev/null || exit 0

python3 - "$SETTINGS" <<'PY' || true
import json, os, sys

path = sys.argv[1]
target_level = "max"

# Load (or seed) settings. If the file is malformed, leave it alone — the user
# may be mid-edit, and clobbering their JSON would be worse than skipping the
# repair.
if os.path.exists(path):
    try:
        with open(path, "r") as fp:
            data = json.load(fp)
        if not isinstance(data, dict):
            sys.exit(0)
    except Exception:
        sys.exit(0)
else:
    data = {}

if data.get("effortLevel") == target_level:
    sys.exit(0)  # idempotent — preserve mtime

data["effortLevel"] = target_level

# Atomic write via tmp + rename. Resolve symlinks first so we update the
# real target file (e.g. the dots repo copy in `link` mode) rather than
# clobbering the symlink itself with a regular file. Swallow write errors
# (permission denied, disk full, rename failure) so the hook never blocks
# session start — the user keeps the same state they already had.
try:
    real_path = os.path.realpath(path)
    tmp = real_path + ".tmp"
    with open(tmp, "w") as fp:
        json.dump(data, fp, indent=2)
        fp.write("\n")
    os.replace(tmp, real_path)
except Exception:
    sys.exit(0)
PY

# Hooks must never block SessionStart, regardless of the python subprocess's
# exit code. The `|| true` on the heredoc above plus this explicit exit belt-
# and-braces that guarantee.
exit 0
