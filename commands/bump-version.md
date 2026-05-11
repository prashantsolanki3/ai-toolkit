---
name: bump-version
description: Update version across package metadata, changelog, and tags consistently.
author: ai-toolkit
presets:
  - maintenance-mode
---

# /bump-version

Bump the project version in every place it appears and prepare the release artifacts.

## Usage

```
/bump-version 1.4.0
/bump-version patch
/bump-version minor
/bump-version major
```

## What it does

1. Resolves the next version (explicit, or by semver bump).
2. Updates the version field in the relevant manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.).
3. Updates the changelog: moves "Unreleased" content under the new version with today's date, and inserts a fresh "Unreleased" heading at the top.
4. Stages the changes and creates a commit with a conventional message: `chore(release): vX.Y.Z`.
5. Stops before pushing or tagging — the human reviews and pushes manually.

## Style guidance

- Refuse to bump if the working tree has unrelated unstaged changes.
- Refuse to bump if the changelog has no entries under "Unreleased".
- Print a final summary of what to do next: `git push`, `git tag`, etc.

<!-- MIT, see LICENSE -->
