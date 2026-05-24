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

**Tool restriction.** This skill is claude-code-only because it ships an executable Python script as an adjacent file. The other slash-host tools (`vscode-copilot`, `copilot-cli`) install skills as flat `.md` files and drop adjacent `scripts/` — the script wouldn't ship there. Use direct `gh api graphql` calls in those environments, or run the toolkit's full directory install (claude-code, antigravity, gemini-cli) to get the script.

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
  --labels enhancement,sa-NNN \
  --status Todo --iteration "Current" --size M --priority P2
```
Creates the issue, auto-adds to the project, sets fields atomically. Returns issue URL + item-id.

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
  --blocked-repo <owner/repo>  --blocked-number  <this-issue#> \
  --blocking-repo <owner/repo> --blocking-number <other-issue#>
```
Native GitHub issue dependency — populates `Depends-On` from `safe-change` step 9 reliably. Cross-repo supported. `review-pr` § 5 checks reciprocity via `list-dependencies`.

### `list-items` / `list-fields`
```bash
gh-project-sync list-items --status InProgress --format json
gh-project-sync list-fields
```
Returns project items / field IDs. Pipe through `jq` for filtering.

## Rules
- **Native GH semantics, always.** Sub-issues via `link-sub-issue`, dependencies via `add-dependency`. PR body slots (`Depends-On:` / `Unblocks:`) are human-readable mirrors of the native relation — never the source of truth.
- **One project per workspace.** Set `SMART_AGENTS_PROJECT_OWNER` and `SMART_AGENTS_PROJECT_NUMBER` once in the env; don't pass `--owner` / `--number` on every call.
- **Idempotent by design.** `set-fields` and `link-sub-issue` are safe to re-run. `create-task` is not — guard with `list-items` + `--title` match.
- **Labels are validated.** Unknown labels raise; create them once via `gh label create`.

## Anti-patterns
- **Hardcoded project URLs in prose.** Use `gh-project-sync list-items` output when documenting state.
- **Manually editing the parent issue body to list children.** Use `link-sub-issue`.
- **Cross-repo dependencies tracked only in PR-body prose.** Use `add-dependency`.

## Cross-references
- See `safe-change` step 1 (create-task) and step 9 (Depends-On / Unblocks slots wired via `add-dependency`).
- See `review-pr` § 5 — reviewer checks Depends-On reciprocity using `list-dependencies`.
- See `craft-skill` when a recurring project-board pattern warrants a new sub-command.
