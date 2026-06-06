---
name: wiki-query
description: Answer a question from the LLM-maintained wiki with citations; optionally file the answer back so the synthesis compounds.
author: ai-toolkit-dev-skills
presets:
  - dots-baseline
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
argument-hint: <question>
overrides:
  vscode-copilot:
    mode: agent
  copilot-cli:
    mode: agent
---

Query the project's wiki at `docs/` for a question and synthesise an answer.

**Question:** $ARGUMENTS

## Flow

1. Resolve the wiki root the same way the `wiki-keeper` agent does — use `./docs/` if the current repo hosts its own wiki, otherwise probe sibling hosts (`../smart-agents-hub/docs/`, `../../smart-agents-hub/docs/`, or `$SMART_AGENTS_HUB/docs/`). Read the resolved `docs/CLAUDE.md` (the schema) and `docs/INDEX.md` (the catalog). Only if no `docs/CLAUDE.md` is reachable from any host, stop and tell the user the wiki isn't initialised.

2. Delegate to the `wiki-keeper` subagent via the `Agent` tool with `subagent_type: wiki-keeper` and a prompt that:
   - Includes the question from `$ARGUMENTS`.
   - Tells it to run the **query** flow as defined in the schema.
   - Asks it to use qmd MCP (`mcp__qmd__query`) if the candidate set from INDEX lookup is thin.
   - Requests a synthesised answer with citations (wiki-link references to the pages it drew from).
   - Asks whether the answer is substantive enough to file back to `synthesis/`.

3. Present the answer with citations. If wiki-keeper recommends file-back, ask the user to confirm before creating the synthesis page.

4. If the user confirms file-back, wiki-keeper writes `synthesis/YYYY-MM-DD-<slug>.md`, updates INDEX, appends to LOG, and updates `related:` frontmatter on source pages.

## Notes

- Citation format: inline `[[entities/vendor-openai]]`, `[[concepts/model-tier-contract]]`, or `see docs/contracts/model-tier-contract.md` for governed-zone refs.
- If the wiki is silent on the topic, wiki-keeper will tell you so and may suggest a source to ingest. Do not fabricate answers — silence is a signal.
- qmd indexes might be stale. If the query result set feels thin and the LOG shows recent ingests, suggest `qmd embed docs/ --incremental` first.

<!-- MIT, see LICENSE -->
