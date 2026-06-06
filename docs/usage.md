# Usage

This is the day-to-day reference. For first-time setup see [installation.md](installation.md). For internals see [architecture.md](architecture.md).

## Commands at a glance

```
ai-toolkit install   [--tool <name>] [--preset <name>] [--all]
                     [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--rules f] [--mcp g]
                     [--scope global|workspace] [--target <project-root>]
                     [--force] [--link] [--dry-run]

ai-toolkit update    [--target <project-root>] [--tool <name>]
                     [--preset <name>] [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--rules f] [--mcp g]
                     [--scope global|workspace]
                     [--force] [--dry-run]

ai-toolkit remove    [--target <project-root>] [--tool <name>]
                     [--preset <name>] [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--rules f] [--mcp g]
                     [--scope workspace|global] [--all] [--dry-run]

ai-toolkit installed [--target <project-root>] [--tool <name>]
                     [--type skills|agents|commands|hooks|rules|mcp]
                     [--preset <name>] [--scope workspace|global] [--check]

ai-toolkit list      [--type skills|agents|commands|hooks|rules|mcp|presets|tools]
                     [--tool <name>]
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
ai-toolkit install --tool claude-code --preset skill-development             # scope = workspace (default)
ai-toolkit install --tool claude-code --preset skill-development --scope global
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
ai-toolkit install --preset skill-development

# Install EVERY shipped asset for every tool, no preset needed
ai-toolkit install --all

# Same idea, scoped to one tool
ai-toolkit install --tool claude-code --all

# Surgical: one tool, one skill
ai-toolkit install --tool cursor --skills skill-evaluator

# Multiple asset types
ai-toolkit install --tool claude-code \
  --skills skill-evaluator \
  --agents docs-maintainer \
  --commands eval-skill
```

`--all` and `--preset` are mutually exclusive — combining them errors out, since `--all` already selects every asset. Each tool still only receives the asset types its config supports, and assets carrying a `tools:` allowlist that excludes the tool are still skipped with a warning.

### Safety: non-destructive by default

`install` will **not** overwrite a destination file unless one of two things is true:

1. The lockfile records the file with a SHA that matches what's currently on disk (i.e. we wrote it last time and nobody touched it since).
2. You passed `--force`.

If neither holds, the asset is skipped with a clear warning:

```
⚠ warn: commands/eval-skill: destination already exists and was not
  installed by ai-toolkit (untracked file at destination). Skipping;
  pass --force to overwrite.
```

This protects hand-edited content. A re-install over your own previous install is still idempotent — the SHAs match, the install is a no-op.

### Hooks are registered in settings.json, not just copied

For Claude Code, dropping a hook script at `.claude/hooks/<name>.sh` is **not enough** to make it run — the tool only fires hooks referenced from a `hooks` block in `settings.json`. Installing a hook therefore does two things:

1. Copies the script to `.claude/hooks/<name>.sh` (or `~/.claude/hooks/<name>.sh` for `--scope global`).
2. Registers it in `.claude/settings.json` (workspace) / `~/.claude/settings.json` (global), keyed off the hook's frontmatter `event:` field.

The settings entry uses the canonical shape — an event maps to an array of matcher groups, each carrying a `hooks` array of command entries:

```jsonc
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "bash \"/abs/path/.claude/hooks/branch-from-main.sh\"" } ] }
    ]
  }
}
```

Tool-scoped events (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`) additionally carry a `matcher` (taken from the hook's optional frontmatter `matcher:` field; defaults to all tools). The merge is idempotent — re-installing never duplicates the entry — and it preserves every unrelated user hook entry in the file. `remove` unwires exactly the entry it added.

A hook with no `event:` in its frontmatter is copied but **not** registered; install warns that it won't fire. Kiro hooks are unaffected — they're discovered via their `.kiro.hook` JSON sidecar, so no `settings.json` entry is written for them.

### Dry runs

```bash
ai-toolkit install --tool claude-code --preset skill-development --dry-run
```

Logs the plan (with conflict warnings) and writes nothing. No lockfile created.

### --link for DRY self-hosting

```bash
ai-toolkit install --tool claude-code --skills skill-evaluator --link
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

### Granular updates

When you only want to refresh a subset of what's tracked, pass `--preset` and/or per-type asset lists. The selectors union together; anything else is left alone.

```bash
# Just the skills section
ai-toolkit update --skills skill-evaluator

# Everything in a preset
ai-toolkit update --preset skill-development

# Preset PLUS one off-preset extra (works as soon as you add custom assets)
ai-toolkit update --preset skill-development --agents docs-maintainer
```

Naming an asset that isn't tracked surfaces a `not tracked in the lockfile` warning and moves on.

If the source asset was removed upstream, `update` flags it but never auto-deletes — use `remove` if you want it gone.

## Remove

```bash
ai-toolkit remove --tool claude-code --skills skill-evaluator
ai-toolkit remove --tool claude-code --preset skill-development   # tear down a whole preset
ai-toolkit remove --tool claude-code --all
ai-toolkit remove --all                                            # removes all installed tools
```

Selectors union together. `--preset skill-development --skills my-custom-skill` would tear down the preset's assets plus that one extra skill. `--all` without `--tool` removes all assets from all installed tools in the target directory.

Removes the destination files and clears the matching entries from the lockfile. Tools that declared a sidecar (Kiro hooks) get the sidecar torn down too. For Claude Code hooks, the matching `settings.json` registration written at install time is unwired as well — only that entry, leaving any unrelated user hook entries in the file intact.

## Installed

`installed` reports what's currently installed under `--target`. Without `--tool`, it scans every tool's subdir and reports each one with its own block. `--type` and `--preset` narrow the report.

```bash
ai-toolkit installed                              # everything, every tool
ai-toolkit installed --tool claude-code           # just claude-code
ai-toolkit installed --type skills                # skills section only
ai-toolkit installed --preset skill-development  # only assets in this preset
ai-toolkit installed --type skills --preset skill-development   # intersection
```

```bash
$ cd ~/my-project && ai-toolkit installed
── claude-code ──
Path:    /Users/me/my-project/.claude
Tool:    claude-code
Scope:   workspace
Preset:  skill-development
Updated: 2025-05-11T18:25:42.227Z

skills (1):
  skill-evaluator            [1d648e847345]
agents (1):
  docs-maintainer            [9e4d121620c4]
commands (2):
  eval-skill                 [fdb7cae3df55]
  improve-skill              [a8f4d2b1e9c6]

── cursor ──
Path:    /Users/me/my-project/.cursor
Tool:    cursor
...
```

### Drift-check: `installed --check`

`installed --check` is a non-interactive drift detector for CI and pre-flight gates. It walks the project lockfile and recomputes the on-disk SHA of every tracked file-copy asset (skills, agents, commands, hooks, rules), comparing it to the `destSha` the lockfile recorded at install time. If an installed asset's content has drifted (hand-edited / tampered) — or has gone missing — it prints a `DRIFT …` line per offender and **exits non-zero**.

```bash
ai-toolkit installed --check                     # whole project, exit 1 on any drift
ai-toolkit installed --check --tool claude-code  # scope the check to one tool
ai-toolkit installed --check --scope global --tool claude-code
```

```text
⚠ warn: DRIFT claude-code hooks/branch-from-main: installed content differs from lockfile sha
✖ error: 1 asset(s) drifted from the lockfile.
$ echo $?
1
```

A clean tree exits 0 with `No drift — every tracked asset matches its lockfile sha.`

> **`installed --check` vs `update --dry-run`.** `update --dry-run` *previews upstream changes* and warns about local edits, but it always exits 0 and conflates "the source asset changed upstream" with "you edited the installed copy." `installed --check` is the purpose-built, exit-code-bearing drift gate: it answers exactly one question — "does what's on disk still match what the lockfile says I installed?" — and is the one to wire into CI.

## List

`list` shows what the toolkit *can* install (orthogonal to what's currently installed).

```bash
ai-toolkit list                       # everything, grouped by type
ai-toolkit list --type skills         # skills only
ai-toolkit list --type presets        # presets with their contents
ai-toolkit list --type tools          # supported tools with their supportedAssets
```

### --tool filter

Restrict the listing to what a specific tool would install. The filter applies on two axes — only asset types the tool's `supportedAssets` covers, and only individual assets whose `tools:` allowlist (if any) includes the named tool.

```bash
ai-toolkit list --tool cursor          # only skills, rules, agents — no commands or hooks
ai-toolkit list --tool antigravity     # skills only
ai-toolkit list --tool cursor --type rules    # rules cursor would install
```

An unknown tool name errors out clearly.

## Lockfile

A single lockfile lives at `<projectRoot>/.ai-toolkit-lock.json` for the whole project — no per-tool lockfiles in `.claude/`, `.cursor/`, etc. Schema v2.0 is multi-tool:

```jsonc
{
  "version": "2.0",
  "installedAt": "<iso>",
  "lastUpdatedAt": "<iso>",
  "tools": {
    "claude-code": {
      "scope":  "workspace",
      "preset": "skill-development",
      "source": null,
      "assets": {
        "skills":   { ... },
        "agents":   { ... },
        "commands": { ... },
        "mcp":      { ... }
      }
    },
    "cursor": { ... }
  }
}
```

Both source and destination SHAs are tracked per asset so `update` can tell upstream changes from local edits even when the destination is a frontmatter-transformed copy of the source.

Global-scope installs are the one exception: each tool's global dir (`~/.claude/`, `~/.cursor/`) gets its own lockfile, since global is project-independent.

The lockfile is the toolkit's source of truth for "what's installed where." Don't hand-edit it.

## Common workflows

### One-shot setup for every tool

```bash
cd ~/my-project
ai-toolkit install --preset skill-development
# Populates .claude/, .cursor/, .github/, .agent/skills/, .gemini/, .kiro/
```

### Per-asset overrides

For tools that need their own frontmatter (Cursor `.mdc`, VS Code Copilot `.instructions.md`), the source asset can override the tool config defaults:

```yaml
---
name: ts-only-rule
description: Rule scoped to TypeScript files.
presets: [skill-development]
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
vim skills/my-skill/SKILL.md

# 2. Run its eval suite via your IDE
#    /eval-skill my-skill

# 3. If pass rate is below the target_pass_rate in eval.json:
#    /improve-skill my-skill
```

See [guides/evaluation-workflow.md](guides/evaluation-workflow.md) for the full loop.

### Installing MCP servers

MCP entries (under `mcp/<name>.json` in the source repo) install differently from skills/agents/commands/hooks/rules: there is no file dropped at a predictable location. Each tool keeps a single JSON config file (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `~/.gemini/settings.json`, …) and the toolkit merges a named entry into that file.

```bash
# Install one MCP server everywhere this toolkit knows about
ai-toolkit install --mcp everything

# Or just for a specific tool
ai-toolkit install --tool claude-code --mcp everything

# Use --scope global to write to the user-wide config file instead
ai-toolkit install --tool cursor --mcp everything --scope global

# List available MCP entries the toolkit ships
ai-toolkit list --type mcp

# See what's currently merged in
ai-toolkit installed --type mcp

# Tear it back out — only our named entry is removed; siblings the
# user added by hand are untouched
ai-toolkit remove --mcp everything
```

Pre-existing entries with the same name are *never* overwritten unless `--force` is passed; the toolkit treats them like file conflicts. Drift (a user hand-editing an entry we own) is detected by sha and surfaces a warning in `update` so an upstream change doesn't silently clobber local tweaks.

See [architecture.md#mcp-servers](architecture.md#mcp-servers) for the per-tool config paths, the JSON wrapper keys (`mcpServers` vs `servers`), and per-tool field overrides like Gemini CLI's `httpUrl`.

### Verifying a fresh contributor setup

```bash
make release-check
```

Runs lint + tests + gitleaks + tools schema + manifest sync + e2e. If all green, the mechanical surface is healthy. The per-tool ingestion check (does Claude Code surface the skill in its UI?) is in [verification-matrix.md](verification-matrix.md).
