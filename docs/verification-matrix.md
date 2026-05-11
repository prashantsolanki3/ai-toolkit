# Tool verification matrix

The automated tests in this repo verify **file placement** — that running
`ai-toolkit install --tool X` lays files down at the paths declared in
[`config/tools.json`](../config/tools.json). They do **not** verify that the
receiving tool (Claude Code, Cursor, VS Code, Kiro, etc.) successfully reads
those files and changes its behavior accordingly. That verification can only
be done with the live tool in front of you.

This document is the manual checklist. Run it after any change to a tool
block in `config/tools.json` to confirm the destination is still what the
tool wants.

---

## How to run the checklist (general procedure)

```bash
# 1. Install into a scratch project
mkdir -p ~/tmp/aitk-verify-<tool> && cd ~/tmp/aitk-verify-<tool>
node /path/to/ai-toolkit/bin/cli.js install \
  --tool <tool-name> \
  --skills code-review-checklist \
  --target <target-from-the-matrix-below>

# 2. Inspect what landed
find <target> -type f

# 3. Open the project in the actual tool
# 4. Trigger a chat / completion that would benefit from the installed asset
# 5. Confirm the tool surfaces or uses it (see per-tool checks below)
# 6. Record the outcome in this file under "Last verified"
```

---

## claude-code

- **Target:** `.claude/` (workspace) or `~/.claude/` (global)
- **Expected layout after install:**
  - `.claude/skills/code-review-checklist/SKILL.md`
  - `.claude/agents/senior-architect.md`
  - `.claude/commands/summarize-diff.md`
  - `.claude/hooks/pre-commit-lint.sh`
- **How to verify ingestion:**
  1. Open Claude Code inside the target project.
  2. Skills: ask a question that the skill applies to (e.g. "review my API endpoints"). Confirm Claude Code lists the skill in its progress or applies the checklist content.
  3. Agents: type `/agents` — `senior-architect` should appear in the list. Invoke it; confirm the system prompt reflects the agent file.
  4. Commands: type `/summarize-diff` — Claude Code should auto-complete and run the command body.
  5. Hooks: hook scripts placed in `.claude/hooks/` only run if also referenced in `.claude/settings.json` (hooks are wired by config, not by file presence). Add a `Stop` or `PreToolUse` entry pointing at the script.
- **Last verified:** _pending_

## cursor

- **Target:** `.cursor/` (workspace only — Cursor has no documented global rules path)
- **Expected layout after install:**
  - `.cursor/rules/code-review-checklist.mdc`
- **How to verify ingestion:**
  1. Open the project in Cursor.app.
  2. Open Cursor Settings → Rules. The `code-review-checklist` rule should be listed.
  3. Open Composer / Chat; the rule body should appear in the context preview (Cursor surfaces active rules in its prompt builder).
  4. Trigger a generation that should match the rule's `globs` (if set) and confirm the rule fires.
- **Caveats:** Our source `SKILL.md` files do not include Cursor-specific frontmatter (`description`, `globs`, `alwaysApply`). Cursor will still load the file but treats it as a fallback rule. To get full Cursor semantics, add that frontmatter to your skill source or run a post-install hook to inject it.
- **Last verified:** _pending_

## antigravity

- **Target:** `.agent/skills/` (workspace) or `~/.gemini/antigravity/skills/` (global)
- **Expected layout after install:**
  - `.agent/skills/code-review-checklist/SKILL.md`
- **How to verify ingestion:** Open the project in Google Antigravity. Open the agent panel; the skill should appear in the available skills list. Trigger an agent task that the skill covers and confirm the agent references the skill.
- **Caveats:** Antigravity is moving fast and exact path conventions may change between releases. Re-run this check after any Antigravity update.
- **Last verified:** _pending_

## gemini-cli

- **Target:** `.gemini/` (workspace) or `~/.gemini/` (global)
- **Expected layout after install:**
  - `.gemini/skills/code-review-checklist/SKILL.md`
- **How to verify ingestion:** Run `gemini` (the CLI) inside the target directory. Start a session and confirm via debug output that the skill is loaded into context. Earlier Gemini CLI versions only honor a single `GEMINI.md` context file at the workspace root — those builds will _not_ pick up the `skills/` directory layout. Update Gemini CLI if your version is older than the one that introduced skills support.
- **Caveats:** This is the config I'm least confident about. Verify against your installed Gemini CLI's documentation and adjust `assetPaths`/`assetFormats` in `config/tools.json` if the layout differs.
- **Last verified:** _pending_

## vscode-copilot

- **Target:** `.github/` (workspace only — Copilot reads `.github/` from the repo)
- **Expected layout after install:**
  - `.github/instructions/code-review-checklist.instructions.md`
  - `.github/prompts/summarize-diff.prompt.md` (if `--commands` passed)
  - `.github/chatmodes/senior-architect.chatmode.md` (if `--agents` passed)
- **How to verify ingestion:**
  1. Open the workspace in VS Code with the GitHub Copilot extension installed.
  2. Enable workspace setting `chat.promptFiles: true` (and `chat.instructionsFilesLocations` / `chat.modeFilesLocations` if you keep files elsewhere). Without this, Copilot ignores the files.
  3. Run the **"Chat: Configure Chat Instructions"** command (palette) — the installed instruction file should appear in the list.
  4. Open Copilot Chat. The `applyTo`-matched instruction should be surfaced or attached automatically; if it isn't, attach it manually and confirm it shows in the message context.
  5. Custom chat modes: open the mode selector in Copilot Chat. The installed `*.chatmode.md` should appear; select it and confirm the persona is applied.
- **Caveats:** Our source `SKILL.md` files don't include the `applyTo` frontmatter that Copilot uses to scope instructions. After install, edit each `.instructions.md` to add `applyTo: '**'` (or a more specific glob). A future improvement: a `--postprocess` install hook that injects target-specific frontmatter.
- **Last verified:** _pending_

## copilot-cli

- **Target:** `.github/` (workspace) or `~/.copilot/` (global) — this is the **new agentic `copilot` CLI**, not the older `gh copilot` extension.
- **Expected layout after install:**
  - `.github/instructions/code-review-checklist.instructions.md`
  - `.github/prompts/summarize-diff.prompt.md`
- **How to verify ingestion:**
  1. Install the agentic Copilot CLI per GitHub's docs.
  2. Run `copilot` inside the target directory.
  3. Start a session; the instructions should be loaded into context. Use the CLI's `/context` or equivalent to confirm.
  4. Reference a prompt file via `/prompts <name>` (or whatever the current incantation is) and confirm it runs.
- **Caveats:** If you're actually using `gh copilot` (the legacy extension), this config does nothing useful for you — that extension has no per-project asset model. There's also no stable path contract for the new agentic CLI yet; this config is a best guess.
- **Last verified:** _pending_

## kiro

- **Target:** `.kiro/` (workspace only)
- **Expected layout after install:**
  - `.kiro/steering/code-review-checklist.md`
  - `.kiro/hooks/pre-commit-lint.sh` (if `--hooks` passed)
- **How to verify ingestion:**
  1. Open the workspace in AWS Kiro.
  2. Open the Kiro side panel → Steering. The installed steering file should appear in the list (Kiro reads `.kiro/steering/*.md` automatically).
  3. Start a Kiro agent task. Confirm the agent references the steering content (the steering should appear in the context or affect generation).
  4. Hooks: a `.sh` in `.kiro/hooks/` is not sufficient on its own — Kiro registers hooks via `.kiro.hook` JSON files alongside the script. Either create the JSON by hand or use Kiro's "Agent Hooks" UI to register your script.
- **Caveats:** The Kiro asset model evolves; cross-check against the live docs before relying on this for production.
- **Last verified:** _pending_

## kiro-cli

- **Target:** `.kiro/` (workspace) or `~/.kiro/` (global)
- **Expected layout after install:**
  - `.kiro/steering/code-review-checklist.md`
- **How to verify ingestion:** I do not have confirmed documentation for a separate "Kiro CLI" product. If your Kiro CLI is just headless Kiro reading `.kiro/`, the same verification as Kiro IDE applies. If it has its own config root, override `defaultTarget` in `config/tools.json` and re-verify.
- **Caveats:** Treat this config as a placeholder. Run `ai-toolkit list --type tools` and adjust the kiro-cli block once you confirm the actual paths the CLI reads.
- **Last verified:** _pending_

---

## Where this matrix lives in CI

This matrix is **not** automated. Adding a `selenium`-style integration runner for each IDE would multiply the maintenance cost without adding much over a careful manual check after every config change. The honest tradeoff: keep `config/tools.json` small enough that this matrix is fast to walk through, and treat each block in the config as a contract with a single named owner who runs the check.

If you find an automated way to verify a specific tool's ingestion (e.g. Cursor exposes a CLI flag that lists active rules, or Claude Code surfaces loaded skills in `claude doctor`), add it to that tool's section and link it from the automated test suite.
