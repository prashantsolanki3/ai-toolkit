---
name: gh-project-sync
description: Wrapper for creating issues that auto-add to a GitHub Project, setting project fields, linking native sub-issues, listing items, and wiring native cross-issue dependencies. Triggered by phrases like "create a task", "add to the project board", "set the iteration", "link sub-issue", "list project items", "block this on", "depends on". Reads SMART_AGENTS_PROJECT_OWNER and SMART_AGENTS_PROJECT_NUMBER from env. Use this for any project-board work — never assume PR-description prose is canonical for cross-repo links.
author: ai-toolkit-dev-skills
presets:
  - dev-skills
tools:
  - claude-code
---

# gh-project-sync

Thin wrapper over `github_project_tool.py` (vendored alongside this skill at `.claude/skills/gh-project-sync/scripts/github_project_tool.py`) that talks to a GitHub Project via GraphQL. Replaces hardcoded `projects/<N>/views/<M>` URL strings with one env-driven entry point. Uses GitHub's native sub-issue and issue-dependency relationships — never PR-description-as-truth.

**Tool restriction.** This skill is **claude-code-only**. Two constraints intersect: (a) the skill ships an executable Python script as an adjacent file, which only directory-format tool installs preserve (vscode-copilot and copilot-cli install skills as flat `.md` and would drop the script); (b) the skill body references slash commands, which antigravity, gemini-cli, and kiro don't host. claude-code is the only tool that satisfies both. In other environments, fall back to direct `gh api graphql` calls or run `github_project_tool.py` manually from a clone of this repo.

## When to use
- Creating a task that must land on the project board.
- Setting project fields (Status, Iteration, Size/Estimate, Priority) on an existing item.
- Linking native sub-issues (epic ↔ sub-task), in same repo or across repos.
- Recording native cross-issue dependencies (`Depends-On` slot in `safe-change` step 9).
- Listing the current project state.

## Configuration
- `SMART_AGENTS_PROJECT_OWNER` — GitHub user/org that owns the project.
- `SMART_AGENTS_PROJECT_NUMBER` — project number.
- The `gh` CLI must be authenticated with `project` and `repo` scopes.

## Commands

### `create-task`
```bash
gh-project-sync create-task --repo <owner/repo> \
  --title "<sentence>" --body "<markdown>" \
  --label enhancement --label sa-NNN \
  --status Todo --size M --priority P2
```
Creates the issue, auto-adds to the project, sets fields atomically. Returns issue URL + item-id. `--label` is singular and repeatable — pass it once per label. Omit `--iteration` to use the project's current iteration. Add `--ensure-labels` to auto-create labels that don't yet exist on the repo.

### `set-fields`
```bash
gh-project-sync set-fields --issue-url <url> \
  --status InProgress --iteration "Next" --size L
```
Idempotent — re-running with the same values is a no-op.

### `link-sub-issue` (native GH relation)
```bash
gh-project-sync link-sub-issue \
  --parent-repo <owner/repo> --parent-number <epic#> \
  --child-repo  <owner/repo> --child-number  <task#>
```
Uses GitHub's native sub-issue relationship. Works across repos. **Do NOT manually edit the parent issue body to list children.**

### `add-dependency` / `remove-dependency` / `list-dependencies`
```bash
gh-project-sync add-dependency \
  --repo            <owner/repo> --number            <this-issue#> \
  --blocked-by-repo <owner/repo> --blocked-by-number <other-issue#>
```
Identifies the blocked issue via `--repo` + `--number` (or `--issue-url`) and the blocker via `--blocked-by-repo` + `--blocked-by-number` (or `--blocked-by-url`). Native GitHub issue dependency — populates `Depends-On` from `safe-change` step 9 reliably. Cross-repo supported. `review-pr` § 5 checks reciprocity via `list-dependencies`.

### `list-items` / `list-fields`
```bash
gh-project-sync list-items --output json | jq '.items[] | select(.fieldValues.Status == "In progress")'
gh-project-sync list-items --issue-url <url>   # filter to a single issue
gh-project-sync list-fields
```
Returns the full project item set (currently capped at 500 — no pagination yet) or field IDs. Pipe through `jq` for filtering by status, iteration, or assignee — the CLI itself only filters by `--issue-url`. `--output` accepts `json` (default) or `text`.

## Rules
- **Native GH semantics, always.** Sub-issues via `link-sub-issue`, dependencies via `add-dependency`. PR body slots (`Depends-On:` / `Unblocks:`) are human-readable mirrors of the native relation — never the source of truth.
- **One project per workspace.** Set `SMART_AGENTS_PROJECT_OWNER` and `SMART_AGENTS_PROJECT_NUMBER` once in the env; don't pass `--owner` / `--number` on every call.
- **Idempotent by design.** `set-fields` and `link-sub-issue` are safe to re-run. `create-task` is not — guard with `list-items` + `--title` match.
- **Labels are validated.** Unknown labels raise unless you pass `--ensure-labels` (which auto-creates them on the repo).

## Anti-patterns
- **Hardcoded project URLs in prose.** Use `gh-project-sync list-items` output when documenting state.
- **Manually editing the parent issue body to list children.** Use `link-sub-issue`.
- **Cross-repo dependencies tracked only in PR-body prose.** Use `add-dependency`.

## Cross-references
- See `safe-change` step 1 (create-task) and step 9 (Depends-On / Unblocks slots wired via `add-dependency`).
- See `review-pr` § 5 — reviewer checks Depends-On reciprocity using `list-dependencies`.
- See `craft-skill` when a recurring project-board pattern warrants a new sub-command.
