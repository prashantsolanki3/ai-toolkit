#!/usr/bin/env bash
# Test suite for the four safe-change-* hooks shipped by the dev-skills preset.
# Run from the repo root: bash test/hooks/test_safe_change_hooks.sh

set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")"/../.. && pwd)/hooks"
PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

assert_exit() {
  # assert_exit <expected> <actual> <description>
  local expected="$1" actual="$2" desc="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected exit=$expected, got exit=$actual)"
    FAIL=$((FAIL + 1))
  fi
}

make_repo() {
  # make_repo <dir> [branch]
  local dir="$1" branch="${2:-feat/test}"
  rm -rf "$dir"
  mkdir -p "$dir" && cd "$dir"
  git init -q -b main
  git config user.email "test@example.com"
  git config user.name "Test"
  echo "init" > README.md
  git add README.md
  git commit -q -m "init"
  git checkout -q -b "$branch"
  pwd
}

call_hook() {
  # call_hook <hook> <command> <project_dir>
  # Returns exit code via $?
  local hook="$1" command="$2" pdir="$3"
  printf '{"command":%s,"description":"x"}' \
    "$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$command")" \
    | CLAUDE_PROJECT_DIR="$pdir" bash "$HOOKS_DIR/$hook" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# safe-change-guard-add-all
# ---------------------------------------------------------------------------
echo ""
echo "=== safe-change-guard-add-all ==="
TDIR=$(mktemp -d)
PDIR=$(cd "$TDIR" && make_repo "$TDIR/repo" "feat/test")

call_hook safe-change-guard-add-all.sh "git add -A" "$PDIR"; assert_exit 2 $? "blocks 'git add -A'"
call_hook safe-change-guard-add-all.sh "git add ." "$PDIR"; assert_exit 2 $? "blocks 'git add .'"
call_hook safe-change-guard-add-all.sh "git add -u" "$PDIR"; assert_exit 2 $? "blocks 'git add -u'"
call_hook safe-change-guard-add-all.sh "git add --all" "$PDIR"; assert_exit 2 $? "blocks 'git add --all'"
call_hook safe-change-guard-add-all.sh "git add --update" "$PDIR"; assert_exit 2 $? "blocks 'git add --update'"
call_hook safe-change-guard-add-all.sh "git add src/foo.py" "$PDIR"; assert_exit 0 $? "allows 'git add src/foo.py'"
call_hook safe-change-guard-add-all.sh "git add ./README.md" "$PDIR"; assert_exit 0 $? "allows 'git add ./README.md' (path, not bare .)"
call_hook safe-change-guard-add-all.sh "git status" "$PDIR"; assert_exit 0 $? "ignores non-add commands"
SAFE_CHANGE_GUARD_ADD_SKIP=1 \
  printf '{"command":"git add -A","description":"x"}' \
  | CLAUDE_PROJECT_DIR="$PDIR" SAFE_CHANGE_GUARD_ADD_SKIP=1 bash "$HOOKS_DIR/safe-change-guard-add-all.sh" >/dev/null 2>&1
assert_exit 0 $? "escape hatch SAFE_CHANGE_GUARD_ADD_SKIP=1 allows blocked form"

# ---------------------------------------------------------------------------
# safe-change-guard-push-main
# ---------------------------------------------------------------------------
echo ""
echo "=== safe-change-guard-push-main ==="
TDIR=$(mktemp -d)
# Set up a repo currently on `main`
PDIR=$(rm -rf "$TDIR/repo" && mkdir -p "$TDIR/repo" && cd "$TDIR/repo" && \
  git init -q -b main && git config user.email t@x && git config user.name T && \
  echo init > R && git add R && git commit -q -m init && pwd)

call_hook safe-change-guard-push-main.sh "git push origin main" "$PDIR"; assert_exit 2 $? "blocks 'git push origin main' (explicit)"
call_hook safe-change-guard-push-main.sh "git push origin master" "$PDIR"; assert_exit 2 $? "blocks 'git push origin master' (explicit)"
call_hook safe-change-guard-push-main.sh "git push origin HEAD:main" "$PDIR"; assert_exit 2 $? "blocks 'git push origin HEAD:main' (refspec)"
call_hook safe-change-guard-push-main.sh "git push origin +main" "$PDIR"; assert_exit 2 $? "blocks 'git push origin +main' (force prefix)"
call_hook safe-change-guard-push-main.sh "git push" "$PDIR"; assert_exit 2 $? "blocks bare 'git push' from main checkout"
call_hook safe-change-guard-push-main.sh "git push origin" "$PDIR"; assert_exit 2 $? "blocks 'git push origin' from main checkout"

# False-positive guards
call_hook safe-change-guard-push-main.sh "git push origin main-fix" "$PDIR"; assert_exit 0 $? "allows 'git push origin main-fix' (not exactly 'main')"
call_hook safe-change-guard-push-main.sh "git push origin HEAD:main-fix" "$PDIR"; assert_exit 0 $? "allows refspec to 'main-fix' (not 'main')"
call_hook safe-change-guard-push-main.sh "git push origin master-branch" "$PDIR"; assert_exit 0 $? "allows 'master-branch' (not exactly 'master')"
call_hook safe-change-guard-push-main.sh "git status" "$PDIR"; assert_exit 0 $? "ignores non-push commands"

# Now switch to a feature branch — bare push should be allowed
git -C "$PDIR" checkout -q -b feat/test
call_hook safe-change-guard-push-main.sh "git push" "$PDIR"; assert_exit 0 $? "allows bare 'git push' from feat/* checkout"
call_hook safe-change-guard-push-main.sh "git push origin feat/test" "$PDIR"; assert_exit 0 $? "allows 'git push origin feat/test'"

# Escape hatch
printf '{"command":"git push origin main","description":"x"}' \
  | CLAUDE_PROJECT_DIR="$PDIR" SAFE_CHANGE_GUARD_PUSH_SKIP=1 bash "$HOOKS_DIR/safe-change-guard-push-main.sh" >/dev/null 2>&1
assert_exit 0 $? "escape hatch SAFE_CHANGE_GUARD_PUSH_SKIP=1 allows blocked form"

# ---------------------------------------------------------------------------
# safe-change-checkpoint-state
# ---------------------------------------------------------------------------
echo ""
echo "=== safe-change-checkpoint-state ==="

# Set up a MAIN repo, then create a real git worktree under .claude/worktrees/.
# State files should land in MAIN_REPO/.claude/state/ (NOT inside the worktree)
# so the SessionStart advisory can discover them.
TDIR=$(mktemp -d)
MAIN_REPO="$TDIR/main-repo"
mkdir -p "$MAIN_REPO"
cd "$MAIN_REPO"
git init -q -b main 2>/dev/null
git config user.email t@x && git config user.name T
echo init > R && git add R && git commit -q -m "init"
# Create a real worktree at .claude/worktrees/test-slug on a feat/test-slug branch.
git worktree add -b "feat/test-slug" ".claude/worktrees/test-slug" main -q 2>/dev/null
WT_DIR="$MAIN_REPO/.claude/worktrees/test-slug"
cd "$WT_DIR"
echo work > R && git add R && git commit -q -m "wip(scope): RED failing tests for thing"

# Run hook from the worktree dir
printf '{"command":"git commit -m \\"wip(scope): RED failing tests for thing\\""}' \
  | CLAUDE_PROJECT_DIR="$WT_DIR" bash "$HOOKS_DIR/safe-change-checkpoint-state.sh" >/dev/null 2>&1
EXIT=$?
assert_exit 0 $EXIT "RED commit: hook exits 0"

STATE_DIR="$MAIN_REPO/.claude/state"
STATE_FILE="$STATE_DIR/feat___test-slug.json"
if [ -f "$STATE_FILE" ]; then
  echo "  ✓ state file created at expected encoded path"
  PASS=$((PASS + 1))
else
  echo "  ✗ state file NOT created (expected $STATE_FILE)"
  echo "    contents of $STATE_DIR:"; ls -la "$STATE_DIR" 2>&1 | head
  FAIL=$((FAIL + 1))
fi

# Inspect step inference
if [ -f "$STATE_FILE" ]; then
  STEP=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['step'])" 2>/dev/null)
  BRANCH=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['branch'])" 2>/dev/null)
  if [ "$STEP" = "RED tests committed" ]; then
    echo "  ✓ step inferred as 'RED tests committed'"
    PASS=$((PASS + 1))
  else
    echo "  ✗ step inference wrong (got '$STEP')"
    FAIL=$((FAIL + 1))
  fi
  if [ "$BRANCH" = "feat/test-slug" ]; then
    echo "  ✓ JSON 'branch' field is unencoded canonical name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ branch in JSON wrong (got '$BRANCH')"
    FAIL=$((FAIL + 1))
  fi
fi

# Make another commit, this time impl
git -c user.email=t@x -c user.name=T commit --allow-empty -q -m "wip(scope): implementation of thing"
printf '{"command":"git commit -m \\"wip(scope): implementation of thing\\""}' \
  | CLAUDE_PROJECT_DIR="$WT_DIR" bash "$HOOKS_DIR/safe-change-checkpoint-state.sh" >/dev/null 2>&1
STEP=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['step'])" 2>/dev/null)
if [ "$STEP" = "impl committed" ]; then
  echo "  ✓ impl commit: step updated to 'impl committed'"
  PASS=$((PASS + 1))
else
  echo "  ✗ impl step wrong (got '$STEP')"
  FAIL=$((FAIL + 1))
fi

# False-positive guard: a commit subject containing 'simplify' should NOT match impl
git commit --allow-empty -q -m "refactor(scope): simplify the foo helper"
printf '{"command":"git commit -m \\"refactor(scope): simplify the foo helper\\""}' \
  | CLAUDE_PROJECT_DIR="$WT_DIR" bash "$HOOKS_DIR/safe-change-checkpoint-state.sh" >/dev/null 2>&1
STEP=$(python3 -c "import json;print(json.load(open('$STATE_FILE'))['step'])" 2>/dev/null)
if [ "$STEP" = "committed" ]; then
  echo "  ✓ 'simplify' in non-wip commit does NOT trigger impl inference"
  PASS=$((PASS + 1))
else
  echo "  ✗ false positive: 'simplify' wrongly classified as '$STEP'"
  FAIL=$((FAIL + 1))
fi

# Non-worktree branch: hook must be a no-op
TDIR2=$(mktemp -d)
make_repo "$TDIR2/normal" "feat/normal" >/dev/null
printf '{"command":"git commit -m \\"wip(scope): impl\\""}' \
  | CLAUDE_PROJECT_DIR="$TDIR2/normal" bash "$HOOKS_DIR/safe-change-checkpoint-state.sh" >/dev/null 2>&1
assert_exit 0 $? "non-worktree commit: hook exits 0"
if [ -d "$TDIR2/normal/.claude/state" ]; then
  echo "  ✗ non-worktree commit wrote .claude/state/ — should not"
  FAIL=$((FAIL + 1))
else
  echo "  ✓ non-worktree commit did NOT create .claude/state/"
  PASS=$((PASS + 1))
fi

# ---------------------------------------------------------------------------
# safe-change-resume-advisory
# ---------------------------------------------------------------------------
echo ""
echo "=== safe-change-resume-advisory ==="

# Use the worktree-style repo we already set up. The advisory expects
# .claude/state/*.json files. We have one from the checkpoint tests.
# Run the advisory from MAIN_REPO (not the worktree).
OUT=$(CLAUDE_PROJECT_DIR="$MAIN_REPO" bash "$HOOKS_DIR/safe-change-resume-advisory.sh" 2>&1)
echo "$OUT" | grep -q "feat/test-slug" \
  && { echo "  ✓ advisory lists 'feat/test-slug' from JSON 'branch' field (not from filename)"; PASS=$((PASS + 1)); } \
  || { echo "  ✗ advisory did NOT list feat/test-slug. Output:"; echo "$OUT"; FAIL=$((FAIL + 1)); }
echo "$OUT" | grep -q "feat___test-slug" \
  && { echo "  ✗ advisory leaked the encoded filename into the display"; FAIL=$((FAIL + 1)); } \
  || { echo "  ✓ advisory does NOT show encoded filename in display"; PASS=$((PASS + 1)); }

# Merged state should be skipped
cat > "$MAIN_REPO/.claude/state/feat___test-slug.json" <<EOF
{"branch":"feat/test-slug","step":"merged","next":"(none)","sha":"deadbeef","ts":"2026-05-26T00:00:00Z"}
EOF
OUT=$(CLAUDE_PROJECT_DIR="$MAIN_REPO" bash "$HOOKS_DIR/safe-change-resume-advisory.sh" 2>&1)
echo "$OUT" | grep -q "feat/test-slug" \
  && { echo "  ✗ advisory still lists a 'merged' state (should skip)"; FAIL=$((FAIL + 1)); } \
  || { echo "  ✓ advisory skips 'merged' states"; PASS=$((PASS + 1)); }

# Escape hatch
OUT=$(CLAUDE_PROJECT_DIR="$MAIN_REPO" SAFE_CHANGE_RESUME_SKIP=1 bash "$HOOKS_DIR/safe-change-resume-advisory.sh" 2>&1)
if [ -z "$OUT" ]; then
  echo "  ✓ escape hatch SAFE_CHANGE_RESUME_SKIP=1 silences output"
  PASS=$((PASS + 1))
else
  echo "  ✗ escape hatch did not silence output:"; echo "$OUT"
  FAIL=$((FAIL + 1))
fi

# Set -e robustness: a state file missing common keys must not abort the hook
cat > "$MAIN_REPO/.claude/state/feat___test-slug.json" <<EOF
{"branch":"feat/test-slug","step":"impl committed","next":"green check"}
EOF
OUT=$(CLAUDE_PROJECT_DIR="$MAIN_REPO" bash "$HOOKS_DIR/safe-change-resume-advisory.sh" 2>&1)
echo "$OUT" | grep -q "feat/test-slug" \
  && { echo "  ✓ advisory survives state file missing optional keys (no set -e abort)"; PASS=$((PASS + 1)); } \
  || { echo "  ✗ advisory aborted on missing optional keys"; FAIL=$((FAIL + 1)); }

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================="
echo "  Results: $PASS passed, $FAIL failed"
echo "==========================================="
[ "$FAIL" -eq 0 ]
