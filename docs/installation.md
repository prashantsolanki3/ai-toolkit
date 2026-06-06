# Installation

ai-toolkit is published to npm. No local clone needed.

## 1. `npx` from npm (canonical — pin a version)

```bash
# Install for every supported tool at once (pinned to 1.0.0):
cd ~/my-project
npx --yes ai-toolkit@1.0.0 install --preset skill-development

# Or target a single tool:
npx --yes ai-toolkit@1.0.0 install \
  --tool claude-code \
  --preset skill-development
```

`--yes` skips npx's install-confirmation prompt, so the command works in CI and non-interactive shells.

Pinning the version (`@1.0.0`) gives you reproducible installs across machines and lockfiles — `npm` records the resolved version in your lockfile on first install. Omitting the version gives you the latest published release.

## 2. `npx` from a local checkout (during dev / before publish)

```bash
# From any other directory
npx --yes /absolute/path/to/ai-toolkit install \
  --tool claude-code \
  --preset skill-development
```

Two things to know:

- **`--yes`** skips the "install this package?" prompt.
- **The npx cache** can get sticky — npx caches resolved packages by name and version. If you edit the source and re-run, you may see stale behaviour. Pass `--no-cache` to bypass it:

```bash
npx --no-cache --yes /absolute/path/to/ai-toolkit install \
  --tool claude-code \
  --preset skill-development
```

## 3. Direct `node` invocation (fastest during dev)

```bash
node /absolute/path/to/ai-toolkit/bin/cli.js install \
  --tool claude-code \
  --preset skill-development
```

Bypasses npx entirely. No caching to worry about. This is what the test suite uses.

## 4. `npm link` for ambient access

If you'll use the toolkit a lot during development:

```bash
cd /path/to/ai-toolkit
npm link
# now from anywhere:
ai-toolkit install --tool claude-code --preset skill-development
# when you're done:
npm unlink -g ai-toolkit
```

`npm link` symlinks the toolkit's `bin/cli.js` into your global npm bin. The downside is one more thing to remember to unlink.

## Pinning in dots / downstream repos

For a downstream repo (e.g. `dots`) that needs a stable, reproducible reference:

```bash
# Install and record in package.json:
npm install --save-dev ai-toolkit@1.0.0

# Or run without persisting:
npx --yes ai-toolkit@1.0.0 install --tool claude-code --preset dev-skills
```

The exact version to pin: **`1.0.0`** (tag `v1.0.0`).

## Verifying the installation

Once it's runnable, smoke-test with:

```bash
ai-toolkit list                       # lists everything the toolkit can install
ai-toolkit list --type tools          # lists supported tools
ai-toolkit installed                  # shows nothing if you haven't installed yet
```

## What gets dropped where

`ai-toolkit install` writes files into a subdirectory under your project root, chosen by the tool. The defaults (set in [`config/tools.json`](../config/tools.json)):

| Tool             | Subdir          | Notes                                                  |
| ---------------- | --------------- | ------------------------------------------------------ |
| `claude-code`    | `.claude/`      | Skills, agents, commands, hooks, rules                 |
| `cursor`         | `.cursor/`      | Skills mapped to rules; rules native                   |
| `antigravity`    | `.agent/skills/`| Skills only                                            |
| `gemini-cli`     | `.gemini/`      | Skills only                                            |
| `vscode-copilot` | `.github/`      | Skills → instructions; commands → prompts; agents → [custom agents](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents) at `.github/agents/` |
| `copilot-cli`    | `.github/`      | Shares destination with vscode-copilot                 |
| `kiro`           | `.kiro/`        | Skills → steering; hooks generate `.kiro.hook` sidecar |
| `kiro-cli`       | `.kiro/`        | Shares destination with kiro                           |

For tools whose dir comes from your home (`~/.claude`, `~/.gemini`, `~/.copilot`), pass `--scope global`. See [usage.md](usage.md#scopes-workspace-vs-global).

## Removing the toolkit

There's no global install state to clean up — every install only touches the project's tool subdirs. To undo:

```bash
ai-toolkit remove --tool claude-code --all   # tear down one tool
ai-toolkit remove --all                       # tear down all installed tools
```

If you used `npm link`, also run `npm unlink -g ai-toolkit`.
