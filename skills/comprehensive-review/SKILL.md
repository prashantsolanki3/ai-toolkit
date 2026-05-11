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
- `evaluations/` — example inputs/outputs for evaluating whether the skill is doing its job.
- `assets/` — any binary or non-text resources the skill needs at runtime.

## When to use this skill

Invoke this skill when you want a thorough review pass — not just a quick lint, but a structured walk that looks at design, error handling, tests, and observability.

## When not to use it

For typo fixes, dependency bumps, or any change small enough that loading this much context isn't worth it.

## Procedure

1. Read `references/style-guide.md` for the house style this review enforces.
2. Run `scripts/precheck.sh` against the diff to surface mechanical issues first.
3. Walk the design points in this skill against the diff.
4. Compare your output shape against `evaluations/good-review.md` and `evaluations/bad-review.md` — they describe what acceptable and unacceptable reviews look like.

The point of the folder structure is that the skill's *body* stays short and readable while the supporting material is one open-and-read away.

<!-- MIT, see LICENSE -->
