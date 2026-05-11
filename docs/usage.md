# Usage

This is the day-to-day reference. For first-time setup see [installation.md](installation.md). For internals see [architecture.md](architecture.md).

## Commands at a glance

```
ai-toolkit install   [--tool <name>] [--preset <name>] [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--rules f]
                     [--scope global|workspace] [--target <project-root>]
                     [--force] [--link] [--dry-run]

ai-toolkit update    [--target <project-root>] [--tool <name>] [--force] [--dry-run]
ai-toolkit remove    [--target <project-root>] [--tool <name>]
                     [--skills a,b] [--agents c] [--commands d] [--hooks e]
                     [--all] [--dry-run]
ai-toolkit installed [--target <project-root>] [--tool <name>]
ai-toolkit list      [--type skills|agents|commands|hooks|rules|presets|tools]
```

## --tool and --target

`--tool` and `--target` are the two flags you'll touch most often.

| Flag             | Meaning                                                                                                                                 | Default                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `--tool <name>`  | Which AI coding tool to install for (claude-code, cursor, vscode-copilot, …)                                                            | optional (see below)   |
| `--target <path>`| **The project root.** The tool decides the subdir under this to populate (`.claude/`, `.cursor/`, `.github/`, `.kiro/`, …).            | current working directory |

**`--tool` is optional everywhere:**

- For `install`: when omitted, the toolkit installs for **every** tool in `config/tools.json`. Tools that share a workspace subdir (e.g. vscode-copilot and copilot-cli both use `.github/`; kiro and kiro-cli both use `.kiro/`) are deduplicated — the first wins, the second is skipped with a clear info message. Tools that don't support a requested asset type warn and skip those assets.
- For `update` / `remove` / `installed`: when omitted, the toolkit scans every tool's workspace subdir under `--target` for an `.ai-toolkit-lock.json` and operates on whichever it finds. Multiple matches surface a clear error asking for `--tool` to disambiguate.

## Scopes: workspace vs global

```bash
ai-toolkit install --tool claude-code --preset backend-essentials             # scope = workspace (default)
ai-toolkit install --tool claude-code --preset backend-essentials --scope global
```

Workspace scope lands under `--target` (the project root). Global scope lands under the absolute path the tool declared, e.g. `~/.claude/`. `--target` is ignored for global scope — the path is user-wide, not project-specific.

Some tools declare `null` for one of the two scopes (Cursor has no global scope, for instance). Asking for an unsupported scope errors out clearly:

```
Tool does not support scope "global" (defaultTarget.global is null).
```

## Install

### Quick patterns

```bash
# Install for every tool in one shot (workspace = CWD)
ai-toolkit install --preset backend-essentials

# Surgical: one tool, one skill
ai-toolkit install --tool cursor --skills code-review-checklist

# Multiple asset types
ai-toolkit install --tool claude-code \
  --skills code-review-checklist \
  --agents senior-architect \
  --commands summarize-diff
```

### Safety: non-destructive by default

`install` will **not** overwrite a destination file unless one of two things is true:

1. The lockfile records the file with a SHA that matches what's currently on disk (i.e. we wrote it last time and nobody touched it since).
2. You passed `--force`.

If neither holds, the asset is skipped with a clear warning:

```
⚠ warn: commands/summarize-diff: destination already exists and was not
  installed by ai-toolkit (untracked file at destination). Skipping;
  pass --force to overwrite.
```

This protects hand-edited content. A re-install over your own previous install is still idempotent — the SHAs match, the install is a no-op.

### Dry runs

```bash
ai-toolkit install --tool claude-code --preset backend-essentials --dry-run
```

Logs the plan (with conflict warnings) and writes nothing. No lockfile created.

### --link for DRY self-hosting

```bash
ai-toolkit install --tool claude-code --skills code-review-checklist --link
```

When destination format matches source byte-for-byte, this creates a symlink instead of a copy. Edits to the source then propagate to consumers immediately. For destinations that require a frontmatter transform (Cursor `.mdc`, Copilot `.instructions.md`), `--link` falls back to a copy with a warning.

This is what `make bootstrap` uses to self-host the toolkit's own assets — see [contributing.md](contributing.md#bootstrap).

## Update

`update` re-applies upstream changes to your installed assets. Source SHAs are compared against the lockfile to detect upstream changes; destination SHAs detect local edits.

| Source changed | Local edits | What happens |
| --- | --- | --- |
| no | no | unchanged, no-op |
| no | yes | locally edited; left alone, warning |
| yes | no | overwritten, lockfile SHA bumped |
| yes | yes | skipped with warning; `--force` overrides |

```bash
ai-toolkit update                                  # autodiscover whichever tool has a lockfile
ai-toolkit update --tool claude-code               # update just claude-code
ai-toolkit update --tool claude-code --force       # overwrite local edits
ai-toolkit update --tool claude-code --dry-run     # plan only
```

If the source asset was removed upstream, `update` flags it but never auto-deletes — use `remove` if you want it gone.

## Remove

```bash
ai-toolkit remove --tool claude-code --skills api-endpoint-design
ai-toolkit remove --tool claude-code --all
ai-toolkit remove --all   # only works if exactly one tool has a lockfile under --target
```

Removes the destination files and clears the matching entries from the lockfile. Tools that declared a sidecar (Kiro hooks) get the sidecar torn down too.

## Installed

`installed` reports what's currently installed under `--target`. Without `--tool`, it scans every tool's subdir and reports each one with its own block.

```bash
$ cd ~/my-project && ai-toolkit installed
── claude-code ──
Path:    /Users/me/my-project/.claude
Tool:    claude-code
Scope:   workspace
Preset:  backend-essentials
Updated: 2025-05-11T18:25:42.227Z

skills (4):
  api-endpoint-design        [1d648e847345]
  ...
agents (1):
  senior-architect           [9e4d121620c4]
commands (1):
  summarize-diff             [fdb7cae3df55]

── cursor ──
Path:    /Users/me/my-project/.cursor
Tool:    cursor
...
```

## List

`list` shows what the toolkit *can* install (orthogonal to what's currently installed).

```bash
ai-toolkit list                       # everything, grouped by type
ai-toolkit list --type skills         # skills only
ai-toolkit list --type presets        # presets with their contents
ai-toolkit list --type tools          # supported tools with their supportedAssets
```

## Lockfile

Each tool's install writes `<tool-subdir>/.ai-toolkit-lock.json` recording:

- `tool` — which tool this lockfile belongs to
- `scope` — workspace or global
- `source` — git URL, if known
- `preset` — preset used, if any
- `lastUpdatedAt` — timestamp
- `assets` — per-type map of `{ sourceSha, destSha, installedAt, sourcePath }`

Both source and destination SHAs are tracked so `update` can tell upstream changes from local edits even when the destination is a frontmatter-transformed copy of the source.

The lockfile is the toolkit's source of truth for "what's installed where." Don't hand-edit it.

## Common workflows

### One-shot setup for every tool

```bash
cd ~/my-project
ai-toolkit install --preset backend-essentials
# Populates .claude/, .cursor/, .github/, .agent/skills/, .gemini/, .kiro/
```

### Per-asset overrides

For tools that need their own frontmatter (Cursor `.mdc`, VS Code Copilot `.instructions.md`), the source asset can override the tool config defaults:

```yaml
---
name: ts-only-rule
description: Rule scoped to TypeScript files.
presets: [quality-gates]
overrides:
  cursor:
    alwaysApply: true
    globs: "**/*.ts"
  vscode-copilot:
    applyTo: "src/**/*.ts"
---
```

Then `make register && make bootstrap` (or just re-run install). See [guides/frontmatter-reference.md](guides/frontmatter-reference.md) for the full reference.

### Iterating on a skill

```bash
# 1. Edit the skill body
vim skills/comprehensive-review/SKILL.md

# 2. Run its eval suite via your IDE
#    /eval-skill comprehensive-review

# 3. If pass rate is below the target_pass_rate in eval.json:
#    /improve-skill comprehensive-review
```

See [guides/evaluation-workflow.md](guides/evaluation-workflow.md) for the full loop.

### Verifying a fresh contributor setup

```bash
make release-check
```

Runs lint + tests + gitleaks + tools schema + manifest sync + e2e. If all green, the mechanical surface is healthy. The per-tool ingestion check (does Claude Code surface the skill in its UI?) is in [verification-matrix.md](verification-matrix.md).
