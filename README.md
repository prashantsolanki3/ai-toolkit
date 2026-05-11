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
                     [--scope global|workspace] [--target <path>] [--dry-run]

ai-toolkit update    [--target <path>] [--force] [--dry-run]

ai-toolkit remove    [--target <path>] [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--all] [--dry-run]

ai-toolkit list      [--type skills|agents|commands|hooks|presets|tools]

ai-toolkit installed [--target <path>]
```

A lockfile (`.ai-toolkit-lock.json`) is written into the target directory. It records the tool, scope, preset, and a SHA per installed asset. `update` uses this to detect upstream changes and local edits.

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

## Adding a new skill / agent / command / hook

1. Create the asset at `skills/<name>/SKILL.md` (or the analogous location for the type).
2. Register it in [`manifest.json`](manifest.json) under the appropriate section.
3. Optionally add it to one or more presets in `manifest.json`.
4. `make test` exercises everything.

Content guidelines:

- Generic and reusable. No company names, project codenames, internal hostnames, or real domains.
- Open with a "when to use" and a "when not to use" section.
- Include an MIT license footer.

## Development

Everything routes through the Makefile:

```bash
make help              # list all available targets
make dev               # install deps
make test-watch        # TDD inner loop
make test              # all tests (unit + integration)
make test-unit         # unit tests only
make test-integration  # integration tests only
make lint              # static checks (no stray console.log, JSON parses)
make scan              # gitleaks secret scan
make verify-tools      # validate config/tools.json against schema
make smoke             # end-to-end smoke test in a temp directory
make release-check     # lint + test + scan + verify-tools (full gate)
make tag VERSION=x.y.z # tag a new release
```

This project is built strictly TDD — every behavior has a failing test before any production code. Test runner is Node's built-in `node --test`; no external test framework, no dev dependencies.

## Manifest schema

`manifest.json` enumerates everything the toolkit can install:

```json
{
  "version": "1.0",
  "skills":   { "<name>": { "description": "..." } },
  "agents":   { "<name>": { "description": "..." } },
  "commands": { "<name>": { "description": "..." } },
  "hooks":    { "<name>": { "description": "..." } },
  "presets":  {
    "<preset-name>": {
      "skills":   ["..."],
      "agents":   ["..."],
      "commands": ["..."],
      "hooks":    ["..."]
    }
  }
}
```

## Distribution model

This repo is **private** and **not published to npm**. `npm publish` is guarded by `"private": true` in `package.json`. Distribution is one of:

1. **From the repo directly**: `npx git+ssh://git@github.com:<you>/ai-toolkit.git install ...`
2. **Pinned to a commit**: `npx git+ssh://...#<sha> install ...`

`npx` caches resolved packages — during active development, append `--yes` or pin to a SHA so you don't hit a stale cached copy.

## License

MIT. See [LICENSE](LICENSE).
