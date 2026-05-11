#!/usr/bin/env bash
# Sample precheck helper invoked by the comprehensive-review skill.
# Inputs: a git diff (default: HEAD vs the merge base of main).
# Output: a short markdown summary listing structural flags before the
# reviewer dives into design.

set -euo pipefail

BASE_REF="${1:-main}"

CHANGED=$(git diff --name-only "$BASE_REF"...HEAD)
if [ -z "$CHANGED" ]; then
  echo "No files changed against $BASE_REF."
  exit 0
fi

echo "### Pre-review checks"
echo ""
echo "Files changed:"
echo "$CHANGED" | sed 's/^/- /'
echo ""

# Surface anything that smells like a debug leftover.
if echo "$CHANGED" | xargs grep -nE '\b(TODO|FIXME|XXX|console\.log|dbg!|print\()' 2>/dev/null; then
  echo ""
  echo "Found potential debug/TODO leftovers. Investigate before review."
fi
