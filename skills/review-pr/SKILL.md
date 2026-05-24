---
name: review-pr
description: 'Critical evidence-based PR review against requirements, tests, completeness, security, and the SDLC contract. Triggered at the end of every safe-change run, by phrases like "review this PR", "look at PR #N", "is this ready to merge". Applies the 6-axis test-relevance rubric. Spawns follow-up issues for out-of-scope findings — never appends them only as PR comments.'
author: ai-toolkit-dev-skills
presets:
  - dev-skills
tools:
  - claude-code
  - vscode-copilot
  - copilot-cli
---

# review-pr

Critical, evidence-based PR review. A change is ready to merge when the work matches what was asked for, tests *exercise* the new behaviour, the change is consistent with the SDLC contract, and nothing risky slipped in. Lifted from opulent-toolkit's `review/SKILL.md` (6-axis rubric verbatim).

**Default branch.** Recipes below reference `origin/$DEFAULT` — substitute `$DEFAULT` with the repo's actual default branch (typically `main`; some repos use `master`). Detect once at the start of the review:

```bash
DEFAULT=$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
DEFAULT=${DEFAULT:-main}
```

The two-line form is intentional — a single-line `... || echo main` would only fall back when the whole pipeline fails, leaving `DEFAULT` empty if `git symbolic-ref` fails but `sed` succeeds on empty input. The `branch-from-main` hook does the same detection at session start.

## When to use
- At the end of every `safe-change` run (step 10), dispatched in an isolated worktree as part of `/parallel-reviewers`.
- Phrases like "review this PR", "look at PR #N", "is this ready to merge".
- Inline (main thread) only for trivial PRs: ≤3 files, no test changes.

## Procedure
Produce findings under each header. Empty sections are stated as "None.", not omitted.

### 1. Requirements
- Read the PR description, linked issues, commit messages, referenced docs/wiki entries.
- Restate the intent in one sentence.
- For each acceptance criterion you can identify, mark **MET / PARTIAL / MISSING** with evidence (file path + line range or test name).

### 2. Tests — the 6-axis rubric
For each new/changed test, verify all six axes:
1. **Assertion-strength (HIGH/MED/LOW).** Reject `assert True`, `assert isinstance(x, X)` where X is the constructor, smoke-only `assert obj is not None`. Each assertion should fail if production code were broken.
2. **Outcome-vs-mock (OUTCOME/MIXED/MOCK-ONLY).** Asserting `mock.method.called` without asserting resulting state is brittle. Prefer return values, file artefacts, response bodies, rendered DOM, persistent state.
3. **Would-fail-before (YES/NO/UNKNOWN).** Run the **new** test against the **old (merge-base)** production code via a disposable worktree. The previous shorter recipe was inverted — it checked out the old test file into the current tree, which runs the *old* test against the *new* code (the opposite of what the axis is checking). Use this instead:
   ```bash
   BASE=$(git merge-base origin/$DEFAULT HEAD)
   TMPWT=$(mktemp -d -t wfb-check.XXXXXX)
   git worktree add --detach "$TMPWT" "$BASE"
   # Paint the new test on top of the old production code
   cp <test-file> "$TMPWT/<test-file>"
   # Expected behaviour: the test FAILS — proves it exercises the new code path
   (cd "$TMPWT" && <test-runner> -k <test-name>)
   wfb_status=$?
   git worktree remove "$TMPWT"
   # wfb_status != 0 → YES (correct, the new test catches the missing behaviour)
   # wfb_status == 0 → NO (the test passes against unfixed code; not exercising new behaviour)
   ```
   If the test passes against the unfixed code, it isn't exercising the new behaviour — mark NO. UNKNOWN only if the merge-base is unreachable or the test runner cannot start in the temp worktree.
4. **Skip status (NONE/SKIPPED/XFAIL).** `@pytest.mark.skip`, `@skipif` with always-true conditions, `xfail` without a reason, `pytest.skip()` inside the body — all suspicious. NONE is the only safe verdict.
5. **Brittleness (TIGHT/OK/OVER-SPECIFIED).** Tests that pin exact HTML whitespace, full-dict equality when one key matters, or snapshot blobs with no semantic meaning break on any harmless refactor. Prefer the smallest substring / field / shape that proves the behaviour.
6. **Tests-one-thing (YES/NO).** Long tests with multiple assert blocks against different concerns should be split.

Quote one rubric row per new/changed test in the report. Then run the relevant suites and quote the final summary line. Flag pre-existing failures the PR didn't cause as **Non-blocking**.

### 3. Completeness
- Edge cases (empty input, missing config, network failure, partial state, retry behaviour) — each that applies, is it handled?
- Error paths: are exceptions caught at the right boundary? Are user-facing errors actionable?
- Rollback: is this reversible by `git revert` alone, or needs data-plane cleanup?
- Docs sync: any new route / command / env var / port / skill needs a doc update in the SAME PR.

### 4. Security
- Secrets scan: `git diff origin/$DEFAULT..HEAD | grep -Ei '(api[_-]?key|secret|token|password|ANTHROPIC_API_KEY|GEMINI_API_KEY|SHOPIFY_ACCESS_TOKEN|AZURE_OPENAI)'`. Any match is blocking unless it's a placeholder in `.env.example`.
- Hardcoded credentials/URLs/paths that should be config.
- Injection surfaces (shell-outs without arg arrays, SQL string-formatting, untrusted HTML).
- Dependency additions: every new package needs a "why this package" line in the PR body.

### 5. Consistency with the SDLC contract
- PR body MUST contain `Closes #N` or `Refs #N`. Reject as REQUEST_CHANGES if missing.
- If the PR has `Depends-On:` / `Unblocks:` slots filled, check reciprocity via `gh-project-sync` `add-dependency`, not PR-body prose.
- Branched from latest main? Conventional commit messages? Selective `git add` (no `-A`)?
- Worktree under `.claude/worktrees/<slug>/`?

### 6. Verdict gate
**Before any verdict, file follow-ups as GitHub issues.** Out-of-scope findings MUST become issues via `gh-project-sync` `create-task` — review comments don't get triaged, issues do. Reference issue numbers (`Spawned #N1, #N2`) in your review summary.

**Verdict is mechanical:**
- **REQUEST_CHANGES** if any of: ≥1 LOW assertion-strength, ≥1 MOCK-ONLY, ≥1 OVER-SPECIFIED, ≥1 SKIPPED/XFAIL without documented reason, missing `Closes #N`, secret in diff, or any blocking finding in §3–5. Run `gh pr review N --request-changes -b "<actionable list>"`. STOP — do NOT modify the PR branch.
- **APPROVED** if all axes ≥ HIGH/OUTCOME/YES/NONE/(TIGHT or OK)/YES AND §3–5 clean. Run `gh pr review N --approve -b "<one-liner>"`.
- **COMMENT** for observations only.

Hard cap: 3 review iterations on the same PR. If unconverged, escalate.

## Rules
- Never approve a PR with secrets in the diff.
- Never approve a PR that adds production code without a corresponding test, unless justified in the PR body.
- Never push to the author's PR branch — even for typos.
- Never silently re-run a failed test in isolation and treat the second run as truth.

## Anti-patterns
- **"Tests pass"** as sign-off — axes 1–3 can make passing tests tautological.
- **Bundling follow-ups into the review body only.** Issues survive triage; review comments don't.
- **Approving without the would-fail-before recipe.**

## Cross-references
- See `safe-change` for the upstream procedure this review sits inside.
- See `gh-project-sync` for `create-task` (spawning follow-ups) and `add-dependency` (validating Depends-On reciprocity).
- See `craft-skill` when a recurring review finding warrants a new rule or skill.
