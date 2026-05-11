# Architecture

This doc covers the toolkit's design decisions and how the pieces fit together. For day-to-day usage see [usage.md](usage.md); for hands-on contribution see [contributing.md](contributing.md).

## Core abstraction

The thing the toolkit is *trying* to be: a single command that installs the same set of skills/agents/commands/hooks/rules across many AI coding tools, where each tool gets the layout and format it expects.

The trick is that every tool's expected layout is data, not code. [`config/tools.json`](../config/tools.json) is the entire abstraction. Each block declares:

- `defaultTarget.{workspace, global}` — the subdirectory under the project root (or absolute path) the tool reads from.
- `assetPaths.<type>` — which subdir within that holds each asset type.
- `assetFormats.<type>` — the on-disk shape: `directory` (whole folder) or `file` with a `{name}.ext` template.
- `assetFormats.<type>.sourceFile` — when a directory-format source needs to be reduced to a single file at the destination (claude-code agents are `agents/<name>/agent.md` in source, `<name>.md` flat at destination).
- `assetFormats.<type>.frontmatter` — a YAML template written to file-format destinations, with `{key}` substitutions from the source asset's frontmatter (Cursor's `globs`/`alwaysApply`, Copilot's `applyTo`/`mode`).
- `assetFormats.<type>.sidecar` — an optional sibling file (Kiro's `.kiro.hook` JSON).
- `supportedAssets` — which asset types this tool understands.
- `notes` — human-readable context, especially caveats.

Adding a new tool means adding one block. The multi-tool integration matrix and per-tool path tests pick it up without any code change.

## Asset taxonomy

The source repo ships five asset types:

| Type | Source shape | Why it exists |
| --- | --- | --- |
| `skills/<name>/SKILL.md` (+ optional `eval.json`, `scripts/`, `references/`) | directory | The universal knowledge artefact. Markdown body with frontmatter; multi-folder skills carry adjunct material. |
| `agents/<name>/agent.md` | directory | Named personas — system prompts for a specific role. Directory format lets agents carry their own adjuncts later. |
| `commands/<name>.md` | flat file | Slash-command bodies. |
| `hooks/<name>.sh` | flat file | Shell scripts triggered by tool events. Frontmatter lives in a `# === ai-toolkit metadata === / # === end metadata ===` comment block at the top of the file (since `.sh` isn't markdown). |
| `rules/<name>.mdc` | flat file | Always-on / pattern-matched directives that constrain output. |

Each tool maps these to its own destinations. Examples:

- Claude Code: skills stay as dirs at `.claude/skills/<name>/`, agents flatten to `.claude/agents/<name>.md`, commands flat at `.claude/commands/<name>.md`, hooks at `.claude/hooks/<name>.sh`, rules at `.claude/rules/<name>.md`.
- Cursor: skills *and* rules both map to `.cursor/rules/<name>.mdc` (file-format with the right `description`/`globs`/`alwaysApply` frontmatter injected). Cursor has no native concept of skills, agents, commands, or hooks.
- VS Code Copilot: skills → `.github/instructions/<name>.instructions.md`, commands → `.github/prompts/<name>.prompt.md`, agents → `.github/agents/<name>.md` (the [custom agents](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents) mechanism). Cursor: agents → `.cursor/agents/<name>.md` (Cursor's [subagents](https://cursor.com/docs/subagents)).

## Manifest as derived data

[`manifest.json`](../manifest.json) is **generated** from asset frontmatter by `scripts/register.js`. The frontmatter on every asset declares which presets it belongs to, which tools it's restricted to, who maintains it. The generator scans, validates, and emits the manifest. Hand-editing the manifest is wrong; the right edit is to the source asset.

`make verify-manifest` runs the generator in `--check` mode and fails if the committed manifest is out of date — a forgotten `make register` is caught in CI.

## Frontmatter transformation

For file-format destinations whose receiving tool has its own frontmatter expectations, the install pipeline:

1. Parses the source asset's frontmatter (universal: name, description, presets, author, tools, overrides).
2. Builds the destination frontmatter from `assetFormats.<type>.frontmatter` in the tool config. `{key}` strings substitute from source frontmatter; literals pass through.
3. Merges in `source.overrides.<toolName>` from the source asset's frontmatter — per-asset values win over the template's defaults.
4. Writes `---\n<dest frontmatter as YAML>\n---\n<source body>` to the destination.

Result: the destination has the right shape for the tool, the toolkit's own metadata (`name`, `presets`, `tools`) doesn't leak through, and per-asset overrides let a single source say "for Cursor my globs are `**/*.ts`."

## Lockfile

Each tool's install writes `<tool-subdir>/.ai-toolkit-lock.json`. Per asset:

```jsonc
"asset-name": {
  "sourceSha": "<sha of the source file or directory>",
  "destSha":   "<sha of the destination after transform>",
  "sha":       "<destSha — legacy alias kept for older lockfiles>",
  "installedAt": "<iso 8601>",
  "sourcePath": "skills/asset-name"
}
```

Tracking both shas matters because for transformed destinations they're literally different files. `update` compares `sourceSha` to detect upstream changes and `destSha` to detect local edits. Either one diverging triggers the right branch.

## --tool optional → install for all

When `install` runs without `--tool`, it loops every block in `config/tools.json`. For each:

1. Resolve the install dir (`projectRoot + workspace subdir`).
2. If that dir was already populated by an earlier tool in this run, skip (log: "destination already populated by a previous tool"). This handles tools sharing a subdir — `.github/` is used by both `vscode-copilot` and `copilot-cli`.
3. Otherwise, recurse into single-tool install.

The same dedup logic is what makes `make bootstrap` safe to run repeatedly.

For `installed`/`update`/`remove` without `--tool`, the helper `findInstalledTools()` scans every tool's workspace subdir under the project root for an `.ai-toolkit-lock.json`. Zero matches → error. One match → use it. Multiple matches → require `--tool` to disambiguate.

## Self-hosting via --link

`--link` creates a symlink instead of a copy when source and destination are byte-identical (no frontmatter transform required). Used by `make bootstrap` so editing `skills/foo/SKILL.md` immediately shows up in `.claude/skills/foo/SKILL.md` for the maintainer. For destinations that *do* require a transform (`.cursor/rules/<name>.mdc`, `.github/instructions/<name>.instructions.md`), `--link` falls back to a copy with a warning — the transformed file isn't a faithful mirror, so symlinking would defeat the transform.

## Non-destructive install

`install` checks every destination before writing:

| Destination state | Lockfile state | Behaviour |
| --- | --- | --- |
| doesn't exist | — | install |
| exists, matches lockfile sha | tracked | safe overwrite (re-install idempotent) |
| exists, doesn't match lockfile sha | tracked | local edits detected — skip with warning |
| exists | not tracked | unknown content — skip with warning |

`--force` bypasses the skip. Skipped assets are *not* recorded in the lockfile — so the next install without `--force` flags the conflict again.

## Tests as the contract

Three layers:

1. **Unit tests** under `test/unit/` cover each `src/lib/` module in isolation (tools, manifest, lockfile, resolver, source-adapter, frontmatter, frontmatter-transform, manifest-generator, sidecar, fs-ops, logger, git-ops, list).
2. **Integration tests** under `test/integration/` cover commands end-to-end against tmp dirs. Notable suites:
   - `multi-tool.test.js` — parameterised over every tool in `config/tools.json`.
   - `per-tool-paths.test.js` — pins each tool's expected destination layout.
   - `install-nondestructive.test.js` — every branch of the conflict detector.
   - `install-all-tools.test.js` — the no-`--tool` install path.
   - `cli.test.js` — spawns the actual CLI subprocess.
3. **Shell-driven e2e** in `scripts/e2e.sh` walks the full lifecycle against a fresh tmp project using the real `node bin/cli.js` binary.

`make release-check` runs all of these plus `verify-tools`, `verify-manifest`, and gitleaks.

## What's intentionally not in scope

- **Tool-side verification.** Whether Claude Code actually surfaces an installed skill, or Cursor actually loads a rule, can't be asserted in the test suite without driving the live IDE. That check is manual; the contract for it lives in [verification-matrix.md](verification-matrix.md).
- **A built-in eval runtime.** `eval.json` is the data format; running it against an LLM lives in the developer's IDE via the `skill-evaluator` skill and `/eval-skill` command. Adding an API-based runner would require an API key in the toolkit — we explicitly want the IDE to be the runner.
- **Cross-tool lockfile reconciliation.** Each tool's lockfile is independent. The toolkit doesn't try to enforce that the same asset has the same SHA across tools — they can't, since frontmatter transforms produce different bytes.
