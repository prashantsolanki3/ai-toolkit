---
name: safe-change
description: Default SDLC contract for any non-trivial code or config change. Triggered by phrases like "fix", "add", "wire up", "implement", "refactor", "rename", "update", "build" — anything imperative on the code. Enforces worktree → TDD red → impl → green → PR → review → merge → cleanup with a GitHub Project board task and a cross-repo Depends-On slot. Skip only for pure questions, single-file typos the user calls out, work already happening on a named active branch, or when a more specific domain skill applies.
author: ai-toolkit-dev-skills
presets:
  - dev-skills
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
---

# safe-change

Default mode for any non-trivial code or config change. Enforces the SDLC contract: isolated worktree, single-author TDD, project-board task, selective commits, PR, parallel review, post-merge verify, post-merge cleanup. Lifted from opulent-toolkit's `safe-change` and adapted for multi-repo workspaces.

**Default branch.** This body uses `main` throughout — substitute `master` (or the repo's actual default) where applicable. Detect via `DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@' 2>/dev/null || echo main)`. The `branch-from-main` hook does the same fallback at session start.

## When to use
- The user asks for any code, config, infra, test, doc, or skill change AND no domain skill matches.
- The user says "fix", "add", "wire up", "implement", "refactor", "rename", "extract", "split", "delete", "update", "change", "build", "set up" — anything imperative on the code.
- If unsure, invoke this skill — cost of routing through it is small; cost of skipping it is broken history.

## Procedure
1. **Scope + project task.** Restate the change in one sentence; list files/areas touched. If >5 files or crossing module/repo boundaries or new dependency, stop and offer a plan. Every change needs a GitHub Project board item — call `gh-project-sync` with `create-task --repo <owner/repo> --title "..." --body "..." --status Todo`. Capture the issue number `<N>`. If the user referenced an existing issue, `gh issue view <N>` and re-use it.
2. **Branch from latest main.** First: `git fetch origin main && git checkout main && git pull --ff-only origin main`. Then create an isolated worktree inside the repo: `git worktree add -b <type>/<slug> .claude/worktrees/<slug> main` where `<type>` is `feat|fix|chore|docs|refactor|test`. Never put worktrees as siblings of the repo. Never edit `main` directly. The `branch-from-main` SessionStart advisory surfaces this rule at session start.
3. **Red test first.** TDD is mandatory under runtime areas. Mirror source-to-test paths per repo convention. Run the test; confirm RED for the right reason. If a test is genuinely impossible, say so explicitly. The author who writes the red test is the same author who writes the implementation.
4. **Implement** the change to make the test pass. Don't add anything the test doesn't demand; resist scope creep.
5. **Green check.** Run the relevant test file, then the broader suite for the area. Confirm GREEN. Note pre-existing unrelated failures; don't fix them silently.
6. **Docs sync.** If you add/remove a route, command, env var, port, or skill, update the relevant doc in the SAME commit set. For LLM-wiki repos, file via `wiki-keeper` — do not write `docs/` directly.
7. **Selective commit.** Always `git add <specific paths>` — NEVER `git add -A` or `git add .`. Use Conventional Commits: `type(scope): short imperative summary`. Never modify git config; never `--no-verify`.
8. **Push.** `git push -u origin <branch>`. Never push to `main`.
9. **Open the PR with Depends-On slot.** Body MUST contain `Closes #<N>` or `Refs #<N>`. If this PR depends on or unblocks work in another repo, fill the slots:
   ```
   ## Summary
   - Closes #<N>
   - <1-3 bullets>

   ## Cross-repo links
   Depends-On: <owner/repo#M>   (omit if none)
   Unblocks:   <owner/repo#K>   (omit if none)

   ## Test plan
   - [ ] <how you verified>
   ```
   Reviewer checks reciprocity in `review-pr` § Consistency. Cross-repo dependencies are linked natively via GitHub Issue dependencies (see `gh-project-sync` `add-dependency`), not via PR-description-as-truth.
10. **Parallel review.** Invoke `/parallel-reviewers` to fan out to three reviewer agents. The command pre-flights the `pr-review-toolkit` plugin and falls back to repo-local reviewers if absent. Auto-detects `--scope` from `git diff --stat`. Outcomes per reviewer: APPROVED, REQUEST_CHANGES (author addresses, re-runs, pushes; orchestrator re-dispatches; hard cap 3 iterations then escalate), or COMMENT. Reviewers never push to the author's branch.
11. **Report back.** One concise message: branch, commit SHAs, PR URL, suite result, review verdicts, anything deferred.
12. **Post-merge verify.** After merge: `git checkout main && git pull --ff-only`, then run the smoke suite + the suites the PR touched. Distinguish real regressions from pre-existing flake by re-running the failing test on `git merge-base origin/main HEAD` — if it fails there too, log as Non-blocking. If new on merged main: stop, report to owner verbatim, do NOT auto-revert. Docs-only PRs skip suites.
13. **Clean up.** Run `/clean-gone` to prune every `[gone]` branch + worktree. Survives session loss. Guards against branches mentioned in `status/blockers.md`. Use `--dry-run` first if any worktree has uncommitted edits.

## Rules
- One concern per commit, format `type(scope): description`. Never amend a pushed commit unless the user asks.
- Never `git add -A` / `git add .`. Always pass specific paths.
- Never push to `main`; never `git push --force`, `git reset --hard`, `git clean -fd` on shared state without explicit confirmation.
- Never commit secrets. Reference env-var names only.
- Single-author TDD: same agent writes red test and implementation.
- Cross-repo work = one worktree per repo, branched from each repo's latest main.

## Anti-patterns
- **"Tests pass, ship it."** Without a confirmed RED-before-GREEN cycle, tests prove nothing — see `review-pr` would-fail-before check.
- **Skipping the project-board task** because the change feels small. Untracked work fragments the work-stream.
- **Reusing a stale worktree** from a prior session without re-basing.
- **Editing `docs/` directly** in LLM-wiki repos. Route through `wiki-keeper`.

## Cross-references
- See `review-pr` for the 6-axis test-relevance rubric the reviewer applies in step 10.
- See `craft-skill` when a session reveals a behaviour worth keeping.
- See `gh-project-sync` for project-board task creation, cross-repo Depends-On wiring, and status updates.
