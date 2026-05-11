---
name: code-review-checklist
description: A short, generic checklist to apply when reviewing a code change.
---

# Code Review Checklist

## When to use this skill

Invoke this skill when reviewing a pull request or doing a self-review before opening one. The checklist is intentionally short — long checklists get skipped.

## When not to use it

- For trivial PRs (typo fixes, docs-only) — overkill.
- For PRs in unfamiliar territory where you'd be guessing — pair with someone who knows the area instead.

## Checklist

1. **Does the change do what it claims?** Read the description. Read the diff. Are they the same story?
2. **Is the scope right?** Drive-by refactors hidden inside a feature PR are a flag — ask for them to be split.
3. **What happens at the unhappy paths?** Empty input, null, network error, partial failure. Does the code handle them deliberately, or does it just fall through?
4. **Are tests asserting behavior, not implementation?** A test that breaks every time you refactor isn't pulling its weight.
5. **Are new abstractions earning their keep?** Three usages is a real pattern; one usage in a fresh PR is probably premature.
6. **Are names doing the work?** A function name should let me skip the implementation. A variable name should not require the comment next to it.
7. **What does this look like in six months?** Will the next person reading this code understand why, not just what?

## Soft signals that warrant a closer look

- Adding a feature flag with no removal plan.
- Touching error handling without a corresponding test.
- A diff that's "all green" but mostly red.
- Large blocks of commented-out code.
- New magic constants without a comment explaining the source.

<!-- MIT, see LICENSE -->
