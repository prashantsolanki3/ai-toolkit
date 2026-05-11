# `ai-toolkit` — Implementation Plan

Project: `ai-toolkit`
Distribution: Private GitHub repo only. Not published to npm. Installed via `npx git+ssh://...` directly from the repo.
Goal: A tool-agnostic CLI that installs and updates skills, agents, commands, and hooks across any AI coding tool (Claude Code, Cursor, Antigravity, Gemini CLI, and any future tool added to a config file).
Built strictly TDD with a Makefile-driven dev workflow.

## 1. Success criteria

- Tool definitions live in a config file — adding a new tool requires zero changes to install/update/remove logic
- `npx git+ssh://git@github.com:<you>/ai-toolkit.git install --preset <name> --tool <tool>` works end-to-end for at least three tools
- `update` correctly diffs and overwrites only tracked assets, per tool
- All production code has a preceding failing test
- Multi-tool integration matrix proves the abstraction holds
- Sample content is fully generic and publishable
- All dev workflows (test, lint, scan, release, smoke test) run via `make` targets
- Repo stays private; no npm publish step anywhere in the pipeline

## 2. Repo scaffolding

```
ai-toolkit/
├── Makefile                  # all dev commands routed through here
├── package.json              # "name": "ai-toolkit", "private": true, "bin": { "ai-toolkit": "./bin/cli.js" }
├── README.md
├── PLAN.md                   # this document
├── LICENSE                   # MIT
├── .gitignore
├── .gitattributes            # * text=auto eol=lf
├── bin/
│   └── cli.js                # shebang + commander entry point
├── src/
│   ├── commands/
│   │   ├── install.js
│   │   ├── update.js
│   │   ├── remove.js
│   │   ├── list.js
│   │   └── installed.js
│   ├── lib/
│   │   ├── tools.js          # tool config loader (foundation)
│   │   ├── manifest.js
│   │   ├── lockfile.js
│   │   ├── fs-ops.js
│   │   ├── git-ops.js
│   │   ├── resolver.js
│   │   └── logger.js
│   └── index.js
├── config/
│   ├── tools.json
│   └── tools.schema.json
├── manifest.json
├── skills/
├── agents/
├── commands/
├── hooks/
├── scripts/
│   ├── smoke-test.sh         # invoked by `make smoke`
│   └── verify-tools.sh       # invoked by `make verify-tools`
└── test/
    ├── unit/
    ├── integration/
    ├── fixtures/
    └── helpers/
        ├── tmp-project.js
        └── fake-source.js
```

See README.md for full usage. The full plan that drove this implementation lives in the project history.

## Build order followed

1. Repo scaffold + Makefile + test helpers
2. `src/lib/tools.js` — tool config foundation (TDD)
3. `src/lib/manifest.js` (TDD)
4. `src/lib/fs-ops.js` (TDD)
5. `src/lib/lockfile.js` (TDD)
6. `src/lib/resolver.js` (TDD)
7. `src/lib/git-ops.js` (TDD)
8. `src/lib/logger.js` (TDD)
9. Sample content (skills, agents, commands, hooks, manifest, presets)
10. `src/commands/install.js` (TDD)
11. `src/commands/update.js` (TDD)
12. `src/commands/remove.js` (TDD)
13. `src/commands/list.js` (TDD)
14. `src/commands/installed.js` (TDD)
15. `bin/cli.js` (TDD via spawn)
16. Multi-tool integration matrix (parameterized over `config/tools.json`)
17. README, smoke test, release-check
