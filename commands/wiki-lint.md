---
name: wiki-lint
description: Health-check the LLM-maintained wiki — flags orphans, stale pages, contradictions, dangling wiki-links, missing pages, and INDEX drift.
author: ai-toolkit-dev-skills
presets:
  - dots-baseline
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
argument-hint: "[--apply]"
overrides:
  vscode-copilot:
    mode: agent
  copilot-cli:
    mode: agent
---

Run a lint/health-check over the project's wiki at `docs/`.

**Args:** $ARGUMENTS (pass `--apply` to auto-apply safe fixes; default is report-only)

## Flow

1. Resolve the wiki root the same way the `wiki-keeper` agent does — use `./docs/` if the current repo hosts its own wiki, otherwise probe sibling hosts (`../smart-agents-hub/docs/`, `../../smart-agents-hub/docs/`, or `$SMART_AGENTS_HUB/docs/`). Read the resolved `docs/CLAUDE.md` (schema). Only if no `docs/CLAUDE.md` is reachable from any host, stop.

2. Delegate to the `wiki-keeper` subagent via the `Agent` tool with `subagent_type: wiki-keeper` and a prompt that:
   - Tells it to run the **lint** flow as defined in the schema.
   - Lists the checks required: orphans, stale, contradictions, dangling wiki-links, missing-but-referenced concepts, INDEX drift, cross-zone drift.
   - If `$ARGUMENTS` contains `--apply`, tells it to auto-apply safe fixes (INDEX drift is always safe). Otherwise, report only.

3. Present the lint report with severity (info / warn / error) and grouped by check type.

4. For warn/error items, ask the user which to fix. Wiki-keeper applies confirmed fixes, appends `## [YYYY-MM-DD] lint | <n issues, <m fixes>` to `LOG.md`, and reports deltas.

## Notes

- Run weekly, or schedule via claudeclaw heartbeat.
- After a big ingest pass (3+ sources in a day), run lint immediately — ingest stubs are likely orphan until cross-references catch up.
- Cross-zone drift (living-zone claim contradicts a governed-zone doc) is **never** auto-fixed. Wiki-keeper will flag and propose a synthesis note; the human decides which source is authoritative.

<!-- MIT, see LICENSE -->
