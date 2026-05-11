#!/usr/bin/env bash
# scripts/bootstrap.sh — set up the toolkit's own .claude/, .cursor/,
# .github/, and .kiro/ directories using the toolkit itself. Run after
# cloning the repo so contributors immediately get the maintainer's
# skills, agents, commands, and rules in whichever tool they use.
#
# Generated directories are gitignored — re-run after editing source
# assets to refresh them.

set -euo pipefail

cd "$(dirname "$0")/.."

CLI="node bin/cli.js"

bootstrap_tool() {
  local tool="$1"; shift
  local target="$1"; shift
  echo ""
  echo "→ Bootstrapping $tool into $target ($*)"
  # shellcheck disable=SC2068
  $CLI install --tool "$tool" --target "$target" --link --force $@
}

# Claude Code — primary maintainer-facing tool.
bootstrap_tool claude-code .claude \
  --skills code-review-checklist,api-endpoint-design,error-handling-patterns,comprehensive-review \
  --agents senior-architect,refactoring-specialist,test-writer \
  --commands summarize-diff,explain-error,bump-version \
  --hooks pre-commit-lint \
  --rules no-bare-todos,prefer-typed-errors

# Cursor — uses .cursor/rules/. Frontmatter-transformed assets fall
# back to a copy (warning is expected; we still want the file present).
bootstrap_tool cursor .cursor \
  --skills code-review-checklist,api-endpoint-design,error-handling-patterns \
  --rules no-bare-todos,prefer-typed-errors

# VS Code Copilot — uses .github/instructions, .github/prompts,
# .github/chatmodes. Workspace must enable chat.promptFiles for Copilot
# to actually load these (see docs/verification-matrix.md).
bootstrap_tool vscode-copilot .github \
  --skills code-review-checklist,error-handling-patterns \
  --commands summarize-diff,explain-error \
  --agents senior-architect

echo ""
echo "✓ Bootstrap complete. Generated trees:"
for d in .claude .cursor .github; do
  if [ -d "$d" ]; then
    echo "  $d/"
  fi
done
echo ""
echo "  These directories are gitignored. Re-run 'make bootstrap' after"
echo "  editing source assets to refresh them."
