---
name: parallel-reviewers
description: Fan out three plugin reviewers (code-reviewer, silent-failure-hunter, pr-test-analyzer) at a PR in parallel and consolidate verdicts into one table. Auto-detects docs-only diffs and skips reviewers without signal. Falls back to repo-local agents when the pr-review-toolkit plugin is absent.
author: ai-toolkit-dev-skills
presets:
  - dev-skills
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
argument-hint: "[--pr-number N | --from-branch B] [--scope=docs|code|security]"
---

# /parallel-reviewers

Run the three `pr-review-toolkit` reviewer agents at the same change in parallel and print one consolidated verdict table. Auto-detects docs-only diffs and skips reviewers that have no useful signal on them. Falls back to repo-local agents when the plugin is absent.

## Args
- `--pr-number N` — target an existing PR; fetched via `gh pr view N`.
- `--from-branch B` — target a local branch (default: current). Diff is `git diff origin/$DEFAULT...B` where `DEFAULT` is the repo's default branch — detect once with the two-line pattern: `DEFAULT=$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')` then `DEFAULT=${DEFAULT:-main}` (the explicit empty-check is needed because a single-line `|| echo main` only fires when the whole pipeline fails — `git symbolic-ref` failing while `sed` succeeds on empty input would leave `DEFAULT` empty).
- `--scope=docs|code|security` — override auto-detect. `docs` drops `silent-failure-hunter` + `pr-test-analyzer`; `security` forces `security-auditor` in addition; `code` is the default.

Both flags are accepted; `--pr-number` takes precedence when present, otherwise `--from-branch` is used. If neither is provided, defaults to `--from-branch $(git branch --show-current)`.

## What it does
1. **Pre-flight: plugin detection.** Probe `ls -d ~/.claude/plugins/marketplaces/*/plugins/pr-review-toolkit 2>/dev/null | head -1`. If empty, switch to repo-local fallback (`self-reviewer` + `security-auditor` from `.claude/agents/`) and print a `[fallback]` banner. Otherwise use plugin agents.
2. **Resolve the diff.** From `--pr-number`: `gh pr diff N --name-only` + body. From `--from-branch`: `git diff --stat origin/$DEFAULT...B` + body (substitute the detected default branch — see Args above).
3. **Auto-detect docs-only.** If every changed path matches `^(docs/|.*\.md$|.*\.mdx$|README|CHANGELOG)` and `--scope` was not passed, set effective scope to `docs`.
4. **Compose reviewer set:**
   - default (code-scope) → `pr-review-toolkit:code-reviewer`, `pr-review-toolkit:silent-failure-hunter`, `pr-review-toolkit:pr-test-analyzer`
   - docs-scope → only `pr-review-toolkit:code-reviewer`
   - security-scope → defaults plus `pr-review-toolkit:security-auditor` (or local fallback)
5. **Fan out in one assistant message.** All `Agent(subagent_type=...)` calls in the same message — parallel, not sequential.
6. **Consolidate.** One row per reviewer in a markdown table: `reviewer | verdict (PASS/CONCERNS/BLOCK) | top finding | full report ↓`. Folded full reports below.

## Failure modes / fallbacks
- Plugin missing → repo-local agents (step 1 banner).
- One reviewer crashes → mark that row `error`, do not abort the others.
- `gh` not authenticated and `--pr-number` passed → suggest `--from-branch`, exit 2.
- `.github/workflows/*` in diff → flag in footer.
- >200 changed files → warn about truncation; offer `--scope=security`.

## Cross-references
- Use as `safe-change` step 10.
- Pair with `/clean-gone --all-repos` after merge.
