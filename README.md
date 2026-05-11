# ai-toolkit

Tool-agnostic CLI that installs and updates skills, agents, commands, and hooks across AI coding tools. Currently ships configs for **Claude Code**, **Cursor**, **Antigravity**, **Gemini CLI**, **VS Code Copilot**, **GitHub Copilot CLI**, **Kiro**, and **Kiro CLI** — adding a new tool is one block in [`config/tools.json`](config/tools.json).

Distributed as a **private GitHub repo**. Installed via `npx git+ssh://...` directly from the repo. Not published to npm.

> **What's actually tested**
>
> The automated suite verifies file placement, lockfile correctness, update conflict detection, and that each configured tool's destination paths/format match what's declared in `config/tools.json`. It does **not** verify that the receiving IDE/CLI actually ingests those files — that requires running each tool. See [`docs/verification-matrix.md`](docs/verification-matrix.md) for the per-tool manual check.

## Quick start

```bash
npx git+ssh://git@github.com:<you>/ai-toolkit.git install \
  --preset backend-essentials \
  --tool claude-code
```

This drops the preset's skills, agents, and commands into `.claude/` in the current directory. To target your global config:

```bash
npx git+ssh://git@github.com:<you>/ai-toolkit.git install \
  --preset backend-essentials \
  --tool claude-code \
  --scope global
```

For another tool, change `--tool`:

```bash
npx git+ssh://...ai-toolkit.git install --preset backend-essentials --tool cursor
npx git+ssh://...ai-toolkit.git install --skills code-review-checklist --tool antigravity
```

> The machine running `npx` needs SSH access to the private repo (your SSH key on GitHub). No npm registry involvement.

## Commands

```
ai-toolkit install   --tool <name> [--preset <name>] [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--rules f]
                     [--scope global|workspace] [--target <path>]
                     [--force]   # overwrite existing or locally-edited dests
                     [--link]    # symlink where possible (DRY self-hosting)
                     [--dry-run]

ai-toolkit update    [--target <path>] [--force] [--dry-run]

ai-toolkit remove    [--target <path>] [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--all] [--dry-run]

ai-toolkit list      [--type skills|agents|commands|hooks|rules|presets|tools]

ai-toolkit installed [--target <path>]
```

A lockfile (`.ai-toolkit-lock.json`) is written into the target directory. It records the tool, scope, preset, and both source/destination SHAs per installed asset. `update` uses the source SHA to detect upstream changes and the destination SHA to detect local edits.

### Safety

`install` is **non-destructive**: if a destination already exists and (a) the lockfile doesn't track it, or (b) the on-disk content has been edited since last install, it skips with a warning. Pass `--force` to overwrite.

### Frontmatter transformation

For tools whose destination format expects its own frontmatter contract (Cursor `.mdc`, VS Code Copilot `.instructions.md` / `.prompt.md` / `.chatmode.md`), each tool block in [`config/tools.json`](config/tools.json) declares a `frontmatter` template. The installer parses the source asset's frontmatter, strips it, builds the tool-specific frontmatter from the template (with `{description}` etc. substituted from source), and writes that to the destination above the body.

Per-asset overrides via the source frontmatter:

```yaml
---
name: ts-only-rule
description: A rule scoped to TypeScript files.
presets:
  - quality-gates
overrides:
  cursor:
    globs: "**/*.ts"
    alwaysApply: true
  vscode-copilot:
    applyTo: "src/**/*.ts"
---
```

### Sidecars

For tools that need a sibling metadata file (e.g. Kiro hooks need a `.kiro.hook` JSON descriptor), the tool config declares a `sidecar` block. Install generates it; remove tears it down.

### --link mode (DRY self-hosting)

`--link` symlinks the destination back to the source asset rather than copying. Edits to a source file then propagate to consumers immediately. Used by `make bootstrap` so the toolkit self-hosts: contributors can edit `skills/foo/SKILL.md` and Claude Code picks up the change without re-running install.

Symlinks are used where the destination format matches the source byte-for-byte (no frontmatter transform). For tools whose destination requires a transform (Cursor `.mdc`, Copilot `.instructions.md`), `--link` falls back to a copy with a warning.

## Adding a new tool

Append a block to [`config/tools.json`](config/tools.json), then validate it:

```bash
make verify-tools
make test
```

No code changes required. The multi-tool integration matrix automatically exercises any tool in the config, so adding a new tool means adding tests for it for free.

A tool block looks like this:

```json
"my-tool": {
  "displayName": "My Tool",
  "defaultTarget": { "global": "~/.mytool", "workspace": ".mytool" },
  "assetPaths": { "skills": "skills", "rules": "rules" },
  "assetFormats": {
    "skills": { "filename": "SKILL.md", "type": "directory" },
    "rules": { "filename": "{name}.mdc", "type": "file" }
  },
  "supportedAssets": ["skills", "rules"]
}
```

- `defaultTarget.global` or `.workspace` can be `null` if the tool doesn't support that scope.
- `assetPaths[type]` can be `""` if the tool wants assets at the target root.
- `assetFormats[type].type` is `"directory"` (e.g. a SKILL.md inside a named dir) or `"file"` (one file per asset, with `{name}` substituted into `filename`).

## Adding a new skill / agent / command / hook / rule

The manifest is **derived** — you don't hand-edit `manifest.json`. Instead, each asset declares its own metadata in frontmatter, and `make register` regenerates the manifest by scanning every asset.

1. Create the asset at the right location:
   - **Skills:** `skills/<name>/SKILL.md` (markdown, directory)
   - **Agents:** `agents/<name>/agent.md` (markdown, directory)
   - **Commands:** `commands/<name>.md` (markdown, flat file)
   - **Hooks:** `hooks/<name>.sh` (shell script, flat file)
   - **Rules:** `rules/<name>.mdc` (markdown, flat file)
2. Add frontmatter to the asset. For markdown:
   ```yaml
   ---
   name: my-skill                       # optional — defaults to the file/dir name
   description: One-line description.   # surfaced in `ai-toolkit list`
   author: your-name                    # optional
   presets:                             # presets this asset belongs to
     - backend-essentials
     - quality-gates
   tools:                               # optional — restrict to specific tools
     - claude-code
     - cursor
   ---
   ```
   For hooks (`.sh`), put the metadata in a shell comment block at the top:
   ```bash
   #!/usr/bin/env bash
   # === ai-toolkit metadata ===
   # name: my-hook
   # description: ...
   # presets: [quality-gates]
   # === end metadata ===
   ```
3. Declare any new preset in [`config/presets.json`](config/presets.json). Referencing a preset that isn't declared there is a register-time error.
4. Run `make register` to regenerate `manifest.json`. CI runs `make verify-manifest` and will fail if you forget.
5. `make test` exercises everything.

### Field reference

| Field         | Type            | Required | Meaning                                                                                  |
| ------------- | --------------- | -------- | ---------------------------------------------------------------------------------------- |
| `name`        | string          | no       | Identifier used in CLI flags. Defaults to the directory/file name.                       |
| `description` | string          | no       | Shown in `ai-toolkit list`.                                                              |
| `author`      | string          | no       | Maintainer name (informational).                                                         |
| `presets`     | string array    | no       | Presets this asset is bundled in. Every entry must exist in `config/presets.json`.       |
| `tools`       | string array    | no       | Allowlist — if set, the resolver skips this asset when installing for any other tool. |

Content guidelines:

- Generic and reusable. No company names, project codenames, internal hostnames, or real domains.
- Open with a "when to use" and a "when not to use" section.
- Include an MIT license footer.

## Development

Everything routes through the Makefile:

```bash
make help              # list all available targets
make dev               # install deps
make bootstrap         # self-host: install toolkit's own assets into .claude/.cursor/.github/
make unbootstrap       # remove the bootstrapped dirs
make test-watch        # TDD inner loop
make test              # all tests (unit + integration)
make test-unit         # unit tests only
make test-integration  # integration tests only
make lint              # static checks (no stray console.log, JSON parses)
make scan              # gitleaks secret scan
make verify-tools      # validate config/tools.json against schema
make register          # regenerate manifest.json from asset frontmatter
make verify-manifest   # fail if manifest.json is out of date
make smoke             # end-to-end smoke test in a temp directory
make release-check     # lint + test + scan + verify-tools + verify-manifest
make tag VERSION=x.y.z # tag a new release
```

### Contributing workflow

After cloning the repo:

```bash
make dev               # npm install
make bootstrap         # set up the toolkit's own .claude/, .cursor/, .github/
make test              # confirm everything's green before changes
```

The bootstrap step symlinks the source assets (`skills/`, `agents/`, `commands/`, `rules/`) into per-tool directories at the repo root. Your IDE picks them up immediately. Edit a source asset, and (for symlinked destinations) the consumer sees the change without re-running anything. Where format-transform is required (Cursor `.mdc`, Copilot `.instructions.md`), re-run `make bootstrap` to refresh.

Generated bootstrap dirs (`.claude/`, `.cursor/`, `.github/`, `.kiro/`) are gitignored.

This project is built strictly TDD — every behavior has a failing test before any production code. Test runner is Node's built-in `node --test`; no external test framework, no dev dependencies.

## Manifest schema

`manifest.json` is **generated** by `make register` from asset frontmatter — do not edit it by hand. Shape:

```json
{
  "version": "1.0",
  "skills":   { "<name>": { "description": "...", "presets": ["..."], "author": "...", "tools": ["..."] } },
  "agents":   { "<name>": { "description": "..." } },
  "commands": { "<name>": { "description": "..." } },
  "hooks":    { "<name>": { "description": "..." } },
  "rules":    { "<name>": { "description": "..." } },
  "presets":  {
    "<preset-name>": {
      "description": "...",
      "skills":   ["..."],
      "agents":   ["..."],
      "commands": ["..."],
      "hooks":    ["..."],
      "rules":    ["..."]
    }
  }
}
```

The list under each preset is computed from every asset that names that preset in its frontmatter — no duplication, no drift.

## Distribution model

This repo is **private** and **not published to npm**. `npm publish` is guarded by `"private": true` in `package.json`. Distribution is one of:

1. **From the repo directly**: `npx git+ssh://git@github.com:<you>/ai-toolkit.git install ...`
2. **Pinned to a commit**: `npx git+ssh://...#<sha> install ...`

`npx` caches resolved packages — during active development, append `--yes` or pin to a SHA so you don't hit a stale cached copy.

## License

MIT. See [LICENSE](LICENSE).
