# ai-toolkit

Tool-agnostic CLI that installs and updates skills, agents, commands, hooks, rules, and MCP servers across AI coding tools. Currently ships configs for **Claude Code**, **Cursor**, **Antigravity**, **Gemini CLI**, **VS Code Copilot**, **GitHub Copilot CLI**, **Kiro**, and **Kiro CLI** — adding a new tool is one block in [`config/tools.json`](config/tools.json).

Distributed as a **private GitHub repo**, installed via `npx git+ssh://...` directly from the repo. Not published to npm.

> **What's actually tested.** The automated suite verifies file placement, lockfile correctness, update conflict detection, and that each configured tool's destination paths/format match what's declared in `config/tools.json`. It does **not** verify that the receiving IDE/CLI actually ingests those files — that requires running each tool. See [`docs/verification-matrix.md`](docs/verification-matrix.md) for the per-tool manual check.

## Quick start

```bash
# From any project directory — installs for every supported tool at once.
cd ~/my-project
npx --yes git+ssh://git@github.com:<you>/ai-toolkit.git install --preset skill-development

# Or stay surgical with one tool:
npx --yes git+ssh://git@github.com:<you>/ai-toolkit.git install \
  --tool claude-code --preset skill-development
```

`--target` defaults to the current directory; the tool decides which subdirectory to populate (`.claude/`, `.cursor/`, `.github/`, `.kiro/`, …). Pass `--target ~/repos/other` to install into a different project.

Repo not on GitHub yet? Point `npx` at a local path — see [`docs/installation.md`](docs/installation.md#2-npx-from-a-local-checkout-before-the-repo-lands-on-github).

## Documentation

| Doc | Read this for |
| --- | --- |
| [docs/installation.md](docs/installation.md) | First-time setup, all four install methods. |
| [docs/usage.md](docs/usage.md) | Every command, every flag, common workflows. |
| [docs/architecture.md](docs/architecture.md) | Design — the `config/tools.json` abstraction, asset taxonomy, lockfile semantics, transformation pipeline. |
| [docs/contributing.md](docs/contributing.md) | TDD workflow, Makefile reference, bootstrap, pre-share checklist. |
| [docs/eval-format.md](docs/eval-format.md) | The `eval.json` schema for self-improving skills. |
| [docs/verification-matrix.md](docs/verification-matrix.md) | Per-tool manual ingestion check. |
| [docs/guides/adding-a-tool.md](docs/guides/adding-a-tool.md) | Add a new AI tool by editing one file. |
| [docs/guides/adding-an-asset.md](docs/guides/adding-an-asset.md) | Add a new skill / agent / command / hook / rule. |
| [docs/guides/frontmatter-reference.md](docs/guides/frontmatter-reference.md) | Universal and per-tool frontmatter fields. |
| [docs/guides/evaluation-workflow.md](docs/guides/evaluation-workflow.md) | The `/eval-skill` and `/improve-skill` loop. |

Full index at [docs/README.md](docs/README.md).

## Commands at a glance

```
ai-toolkit install   [--tool <name>] [--preset <name>] [--all]
                     [--skills a,b] [--agents c]
                     [--commands d] [--hooks e] [--rules f] [--mcp g]
                     [--scope global|workspace] [--target <project-root>]
                     [--force] [--link] [--dry-run]
ai-toolkit update    [--target <project-root>] [--tool <name>]
                     [--preset <name>] [--skills a,b] [...]
                     [--force] [--dry-run]
ai-toolkit remove    [--target <project-root>] [--tool <name>]
                     [--preset <name>] [--skills a,b] [...]
                     [--all] [--dry-run]
ai-toolkit installed [--target <project-root>] [--tool <name>]
                     [--type <type>] [--preset <name>]
ai-toolkit list      [--type skills|agents|commands|hooks|rules|mcp|presets|tools]
                     [--tool <name>]
```

Without `--tool`, `install` runs for every tool in `config/tools.json` (tools sharing a workspace subdir are deduped); the other commands autodiscover the installed tool. Full reference in [docs/usage.md](docs/usage.md).

## For contributors

```bash
git clone <repo>
cd ai-toolkit
make dev               # npm install
make bootstrap         # self-host: .claude/, .cursor/, .github/, .kiro/ all symlinked to source
make test              # 346 tests, expect green
```

Before pushing or sharing:

```bash
make release-check     # lint + tests + scan + verify-tools + verify-manifest + e2e
```

See [docs/contributing.md](docs/contributing.md) for the full contributor flow and [docs/architecture.md](docs/architecture.md) for the design.

## License

MIT. See [LICENSE](LICENSE).
