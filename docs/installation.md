# Installation

ai-toolkit is distributed as a **private GitHub repo**, not published to npm. Three ways to use it:

## 1. `npx` from GitHub (the eventual production path)

Once the repo is on GitHub:

```bash
npx git+ssh://git@github.com:<you>/ai-toolkit.git install \
  --tool claude-code \
  --preset backend-essentials
```

Pin to a specific commit with a `#sha` suffix if you want reproducible installs across machines:

```bash
npx git+ssh://git@github.com:<you>/ai-toolkit.git#abc1234 install ...
```

The machine running `npx` needs SSH access to the private repo (your SSH key on GitHub). No npm registry traffic.

## 2. `npx` from a local checkout (before the repo lands on GitHub)

```bash
# From any other directory
npx --yes /absolute/path/to/ai-toolkit install \
  --tool claude-code \
  --preset backend-essentials
```

Two things to know:

- **`--yes`** skips the "install this package?" prompt.
- **The npx cache** can get sticky — npx caches resolved packages by name and version. If you edit the source and re-run, you may see stale behaviour. Force a fresh resolve with `npm cache clean --force`.

## 3. Direct `node` invocation (fastest during dev)

```bash
node /absolute/path/to/ai-toolkit/bin/cli.js install \
  --tool claude-code \
  --preset backend-essentials
```

Bypasses npx entirely. No caching to worry about. This is what the test suite uses.

## 4. `npm link` for ambient access

If you'll use the toolkit a lot during development:

```bash
cd /path/to/ai-toolkit
npm link
# now from anywhere:
ai-toolkit install --tool claude-code --preset backend-essentials
# when you're done:
npm unlink -g ai-toolkit
```

`npm link` symlinks the toolkit's `bin/cli.js` into your global npm bin. The downside is one more thing to remember to unlink.

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
| `vscode-copilot` | `.github/`      | Skills → instructions; commands → prompts; agents → chatmodes |
| `copilot-cli`    | `.github/`      | Shares destination with vscode-copilot                 |
| `kiro`           | `.kiro/`        | Skills → steering; hooks generate `.kiro.hook` sidecar |
| `kiro-cli`       | `.kiro/`        | Shares destination with kiro                           |

For tools whose dir comes from your home (`~/.claude`, `~/.gemini`, `~/.copilot`), pass `--scope global`. See [usage.md](usage.md#scopes-workspace-vs-global).

## Removing the toolkit

There's no global install state to clean up — every install only touches the project's tool subdirs. To undo:

```bash
ai-toolkit remove --tool claude-code --all   # tear down one tool
ai-toolkit remove --all                       # tear down whichever tool is autodiscovered
```

If you used `npm link`, also run `npm unlink -g ai-toolkit`.
