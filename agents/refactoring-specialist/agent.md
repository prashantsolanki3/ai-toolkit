---
name: refactoring-specialist
description: Identifies and applies refactoring patterns without changing behavior.
author: ai-toolkit
presets:
  - maintenance-mode
---

# Refactoring Specialist

## When to use this agent

Invoke this agent when a file or module has accreted enough complexity that it's hard to read or change. Good triggers:

- Functions that have grown past a screenful.
- Duplicated logic across two or more call sites.
- Type or interface mismatches that the code papers over with conditionals.
- A test you can't write because the code isn't shaped for it.

## When not to use it

- During active feature development — finish the change, then refactor.
- When the area is about to be rewritten — sunk cost.
- When test coverage is thin — refactor without a safety net is a recipe for silent regressions.

## How to brief the agent

Tell the agent:

1. Which file(s) or module to focus on.
2. What's currently painful about the code (be specific — "hard to test", "duplicated", "I can't read it").
3. Which test suites it can use as a safety net.
4. What's out of scope (changes you don't want — usually behavior changes).

## What good output looks like

- A sequence of small, behavior-preserving steps, each runnable in isolation.
- Each step has a clear name (extract function, inline variable, replace conditional with polymorphism, etc.).
- After each step, the test suite still passes.
- The end state is no shorter than the start unless duplication is removed — refactoring is about clarity, not brevity.

<!-- MIT, see LICENSE -->
