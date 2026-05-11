# Guide: adding a new skill / agent / command / hook / rule

The toolkit ships five asset types. To add a new one:

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

## Frontmatter — universal fields

Every asset (regardless of type) accepts the same frontmatter fields. The toolkit reads them from `---` YAML for markdown and from the shell-comment block for `.sh`.

```yaml
---
name: my-asset              # optional — defaults to the file/dir name
description: One-line desc. # surfaced in `ai-toolkit list`
author: your-name           # optional
presets:                    # which presets bundle this asset
  - quality-gates
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
  - quality-gates
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

Identical to skills but at `agents/<name>/agent.md`. Agents installed for Claude Code flatten to `.claude/agents/<name>.md`; for VS Code Copilot they become `.github/chatmodes/<name>.chatmode.md`. The toolkit handles the format transform.

## Step by step — a new command

```bash
cat > commands/my-command.md <<'EOF'
---
name: my-command
description: What /my-command does.
author: me
presets:
  - backend-essentials
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
#   - quality-gates
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
  - quality-gates
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

## Adding to a preset

Presets are declared in [`config/presets.json`](../../config/presets.json) (name + description). Asset frontmatter joins by name:

```yaml
presets:
  - backend-essentials
  - quality-gates
```

If you reference an undeclared preset, `make register` fails with a clear error. Add the preset to `presets.json` first.

## What you don't need to do

- **Don't edit `manifest.json`.** It's generated. `make register` writes it; CI verifies it's in sync.
- **Don't add files to `.claude/`, `.cursor/`, etc.** Those are install destinations — `make bootstrap` regenerates them from source.
- **Don't pin the asset in every tool's config.** Tool support is determined by `supportedAssets` in the tool config + the asset's optional `tools:` allowlist. No per-asset, per-tool wiring.

## Multi-folder skills

A skill can ship adjacent folders. The [`skills/comprehensive-review/`](../../skills/comprehensive-review/) example carries:

```
skills/comprehensive-review/
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
