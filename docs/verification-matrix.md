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
  - `.claude/rules/no-bare-todos.md`

### Verifying each asset type

**Skills, agents, commands:** these three Claude Code reads automatically. Ask a question the skill applies to and confirm Claude Code surfaces or uses it; type `/agents` and see `senior-architect`; type `/summarize-diff` and see the command auto-complete.

**Hooks** — Claude Code does NOT auto-discover scripts in `.claude/hooks/`. The script file is there, but until you reference it from `.claude/settings.json` it never runs. Add an entry like:

```json
{
  "hooks": {
    "Stop": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "./.claude/hooks/pre-commit-lint.sh" }] }
    ]
  }
}
```

Then trigger the matching event (in this example, finish a turn) and check the script ran.

**Rules** — Claude Code does NOT auto-load `.claude/rules/<name>.md`. There is no first-class "rules" concept; this toolkit ships the directory as a parking spot. To use a rule in Claude Code, reference it from `CLAUDE.md` (project memory) or from a skill body. For example, add to `CLAUDE.md`:

```markdown
## Project rules

@.claude/rules/no-bare-todos.md
@.claude/rules/prefer-typed-errors.md
```

Then Claude Code pulls the rule body into context whenever it loads project memory. If you want a rule to apply globally, add the import to your user-level `CLAUDE.md` instead.

- **Last verified:** _pending_

## cursor

- **Target:** `.cursor/` (workspace only — Cursor has no documented global rules path)
- **Expected layout after install:**
  - `.cursor/rules/code-review-checklist.mdc` — with frontmatter `{ description, globs, alwaysApply }` generated from the source.
- **How to verify ingestion:**
  1. Open the project in Cursor.app.
  2. Open Cursor Settings → Rules. The `code-review-checklist` rule should be listed.
  3. Open Composer / Chat; the rule body should appear in the context preview.
  4. Trigger a generation that should match the rule's `globs` (if set) and confirm the rule fires.
- **No longer a caveat — automated:** Cursor frontmatter (description/globs/alwaysApply) is injected automatically by the installer based on the tool config in [`config/tools.json`](../config/tools.json). Per-asset overrides via `overrides.cursor.{globs, alwaysApply}` in the source frontmatter.
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
  - `.github/instructions/code-review-checklist.instructions.md` — frontmatter `{ description, applyTo: "**" }`
  - `.github/prompts/summarize-diff.prompt.md` — frontmatter `{ description, mode: "agent" }`
  - `.github/chatmodes/senior-architect.chatmode.md` — frontmatter `{ description }`
- **How to verify ingestion:**
  1. Open the workspace in VS Code with the GitHub Copilot extension installed.
  2. **Required:** enable workspace setting `chat.promptFiles: true` (and `chat.instructionsFilesLocations` / `chat.modeFilesLocations` if you keep files elsewhere). Without this, Copilot ignores the files.
  3. Run the **"Chat: Configure Chat Instructions"** command (palette) — the installed instruction file should appear in the list.
  4. Open Copilot Chat. The `applyTo`-matched instruction should be surfaced or attached automatically.
  5. Custom chat modes: open the mode selector. The installed `*.chatmode.md` should appear; select it and confirm the persona is applied.
- **No longer a caveat — automated:** `applyTo` for instructions, `mode` for prompts, and `description` for chat modes are now injected by the installer (`config/tools.json`). Per-asset overrides via `overrides.vscode-copilot.{applyTo, mode, tools, model}`.
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
  - `.kiro/hooks/pre-commit-lint.kiro.hook` — JSON sidecar generated automatically: `{ name, description, command, enabled }`
- **How to verify ingestion:**
  1. Open the workspace in AWS Kiro.
  2. Open the Kiro side panel → Steering. The installed steering file should appear in the list (Kiro reads `.kiro/steering/*.md` automatically).
  3. Start a Kiro agent task. Confirm the agent references the steering content (the steering should appear in the context or affect generation).
  4. Hooks: open the Agent Hooks panel. The hook should be registered automatically because the installer generates the `.kiro.hook` JSON sidecar alongside the `.sh`. Verify the script path in the hook descriptor points at `./<name>.sh` relative to `.kiro/hooks/`.
- **No longer a caveat — automated:** The `.kiro.hook` JSON descriptor is generated alongside the script (`config/tools.json` declares the sidecar template). Adjust the template there if Kiro's hook schema changes.
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
