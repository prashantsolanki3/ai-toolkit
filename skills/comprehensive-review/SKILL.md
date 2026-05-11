---
name: comprehensive-review
description: Deep code review skill with referenced scripts, style references, and evaluation prompts.
author: ai-toolkit
presets:
  - quality-gates
---

# Comprehensive Review

A larger, structured skill that ships supporting material in adjacent folders:

- `scripts/` — runnable helpers the skill may invoke (e.g. lint, complexity report).
- `references/` — long-form references the skill can cite without inflating the main body.
- `eval.json` — automated test cases for `/eval-skill` and `/improve-skill` (see [`docs/eval-format.md`](../../docs/eval-format.md)).
- `assets/` — any binary or non-text resources the skill needs at runtime.

## When to use this skill

Invoke this skill when you want a thorough review pass — not just a quick lint, but a structured walk that looks at design, error handling, tests, and observability.

## When not to use it

For typo fixes, dependency bumps, or any change small enough that loading this much context isn't worth it.

## Procedure

1. Read `references/style-guide.md` for the house style this review enforces.
2. Run `scripts/precheck.sh` against the diff to surface mechanical issues first.
3. Walk the diff against the **What to surface** checklist below.
4. Before publishing, re-read against **Failure modes to avoid** — if your draft matches one, rewrite it.

To check this skill against the failure modes it's supposed to avoid, run `/eval-skill comprehensive-review` — the test cases live in `eval.json` and pin the skill against bare-LGTM responses, design rants, ungrounded speculation, and whitespace-only review patterns.

## What to surface

For each category that applies to the diff, surface at least one **concrete, specific observation** — anchored to a file, line, or function. Do not gesture; name the frame.

- **Design.** Does the structure fit the problem? Name the concern and point at the line or function.
- **Error handling & failure modes.** What happens when the dependency is down, the input is malformed, the limit is hit? Be specific about *which* failure path, not "errors might happen".
- **Tests.** If the diff touches tests, comment on them. Happy-path-only coverage is a gap — ask for at least one edge case and one negative case / unhappy path. Test names should describe behaviour.
- **Security & data handling.** For auth, crypto, PII, or storage: name the concern (credential storage, timing, secret leakage, token revocation), not a vague gesture.
- **Observability.** How would the on-caller notice this is broken in production? Logs, metrics, traces — name which.

## Failure modes to avoid

Each of these is a known smell in real reviews. If your draft matches one, rewrite it before publishing.

- **Bare LGTM.** "Looks good, nothing to add" is not a review. Demand concrete, specific observations.
- **Speculation without an anchor.** "This might leak" with no file / line / function is a soft-failure. If unsure, ask the author the precise question rather than hedging in the open.
- **Out-of-scope rewrites.** Keep feedback **scoped to this diff** and **actionable**. A small change does not justify proposing a layer rewrite — that belongs in a separate design discussion, not this PR.
- **Whitespace-only review on substantive change.** Flagging a blank line on a 200-line auth module is shallow. Surface the design, security, and test questions instead — formatting nits can ride alongside, never in place of.
- **Vague praise.** "Looks clean, good work, ship it" without referencing the diff is filler, not a review. Tie praise (and criticism) to a specific frame.
- **Performance speculation without evidence.** "This could be slow under load" with no benchmark, profile, or measurement is not actionable. Demand numbers — or ask the author to provide them — before flagging perf.
- **Questions without a position.** Pair every question with whether it's a blocker, a nit, or just context. A naked question pushes the cost back onto the author without committing to an opinion.

The point of the folder structure is that the skill's *body* stays short and readable while the supporting material is one open-and-read away.

<!-- MIT, see LICENSE -->
