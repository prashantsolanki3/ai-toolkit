# Contributing

## TL;DR

```bash
git clone <repo>
cd ai-toolkit
make dev               # npm install
make bootstrap         # set up .claude/, .cursor/, .github/ in this repo
make test              # confirm green
```

Then edit a source asset, run `make register` if you added or removed something, and `make test` to verify.

## Repository layout

```
ai-toolkit/
├── bin/cli.js              # CLI entry point
├── src/
│   ├── commands/           # install / update / remove / list / installed
│   └── lib/                # tools, manifest, lockfile, resolver, source-adapter, ...
├── config/
│   ├── tools.json          # one block per supported AI tool
│   ├── tools.schema.json   # JSON schema for tools.json
│   └── presets.json        # declared preset names + descriptions
├── skills/<name>/SKILL.md  # universal skill content (with optional eval.json + sub-folders)
├── agents/<name>/agent.md  # universal agent content
├── commands/<name>.md      # flat slash-command bodies
├── hooks/<name>.sh         # flat shell hook scripts
├── rules/<name>.mdc        # flat rule bodies
├── manifest.json           # GENERATED — do not edit by hand
├── scripts/                # helper scripts wired into the Makefile
├── test/                   # node --test suites (unit + integration)
└── docs/                   # the docs you're reading
```

## The Makefile is the dev surface

Every command worth running lives behind a make target. `make help` lists them all. The most common:

| Target | Purpose |
| --- | --- |
| `make dev` | `npm install` |
| `make bootstrap` | Self-host: install the toolkit's own assets into `.claude/`, `.cursor/`, `.github/`, `.kiro/`. Uses `--link` so source edits propagate. |
| `make unbootstrap` | Tear down the bootstrap dirs |
| `make test` | All tests |
| `make test-watch` | TDD inner loop |
| `make register` | Regenerate `manifest.json` from asset frontmatter |
| `make verify-manifest` | Fail if `manifest.json` is stale |
| `make verify-tools` | Validate `config/tools.json` against its schema |
| `make smoke` | Single-tool install/list/update/remove cycle in a temp dir |
| `make e2e` | 9-step shake-out of the full CLI surface |
| `make release-check` | Composite gate: lint + test + scan + verify-tools + verify-manifest + e2e |

## Workflow

### TDD discipline

This codebase is built strictly TDD. Every behaviour landed with a failing test first. The expectation for contributions:

1. Write a failing test describing the behaviour.
2. Run it (`make test-watch` keeps the loop fast).
3. Write the minimum code to pass.
4. Refactor while keeping tests green.
5. Commit with a conventional message: `feat(scope): description`, `fix(scope): ...`, `test(scope): ...`.

No production code without a preceding failing test. The `make ci` target catches violations.

### One concern per commit

The commit log should read like a sequence of small, reviewable steps. Squash WIP commits locally; submit a tidy series.

### Asset frontmatter is the source of truth

`manifest.json` is **generated** from the frontmatter of every asset in `skills/`, `agents/`, `commands/`, `hooks/`, `rules/`. To add a new asset:

1. Create the file at the right location (see [guides/adding-an-asset.md](guides/adding-an-asset.md)).
2. Fill in frontmatter:
   ```yaml
   ---
   name: my-skill
   description: One-line description.
   author: your-name
   presets: [skill-development]
   tools: [claude-code, cursor]   # optional allowlist
   ---
   ```
3. Run `make register`.
4. Commit both your asset and the updated `manifest.json`.

Forgetting to register is caught by `make verify-manifest` in `release-check`.

For preset additions, declare the preset in `config/presets.json` first.

### Adding a new tool

Edit one file: `config/tools.json`. No code changes. See [guides/adding-a-tool.md](guides/adding-a-tool.md).

The multi-tool integration matrix (`test/integration/multi-tool.test.js`) automatically picks up any new tool and runs the install/update/remove cycle against it.

## Bootstrap

`make bootstrap` self-hosts the toolkit:

```
.claude/   -> symlinks back to skills/, agents/, commands/, hooks/, rules/
.cursor/   -> rules with Cursor-shape frontmatter (copies, not links — transform required)
.github/   -> instructions/prompts/agents for VS Code Copilot
.kiro/     -> steering + hooks with .kiro.hook sidecars
.agent/    -> Antigravity skills
.gemini/   -> Gemini CLI skills
```

These dirs are gitignored. Re-run `make bootstrap` after editing source assets to refresh the copies (the symlinks update automatically).

## Pre-share / pre-tag checklist

Before pushing the repo or asking someone else to try it:

```bash
make release-check
```

That runs every mechanical gate in dependency order. If green, the repo is healthy.

Then walk [verification-matrix.md](verification-matrix.md) for each tool you actually use — the IDE-side check is irreducibly manual (does Claude Code surface the agent? does Cursor show the rule in Settings → Rules?).

## Documentation maintenance

The `docs-maintainer` agent (`agents/docs-maintainer/agent.md`) lives in this repo specifically to keep these docs honest. After a substantive change to the CLI, config schema, or asset taxonomy, invoke it:

- In Claude Code: `@docs-maintainer audit docs/usage.md against the change in src/commands/install.js`
- In Cursor: select `docs-maintainer` from the rules list, then ask in chat.
- In VS Code Copilot: invoke the `docs-maintainer` custom agent from the agent picker (it's installed at `.github/agents/docs-maintainer.md`).

The agent flags drift and proposes diffs but never silently rewrites prose.

## What not to do

- Don't hand-edit `manifest.json`. It's regenerated by `make register`.
- Don't commit the bootstrapped dirs (`.claude/`, `.cursor/`, `.github/`, `.kiro/`, etc.). They're gitignored for a reason.
- Don't skip pre-commit hooks (`--no-verify`). If a hook fails, fix the underlying issue and commit again.
- Don't add npm dependencies casually. Each one is shipped to every consumer of `npx git+ssh://...`.
- Don't introduce a new asset type without thinking through how every tool maps it. See [architecture.md](architecture.md#asset-taxonomy).

## License

MIT. By contributing you agree to license your changes under the same terms.
