---
name: wiki-maintenance
description: Use this skill whenever the user asks to ingest a source, file material into the wiki, search/query the wiki, run a wiki lint/health check, or drops content into a project's `docs/sources/` directory. Triggers include "ingest this", "add to wiki", "file this under", "search the wiki", "check the wiki", "wiki lint", "process these sources", "file this back", "what does the wiki say about", "has anyone looked into". Explains the LLM-maintained wiki pattern, the three slash commands (`/wiki-ingest`, `/wiki-query`, `/wiki-lint`), the wiki-keeper subagent, and the qmd search tool.
author: ai-toolkit-dev-skills
presets:
  - dots-baseline
tools:
  - claude-code
  - cursor
  - vscode-copilot
  - copilot-cli
---

# Wiki Maintenance Skill

This project uses the **LLM-maintained wiki pattern**: raw sources → LLM-curated markdown → compounding synthesis. Knowledge accumulates rather than being rediscovered every query.

## Check first

Before doing anything, resolve the wiki root the same way the `wiki-keeper` agent does — a local `docs/` is **not** mandatory. Use `./docs/` if the current repo hosts its own wiki; otherwise probe sibling hosts in order (`../smart-agents-hub/docs/`, `../../smart-agents-hub/docs/`, or `$SMART_AGENTS_HUB/docs/`) and write there. Verify the resolved root has a schema:

```bash
test -f docs/CLAUDE.md && echo "wiki initialised" || echo "no local wiki — probe siblings or scaffold"
```

If no wiki is reachable from any host, scaffold one with whatever wiki-scaffolding flow your environment provides. In SmartAgents that's the dots playbook (one example, not a hard requirement — any equivalent scaffolder works):

```bash
# Example: from the dots repo root
ansible-playbook scaffold-wiki.yml \
  -e "wiki_target=$(pwd)"
```

That scaffolds the schema, INDEX, LOG, and living-zone subdirs into `docs/`.

## Operations

Three slash commands cover everything:

- **`/wiki-ingest <path-or-url>`** — file a new source. Reads, summarises, updates entities/concepts, logs.
- **`/wiki-query <question>`** — answer from the wiki with citations; optionally file back to `synthesis/`.
- **`/wiki-lint`** — orphans, stale, contradictions, dangling links, INDEX drift.

Each command delegates to the `wiki-keeper` subagent — the only agent that writes to the living zone. The subagent installs to your tool's agents directory (e.g. `~/.claude/agents/wiki-keeper.md` for Claude Code, `.cursor/agents/wiki-keeper.md` for Cursor, `.github/agents/wiki-keeper.md` for Copilot).

## Zones (read `docs/CLAUDE.md` for details)

- **Living zone** (LLM-maintained): `sources/`, `entities/`, `concepts/`, `decisions/`, `runbooks/`, `synthesis/`, `INDEX.md`, `LOG.md`.
- **Governed zone** (human-owned, read-only to wiki-keeper): `workflows/`, `process/`, `contracts/`, `Documentation/`, `governance/`, `plans/`, `compliance/`, `deployment/`, `architecture/`.

Queries may cite governed pages. Ingests may reference them. Lint flags cross-zone drift but does not auto-fix governed content.

## Tooling

- **qmd** (local BM25/vector/rerank markdown search — npm package `@tobilu/qmd`) is MCP-registered by the `dots-baseline` preset (which ships the `qmd` MCP entry); install the `qmd` binary itself separately (`npm i -g @tobilu/qmd`). One-time setup in the project: `qmd collection add docs/ && qmd embed`. Claude uses `mcp__qmd__query` transparently.
- **Obsidian** (optional) as a GUI reader — open the repo as a vault, `[[wiki-links]]` resolve natively, graph view shows entity clusters.
- **Obsidian Web Clipper** — clip articles to `docs/sources/clippings/` as markdown, then `/wiki-ingest` them.
- **Marp CLI** (optional, `@marp-team/marp-cli`) — render wiki pages as slide decks.
- **Pandoc** (optional) — convert PDFs/DOCX → markdown for ingest.

## When to ingest

Ingest material that has lasting value: research papers, vendor docs, customer interviews, postmortems, competitive briefs, meeting notes with durable decisions. **Don't** ingest transient material — PR comments, debugging sessions, one-off slack pings. Those belong in git history or chat.

## When to query

Before re-deriving an answer to a cross-repo or research question, query first. If the wiki has it, cite. If not, you save re-deriving time only on the next question.

## When to lint

Weekly (scheduled via claudeclaw) or immediately after a batch ingest of 3+ sources. Lint surfaces the drift before it compounds.

## Anti-patterns

- Hand-editing living-zone pages without routing through wiki-keeper → INDEX/frontmatter drift.
- Using the wiki as a task tracker → tasks live in the project's issue tracker. Wiki is for synthesis.
- Ingesting everything → wiki noise. Curate hard.
- Writing synthesis directly instead of asking wiki-keeper to file back → skips cross-reference updates.

## Further reading

- Project schema: `docs/CLAUDE.md`
- Workflow guide: `docs/workflows/llm-wiki.md` (if the project includes it)
- Agent spec: the installed `wiki-keeper` agent in your tool's agents directory (`~/.claude/agents/wiki-keeper.md` for Claude Code; `.cursor/agents/` or `.github/agents/` for other tools)

<!-- MIT, see LICENSE -->
