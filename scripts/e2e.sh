#!/usr/bin/env bash
# scripts/e2e.sh — end-to-end install via `npx` from the local toolkit path,
# simulating the experience a contributor will have when they `npx
# git+ssh://...` it from GitHub. Runs in a clean temp directory; cleans up
# on exit.
#
# Make sure nothing in this script depends on git history, GitHub access,
# or anything outside the repo. The asset names below are the ones the
# real repo currently ships (skill-development preset).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH=$(mktemp -d -t ai-toolkit-e2e-XXXXXX)

cleanup() {
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

echo "==> repo:    $REPO_ROOT"
echo "==> scratch: $SCRATCH"
echo ""

# ---------- 1. install with --dry-run, expect nothing to be written
echo "[1/9] install --dry-run plans without writing (--target defaults to CWD)"
cd "$SCRATCH"
mkdir project-a && cd project-a
node "$REPO_ROOT/bin/cli.js" install --tool claude-code --preset skill-development --dry-run > /tmp/aitk-e2e-dryrun.log
test ! -d .claude
grep -q 'Would install' /tmp/aitk-e2e-dryrun.log
grep -q 'copy skills' /tmp/aitk-e2e-dryrun.log
echo "    ok — dry-run wrote nothing, plan logged"

# ---------- 2. real install, expect the skill-development tree under .claude/
echo ""
echo "[2/9] install --preset skill-development --tool claude-code (lands in .claude/)"
node "$REPO_ROOT/bin/cli.js" install --tool claude-code --preset skill-development
test -f .claude/skills/skill-evaluator/SKILL.md
test -f .claude/agents/docs-maintainer.md
test -f .claude/commands/eval-skill.md
test -f .claude/commands/improve-skill.md
test -f .ai-toolkit-lock.json
echo "    ok — expected files present"

# ---------- 3. installed reports them (autodiscovers .claude/)
echo ""
echo "[3/9] installed shows what's there (no --tool — autodiscovers)"
node "$REPO_ROOT/bin/cli.js" installed | grep -q skill-evaluator
echo "    ok"

# ---------- 4. update against an unchanged source is a no-op
echo ""
echo "[4/9] update --dry-run finds nothing to do"
node "$REPO_ROOT/bin/cli.js" update --dry-run > /tmp/aitk-e2e-update.log
! grep -q 'would update' /tmp/aitk-e2e-update.log || (echo "expected no updates, got: $(cat /tmp/aitk-e2e-update.log)"; exit 1)
echo "    ok"

# ---------- 5. non-destructive: pre-existing file is preserved
echo ""
echo "[5/9] re-install over hand-written content skips with a warning"
cd "$SCRATCH"
mkdir project-b && cd project-b
mkdir -p .claude/commands
echo "MY OWN COMMAND BODY" > .claude/commands/eval-skill.md
node "$REPO_ROOT/bin/cli.js" install --tool claude-code --commands eval-skill > /tmp/aitk-e2e-nondes.log 2>&1
grep -q 'destination already exists' /tmp/aitk-e2e-nondes.log
test "$(cat .claude/commands/eval-skill.md)" = "MY OWN COMMAND BODY"
echo "    ok — user content preserved"

# ---------- 6. --force overrides
echo ""
echo "[6/9] install --force overwrites the hand-written content"
node "$REPO_ROOT/bin/cli.js" install --tool claude-code --commands eval-skill --force
test "$(cat .claude/commands/eval-skill.md)" != "MY OWN COMMAND BODY"
echo "    ok"

# ---------- 7. install for a different tool (cursor) lands at .cursor/rules with proper frontmatter
echo ""
echo "[7/9] cursor install: skill -> .cursor/rules/<name>.mdc with Cursor frontmatter"
cd "$SCRATCH"
mkdir project-c && cd project-c
node "$REPO_ROOT/bin/cli.js" install --tool cursor --skills skill-evaluator
test -f .cursor/rules/skill-evaluator.mdc
head -5 .cursor/rules/skill-evaluator.mdc | grep -q 'description:'
head -5 .cursor/rules/skill-evaluator.mdc | grep -q 'globs:'
head -5 .cursor/rules/skill-evaluator.mdc | grep -q 'alwaysApply:'
echo "    ok — file has Cursor-shape frontmatter (description / globs / alwaysApply)"

# ---------- 8. remove tears down everything tracked
echo ""
echo "[8/9] remove --all (--tool cursor) clears every tracked asset and updates the lockfile"
node "$REPO_ROOT/bin/cli.js" remove --tool cursor --all
test ! -f .cursor/rules/skill-evaluator.mdc
echo "    ok"

# ---------- 9. install without --tool installs for every tool
echo ""
echo "[9/9] install (no --tool) populates every supported tool's subdir"
cd "$SCRATCH"
mkdir project-d && cd project-d
node "$REPO_ROOT/bin/cli.js" install --skills skill-evaluator > /tmp/aitk-e2e-all.log 2>&1
test -d .claude/skills/skill-evaluator                      # claude-code
test -f .cursor/rules/skill-evaluator.mdc                   # cursor
test -d .agent/skills/skill-evaluator                       # antigravity
test -d .gemini/skills/skill-evaluator                      # gemini-cli
test -f .github/instructions/skill-evaluator.instructions.md  # vscode-copilot
test -f .kiro/steering/skill-evaluator.md                   # kiro
grep -q 'already populated' /tmp/aitk-e2e-all.log           # dedup ran (copilot-cli or kiro-cli)
grep -q 'Installed for ' /tmp/aitk-e2e-all.log              # summary printed
echo "    ok — every distinct tool destination is populated"

echo ""
echo "============================================================"
echo " ✓ end-to-end checks passed"
echo "   repo is healthy enough to share — but still walk"
echo "   docs/verification-matrix.md to confirm each tool actually"
echo "   ingests the installed assets in its UI."
echo "============================================================"
