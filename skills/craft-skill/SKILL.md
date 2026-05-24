---
name: craft-skill
description: Decision-tree skill for self-improvement — when a session reveals a behaviour worth keeping, decide whether to tighten an existing skill's trigger, add a one-line rule, create a new skill, or promote the lesson to an identity file (CLAUDE.md / AGENTS.md / AI_INSTRUCTIONS.md). Triggered by phrases like "you should have caught this", "from now on always X", "never X again", "we keep hitting this". Complementary to the toolkit's eval-driven /improve-skill command.
author: ai-toolkit-dev-skills
presets:
  - dev-skills
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
---

# craft-skill

When a session reveals a behaviour worth keeping, craft-skill decides *where* it should live. Renamed from opulent-toolkit's `improve-skill` to avoid collision with ai-toolkit's existing `/improve-skill` command (the eval-driven body-tuner). The two are complementary: craft-skill picks the file; `/improve-skill` tunes the prose against an eval.

## When to use
- The user says "you should have caught this", "from now on X", "never Y again", "we keep hitting this".
- A `safe-change` run or `review-pr` round revealed a gap that should not recur.
- A recurring pattern (≥2 occurrences) emerged with no skill yet.

## Decision tree
1. **Existing skill that *should* have caught it?**
   → Update it. Tighten the `description:` (clearer trigger phrases users actually say), add the missing step or rule, keep the body under the cap (80 lines normal, 120 SDLC). Then run `/improve-skill <name>` to tune the body against its eval.
2. **One-off in an existing skill's area?**
   → Add a one-line rule to that skill's `## Rules` section.
3. **Recurring pattern with no skill yet?**
   → Two contexts:
   - **Editing a toolkit source** (ai-toolkit itself, or another repo with a `Makefile` + `manifest.json` registry): create the new skill at `skills/<short-slug>/SKILL.md` with adjacent `eval.json`, add `presets: [<preset>]` to its frontmatter if it should ship with a preset, then `make register` to regenerate the manifest.
   - **Editing a downstream repo with an installed preset** (e.g. a SmartAgents repo where `.claude/skills/` came from `ai-toolkit install`): don't author skills under `.claude/skills/<name>/` directly — those get overwritten on the next `ai-toolkit update`. File an issue/PR upstream in the toolkit repo instead.
4. **Repo-wide default, not skill-specific?**
   → Promote to the canonical identity file:
   - **hub-like repo:** `AI_INSTRUCTIONS.md` (canonical there).
   - **application repos:** `AGENTS.md` (canonical; `CLAUDE.md` / `CURSOR.md` / `GEMINI.md` are tool-specific stubs).
   - **user-global:** `~/.claude/CLAUDE.md` only when the rule is cross-project.
5. **Cross-repo rule that affects multiple repos?**
   → Promote to the wiki via `wiki-keeper` (filed under `docs/governance/` or `docs/decisions/`), then point each repo's identity file at the wiki entry. Never duplicate the rule in N identity files.

## Authoring rules for new skills
- YAML frontmatter: `name`, `description`, `author`, `presets`, `tools`. Description is the trigger — list trigger phrases users actually say.
- Body cap: ≤80 lines normal, ≤120 lines SDLC.
- Reference other skills by name with markdown emphasis (`` `other-skill` ``) — don't duplicate their content.
- State NEVER rules explicitly: "Never `git add -A`" beats "use selective add".
- Ship an `eval.json` next to the SKILL.md from day one. 3–5 tests, mix of `contains` / `regex` / `not_contains`.
- Add a dated `## Lessons learned` tail entry with the PR number when iterating in response to a real incident.

## Workflow
1. Identify the target file (existing skill / new skill / identity file / wiki).
2. Run via `safe-change` — skill edits need a worktree + commit + PR like any other change.
3. The PR body's "Why this change" cites the session that surfaced it.
4. After merge, verify the improvement by reading the changed file fresh in a new session.

## When NOT to use
- One-conversation stylistic preferences.
- Env-specific or machine-specific issues.
- Anything that contradicts an existing skill — discuss with the user first.

## Cross-references
- See ai-toolkit's `/improve-skill` command for the eval-driven body-tuning loop — run it after craft-skill points you at the target file.
- See `safe-change` for the PR/worktree procedure every craft-skill edit goes through.
- See `review-pr` § 5 for the SDLC-consistency check the resulting PR is graded against.
