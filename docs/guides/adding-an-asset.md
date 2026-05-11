# Guide: adding a new skill / agent / command / hook / rule / MCP server

The toolkit ships six asset types. To add a new one:

1. Drop a file (or folder) at the right location.
2. Fill in frontmatter.
3. Run `make register`.
4. Commit both your asset and the regenerated `manifest.json`.

That's it — no other code changes. `manifest.json` is derived from frontmatter; the install/update/remove commands key off the manifest.

## Where to put each type

| Type | Source layout | Why this shape |
| --- | --- | --- |
| **Skill** | `skills/<name>/SKILL.md` (plus optional `eval.json`, `scripts/`, `references/`, `assets/`) | Skills are reusable knowledge — the body is markdown, adjuncts live alongside. Directory format gives you room. |
| **Agent** | `agents/<name>/agent.md` | Named personas. Directory format leaves room for per-agent adjuncts later. |
| **Command** | `commands/<name>.md` | Flat slash-command bodies. |
| **Hook** | `hooks/<name>.sh` | Shell scripts. Frontmatter lives in a `# === ai-toolkit metadata ===` comment block at the top (since `.sh` isn't markdown). |
| **Rule** | `rules/<name>.mdc` | Always-on or pattern-matched directives. |
| **MCP server** | `mcp/<name>.json` | A Model Context Protocol server entry. Not a Markdown file — the whole asset is a JSON object whose `config` block is merged as `mcpServers.<name>` into each tool's MCP config file. See [the MCP section below](#mcp-server-entries). |

## Frontmatter — universal fields

Every asset (regardless of type) accepts the same frontmatter fields. The toolkit reads them from `---` YAML for markdown and from the shell-comment block for `.sh`.

```yaml
---
name: my-asset              # optional — defaults to the file/dir name
description: One-line desc. # surfaced in `ai-toolkit list`
author: your-name           # optional
presets:                    # which presets bundle this asset
  - skill-development
tools:                      # optional allowlist — drop this if all-tools
  - claude-code
  - cursor
overrides:                  # optional per-tool frontmatter overrides
  cursor:
    globs: "**/*.ts"
    alwaysApply: true
  vscode-copilot:
    applyTo: "src/**"
---
```

See [frontmatter-reference.md](frontmatter-reference.md) for the full reference.

## Step by step — a new skill

```bash
# 1. Create the directory + file
mkdir skills/my-new-skill
cat > skills/my-new-skill/SKILL.md <<'EOF'
---
name: my-new-skill
description: What this skill is for.
author: me
presets:
  - skill-development
---

# My New Skill

## When to use this skill

(...)

## When not to use it

(...)

## Procedure

(...)

<!-- MIT, see LICENSE -->
EOF

# 2. Regenerate the manifest
make register

# 3. Confirm it's there
ai-toolkit list --type skills | grep my-new-skill

# 4. (Optional) Add an eval suite — see docs/eval-format.md
# 5. Run tests
make test

# 6. Commit both files
git add skills/my-new-skill/ manifest.json
git commit -m "feat(content): my-new-skill"
```

## Step by step — a new agent

Identical to skills but at `agents/<name>/agent.md`. Agents installed for Claude Code flatten to `.claude/agents/<name>.md`; for VS Code Copilot they become `.github/agents/<name>.md` (Copilot custom agents); for Cursor they become `.cursor/agents/<name>.md` (Cursor subagents). The toolkit handles the format transform.

## Step by step — a new command

```bash
cat > commands/my-command.md <<'EOF'
---
name: my-command
description: What /my-command does.
author: me
presets:
  - skill-development
---

# /my-command

(body — instructions for the slash command)
EOF

make register
make test
```

For tools without slash commands (Cursor, Antigravity), commands are silently skipped at install time — no manual configuration needed.

## Step by step — a new hook

```bash
cat > hooks/my-hook.sh <<'EOF'
#!/usr/bin/env bash
# === ai-toolkit metadata ===
# name: my-hook
# description: What this hook does.
# author: me
# presets:
#   - skill-development
# === end metadata ===

set -euo pipefail
# (script body)
EOF
chmod +x hooks/my-hook.sh
make register
```

For Kiro, the toolkit auto-generates the `.kiro.hook` JSON sidecar based on the tool config's sidecar template — you don't write the JSON by hand. For Claude Code, the script lives at `.claude/hooks/<name>.sh` but **isn't auto-loaded**; reference it from `.claude/settings.json` to wire it up.

## Step by step — a new rule

```bash
cat > rules/my-rule.mdc <<'EOF'
---
name: my-rule
description: What this rule enforces.
author: me
presets:
  - skill-development
tools:
  - cursor
  - claude-code
overrides:
  cursor:
    alwaysApply: true
    globs: "**/*.ts"
---

# Rule: my rule

(body — explanation + good/bad examples)
EOF

make register
```

For Cursor, the rule lands at `.cursor/rules/my-rule.mdc` with the right frontmatter. For Claude Code, it lands at `.claude/rules/my-rule.md` but isn't auto-loaded — see [verification-matrix.md](../verification-matrix.md#claude-code) for how to import it from `CLAUDE.md`.

## MCP server entries

MCP servers are the one asset type that **isn't a Markdown file with frontmatter**. The whole asset is a JSON object: a `config` block (the literal MCP server entry that gets merged into each tool's MCP config) plus the usual metadata sitting next to it.

```bash
cat > mcp/my-server.json <<'EOF'
{
  "description": "What this MCP server does, one line.",
  "author": "me",
  "presets": ["skill-development"],
  "tools": ["claude-code", "cursor"],
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"],
    "env": {
      "API_KEY": "${API_KEY}"
    }
  },
  "overrides": {
    "gemini-cli": {
      "httpUrl": "http://localhost:3000/mcp"
    },
    "kiro": {
      "autoApprove": ["safe_read_tool"]
    }
  }
}
EOF

make register
ai-toolkit list --type mcp | grep my-server
```

Field roles:

- `config` — **required.** The literal MCP server entry the toolkit merges into each tool's MCP config file as `mcpServers.my-server` (or `servers.my-server` for VS Code Copilot — the wrapper key is per-tool, not per-asset).
- `description`, `author`, `presets`, `tools` — same meaning as the universal frontmatter fields.
- `overrides.<toolName>` — **deep-merged** on top of `config` for that specific tool. Use this when a tool needs a different transport field (e.g. Gemini CLI's `httpUrl` instead of `url` for HTTP streaming) or a tool-specific flag (Kiro's `autoApprove`, `disabled`, `disabledTools`). Nested objects merge key-by-key — overriding a single `env` entry doesn't drop the others. Arrays in the override replace the base array wholesale (so a partial `args:` override doesn't silently concat).
- `config.env.<KEY>` values support `${VAR}` and `${VAR:-default}` references; the toolkit emits a warning at install time when one resolves to empty so missing credentials are surfaced before the server tries to start.

At install time the toolkit writes the resolved value into `.mcp.json` / `.cursor/mcp.json` / `.vscode/mcp.json` / `~/.gemini/settings.json` / `~/.gemini/antigravity/mcp_config.json` / `~/.copilot/mcp-config.json` / `.kiro/settings/mcp.json` depending on the tool and `--scope`. Existing entries the user added under different names are never touched. See [architecture.md#mcp-servers](../architecture.md#mcp-servers) for the path table and merge semantics.

## Adding to a preset

Presets are declared in [`config/presets.json`](../../config/presets.json) (name + description). Asset frontmatter joins by name:

```yaml
presets:
  - skill-development
  - skill-development
```

If you reference an undeclared preset, `make register` fails with a clear error. Add the preset to `presets.json` first.

## What you don't need to do

- **Don't edit `manifest.json`.** It's generated. `make register` writes it; CI verifies it's in sync.
- **Don't add files to `.claude/`, `.cursor/`, etc.** Those are install destinations — `make bootstrap` regenerates them from source.
- **Don't pin the asset in every tool's config.** Tool support is determined by `supportedAssets` in the tool config + the asset's optional `tools:` allowlist. No per-asset, per-tool wiring.

## Multi-folder skills

A skill can ship adjacent folders. The [`skills/my-skill/`](../../skills/my-skill/) example carries:

```
skills/my-skill/
├── SKILL.md           # the skill body
├── eval.json          # test cases for /eval-skill and /improve-skill
├── references/
│   └── style-guide.md
└── scripts/
    └── precheck.sh
```

For directory-format destinations (Claude Code, Antigravity, Gemini CLI), the whole tree is copied/symlinked. For file-format destinations (Cursor `.mdc`, VS Code Copilot `.instructions.md`), only `SKILL.md` is extracted and the adjuncts are left behind — they have no equivalent in those tools.

## Iterating with the eval loop

If you ship an `eval.json` next to your skill, you can:

```
/eval-skill my-new-skill      # report pass rate
/improve-skill my-new-skill   # iterate until the target rate is hit
```

Both commands are part of the `skill-development` preset — install them via `ai-toolkit install --preset skill-development` (or just `make bootstrap` to get everything). See [evaluation-workflow.md](evaluation-workflow.md) and [../eval-format.md](../eval-format.md).
