---
name: wiki-ingest
description: File a new source into the LLM-maintained wiki — reads, summarises, updates entities/concepts, logs.
author: ai-toolkit-dev-skills
presets:
  - dots-baseline
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
argument-hint: <path-or-url>
overrides:
  vscode-copilot:
    mode: agent
  copilot-cli:
    mode: agent
---

Ingest a new source into the project's wiki at `docs/`.

**Source:** $ARGUMENTS

## Flow

1. Resolve the wiki root, then read its `docs/CLAUDE.md` (the wiki schema) first. Follow the same resolution rules as the `wiki-keeper` agent: use `./docs/CLAUDE.md` if the current repo hosts its own wiki, otherwise probe sibling hosts (`../smart-agents-hub/docs/CLAUDE.md`, `../../smart-agents-hub/docs/CLAUDE.md`, or `$SMART_AGENTS_HUB/docs/CLAUDE.md`). Only if no `docs/CLAUDE.md` is reachable, stop and tell the user the wiki isn't initialised. To scaffold one, run the canonical wiki-scaffolding flow (in SmartAgents this is the dots playbook: `ansible-playbook scaffold-wiki.yml -e "wiki_target=$(pwd)"`).

2. Delegate to the `wiki-keeper` subagent via the `Agent` tool with `subagent_type: wiki-keeper` and a prompt that:
   - Includes the source path/URL from `$ARGUMENTS`.
   - Tells it to run the **ingest** flow as defined in the schema.
   - Requests a report of touched pages + a one-paragraph summary of what was learned.

3. After wiki-keeper returns, summarise to the user what changed (pages touched, key takeaways, any stubs created) and suggest whether a `qmd embed docs/ --incremental` is worth running.

## Notes

- If `$ARGUMENTS` is a URL, wiki-keeper will fetch it first (via WebFetch), convert to markdown, then file.
- If `$ARGUMENTS` is a local PDF, wiki-keeper will suggest running `pandoc <path> -o <path>.md` first if pandoc is installed; otherwise it reads the PDF directly via the `Read` tool and saves a markdown summary alongside.
- A single ingest touches 5–15 pages. Don't be surprised.
- Sources are **immutable** once filed — corrections go into entity/concept pages, not into the source.

<!-- MIT, see LICENSE -->
