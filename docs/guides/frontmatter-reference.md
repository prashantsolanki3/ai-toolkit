# Frontmatter reference

Every asset declares its metadata in frontmatter. The toolkit reads this to build `manifest.json`, gate per-tool installs, and inject tool-specific frontmatter at the destination.

## Format

- **Markdown assets** (`.md`, `.mdc`): YAML frontmatter delimited by `---` on its own line.
- **Shell hooks** (`.sh`): a comment block opened by `# === ai-toolkit metadata ===` and closed by `# === end metadata ===`. Each line inside starts with `# ` followed by valid YAML.

Both shapes parse to the same logical fields. The shell-block form exists because `.sh` files can't start with `---` (that's not a valid shebang).

## Universal fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | no | Identifier the CLI uses (`--skills my-skill`). Defaults to the directory or file basename. |
| `description` | string | recommended | Shown in `ai-toolkit list`. Also flows into per-tool frontmatter via `{description}` substitution. |
| `author` | string | no | Maintainer name. Informational. |
| `presets` | string array | no | Presets that bundle this asset. Every preset must be declared in [`config/presets.json`](../../config/presets.json) first. |
| `tools` | string array | no | Allowlist. When set, the resolver skips this asset on any tool not in the list (with a warning). |
| `overrides` | object | no | Per-tool overrides for tool-specific frontmatter — see below. |

## Per-tool overrides

When a tool injects its own frontmatter on install (Cursor's `globs`/`alwaysApply`, Copilot's `applyTo`/`mode`), the tool config in [`config/tools.json`](../../config/tools.json) declares the template. The asset's `overrides.<tool>.<key>` wins over the template's default.

```yaml
---
name: ts-only-rule
description: Rule scoped to TypeScript files.
presets:
  - quality-gates
tools:
  - cursor
  - claude-code
overrides:
  cursor:
    alwaysApply: true
    globs: "**/*.ts"
  vscode-copilot:
    applyTo: "src/**/*.ts"
---
```

The toolkit ships [`rules/prefer-typed-errors.mdc`](../../rules/prefer-typed-errors.mdc) as a concrete example.

### Common override targets

| Tool | Override keys that matter |
| --- | --- |
| `cursor` (rules) | `globs`, `alwaysApply` |
| `cursor` (agents) | `model`, `readonly`, `is_background` |
| `vscode-copilot` (skills→instructions) | `applyTo` |
| `vscode-copilot` (commands→prompts) | `mode`, `tools`, `model` |
| `vscode-copilot` (agents→.github/agents) | `tools`, `model`, `mcp-servers` |
| `copilot-cli` | same as vscode-copilot |

For tools whose destination doesn't transform frontmatter (Claude Code, Antigravity, Gemini CLI), `overrides` is silently ignored — the source frontmatter passes through untouched.

## Shell hook frontmatter

`.sh` hooks need the comment-block form because YAML `---` would be parsed by the shell as `--`-prefixed argument syntax.

```bash
#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: pre-commit-lint
# description: Sample lint-staged pre-commit hook.
# author: ai-toolkit
# presets:
#   - quality-gates
# === end metadata ===

set -euo pipefail
# (script body)
```

Rules:

- Open marker `# === ai-toolkit metadata ===` and close marker `# === end metadata ===` are case-sensitive.
- Between markers, every non-blank line starts with `# ` and the rest is parsed as YAML.
- The leading `#! /usr/bin/env bash` shebang can come before or after the block — the parser doesn't care.

## What's enforced and where

| Field | Check | When |
| --- | --- | --- |
| `presets` references valid preset | error if not declared in `config/presets.json` | `make register` |
| `tools` allowlist filters installs | warning per skipped asset | every `install` |
| `name` uniqueness within type | error on duplicate | `make register` |
| Source file present | error with full path | `install`/`update` |
| `overrides.<tool>` keys are honoured | silent — the values land in dest frontmatter | every `install`/`update` |
| `description` non-empty | not enforced — recommended | — |

## Adding a new field

If you want a new universal field (say, `since: "1.2.0"`):

1. Add it to your asset's frontmatter as you would any other key.
2. The manifest generator passes it through to the manifest entry automatically (anything outside the reserved set — `name`, `description`, `presets` — flows through as-is).
3. If you want it to affect behaviour, edit [`src/lib/resolver.js`](../../src/lib/resolver.js) or whichever consumer.

If you want a new *tool-specific* override field, no toolkit change is needed — `overrides.<tool>` is a free-form object, and any keys you put in it land in the destination's frontmatter as long as the tool's `assetFormats.<type>.frontmatter` template *or* its overrides path mentions the key.

> Note: if a key is in `overrides` but the tool config's template doesn't include it, it'll still be written because the override merges into the result of the template. If you need the key to appear *only* when overridden, declare it without a default value (just don't include it in the template).

## Reading: what the toolkit actually does

For a file-format destination with a `frontmatter` template:

1. Parse the source asset's full frontmatter.
2. Build the dest frontmatter by walking the template:
   - For each key, if the value is `"{sourceKey}"`, substitute `sourceData[sourceKey]` (skip if absent).
   - Otherwise use the value literally.
3. Merge `sourceData.overrides[toolName]` into the result — per-asset overrides win.
4. YAML-encode and prepend `---\n...\n---\n` to the source body.

For a directory-format destination, the source frontmatter is passed through untouched (Claude Code skills, Antigravity skills, etc.). The toolkit's own metadata (`name`, `presets`, `author`, `tools`, `overrides`) is left in the file — tools generally ignore unknown keys.

## Validating frontmatter

```bash
make register           # rebuilds manifest.json; fails on bad frontmatter
make verify-manifest    # CI-safe check
```

For eval-style validation (assertions, regex), see [evaluation-workflow.md](evaluation-workflow.md) and [../eval-format.md](../eval-format.md).
