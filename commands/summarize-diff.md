---
name: summarize-diff
description: Generate a clean PR description from a git diff.
---

# /summarize-diff

Read the staged or current diff and produce a pull-request description in the project's house style.

## Usage

```
/summarize-diff
/summarize-diff --base main
/summarize-diff --staged
```

## What it does

1. Inspects the diff (`git diff`, `git diff --staged`, or `git diff <base>...HEAD`).
2. Groups changes by area (modules, layers, concerns).
3. Produces a description with:
   - A one-line title (under 70 characters).
   - A short summary paragraph focused on the *why*.
   - A bulleted "Changes" section grouped by area.
   - A "Test plan" checklist suggesting what to verify.

## Style guidance

- Lead with intent, not file names.
- Skip restating what `git diff` already shows.
- Note any callouts: migrations, feature flags, follow-ups, behavior changes.

<!-- MIT, see LICENSE -->
