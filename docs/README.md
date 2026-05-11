# ai-toolkit documentation

Tool-agnostic CLI that installs and updates skills, agents, commands, hooks, and rules across AI coding tools — Claude Code, Cursor, Antigravity, Gemini CLI, VS Code Copilot, GitHub Copilot CLI, Kiro, and Kiro CLI.

For a quick orientation, start with [usage.md](usage.md). For setup, [installation.md](installation.md). For first-time contributors, [contributing.md](contributing.md).

## Index

### Day-to-day

| Doc | What it covers |
| --- | --- |
| [installation.md](installation.md) | All four install methods (npx-from-git, npx-from-local-path, direct `node`, `npm link`). |
| [usage.md](usage.md) | Every command, every flag, common workflows. |
| [verification-matrix.md](verification-matrix.md) | Per-tool manual ingestion checks — does Claude Code actually surface this skill in its UI, does Cursor load this rule, etc. |

### Internals and design

| Doc | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | The core abstraction (`config/tools.json` as the contract), asset taxonomy, lockfile semantics, frontmatter transformation, non-destructive install, the test layering. |
| [eval-format.md](eval-format.md) | The `eval.json` schema — assertion types, agent-driven evaluation, how the runner works without an API key. |

### Contributing

| Doc | What it covers |
| --- | --- |
| [contributing.md](contributing.md) | Workflow, TDD discipline, Makefile targets, bootstrap, pre-share checklist. |
| [guides/adding-a-tool.md](guides/adding-a-tool.md) | Add support for a new AI tool by editing one file (`config/tools.json`). |
| [guides/adding-an-asset.md](guides/adding-an-asset.md) | Add a new skill/agent/command/hook/rule. |
| [guides/frontmatter-reference.md](guides/frontmatter-reference.md) | Full reference for universal + per-tool override frontmatter fields. |
| [guides/evaluation-workflow.md](guides/evaluation-workflow.md) | `/eval-skill` and `/improve-skill` — the IDE-driven loop for self-improving skills. |

## Doc maintenance

The `docs-maintainer` agent (`agents/docs-maintainer/agent.md`) is the antidote to documentation rot. Invoke it after a substantive change to:

- The CLI surface (flags, command behaviour).
- The config schema or asset taxonomy.
- The default values or destination paths.

The agent reads each doc, cross-references concrete claims against the implementation, and proposes targeted edits. It never silently rewrites prose.

```
@docs-maintainer audit the docs against the recent change to <area>
```

It's part of the `skill-development` preset and gets installed by `make bootstrap`.

## Conventions

- Internal links use relative paths (`../config/tools.json`, `./usage.md`).
- Code blocks are language-tagged for syntax highlighting.
- Every doc opens with one sentence stating what it covers.
- Lists of options always include the default in the "Default" column.
- Tables describe contracts (what fields mean); code blocks show how to use them.

If you spot drift between a doc and the implementation, file it as a `docs:` commit — or, better, invoke `docs-maintainer` and let it propose the diff.
