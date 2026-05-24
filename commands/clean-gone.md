---
name: clean-gone
description: Prune local branches whose remote is [gone] plus their worktrees — safely, with a dry-run and an optional multi-repo mode. Honours $SMART_AGENTS_REPOS_ROOT for the multi-repo iterator.
author: ai-toolkit-dev-skills
presets:
  - dev-skills
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
argument-hint: "[--dry-run] [--all-repos]"
---

# /clean-gone

Prune `[gone]` branches and their worktrees from the current repo (or every repo with `--all-repos`). Wraps the standard `git worktree remove` + `git branch -D` recipe and adds a dry-run preview, a "parked work" guard, and gentle worktree removal.

## Args
- `--dry-run` — print what would be deleted, change nothing.
- `--all-repos` — iterate over every repo under `$SMART_AGENTS_REPOS_ROOT` (default: parent of `git rev-parse --show-toplevel`). Per-repo failures are reported but do not abort the loop.

## What it does
1. Resolve the repo list. Single-repo mode uses `$(pwd)`; `--all-repos` globs `$SMART_AGENTS_REPOS_ROOT/*/.git`.
2. For each repo, snapshot the candidates: `git branch -vv | grep '\[gone\]' | sed 's/^[+* ]//' | awk '{print $1}'`. The `-vv` (double-v) is load-bearing — plain `-v` doesn't show upstream tracking info, so it never displays the `[gone]` marker.
3. **Parked-issue guard.** For every candidate branch, extract a trailing issue number (regex `[0-9]+$`). If found, run `gh api repos/{owner}/{repo}/issues/<N> --jq '.state + " " + (.labels | map(.name) | join(","))'`. Drop the branch from the delete set if the issue is `closed` with a `parked` label, or if any label contains `parked`. Also drop any branch name that appears verbatim in `status/blockers.md` when that file exists.
4. **Dry-run path.** If `--dry-run`, print a table of `repo | branch | worktree-path | action` and exit 0.
5. **Gentle removal.** For each surviving candidate:
   - Find the worktree path: `wt=$(git worktree list --porcelain | awk -v b="$branch" '/^worktree / { wt = $2 } $1 == "branch" && $2 == "refs/heads/" b { print wt; exit }')`. `git worktree list --porcelain` emits records of `worktree <path>` / `HEAD <sha>` / `branch refs/heads/<name>` (blank-line separated), so we track the worktree path as we scan and emit it when the branch matches. The earlier `{print prev}` shortcut was wrong — the line right before `branch` is `HEAD <sha>`, not the worktree path.
   - If `$wt` exists and is not the main checkout: try `git worktree remove "$wt"` (plain — no `--force`).
   - If that fails with `contains modified or untracked files`, prompt user `y/N` to escalate to `--force`. Skip on N.
   - Then `git branch -D "$branch"`.
6. Print a per-repo summary: pruned N branches, M worktrees, S skipped (with reason).

## Failure modes / fallbacks
- `gh` not authenticated: parked-guard degrades to branch-name matching against `status/blockers.md`. Warn once.
- `--all-repos` with `$SMART_AGENTS_REPOS_ROOT` unset and current dir not under known layout: refuse with resolved root, exit 2.
- Pre-flight `git fetch --prune` per repo. If fetch fails (offline, auth), continue with stale data; warn.

## Cross-references
- Use after every PR merge — paired with `safe-change` step 13.
- Pair with `/parallel-reviewers` upstream: review → merge → `/clean-gone`.
- See `craft-skill` if a recurring cleanup edge case warrants a new sub-command.
