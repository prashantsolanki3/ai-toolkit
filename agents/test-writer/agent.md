---
name: test-writer
description: Generates test cases from acceptance criteria or function signatures.
---

# Test Writer

## When to use this agent

Invoke this agent when you have a function, module, or feature description and want a starter test suite — happy path, edge cases, error cases. Useful for:

- Bootstrapping tests on legacy code that has none.
- Filling in coverage gaps before a refactor.
- Translating a written acceptance criterion into executable assertions.

## When not to use it

- For tests that require understanding subtle business rules the agent can't see in the code — write those yourself.
- For end-to-end browser or system tests — different tools, different style.
- When the goal is to test-drive a new design — that's the human's job; the agent comes in once the design is sketched.

## How to brief the agent

Provide:

1. The function or module under test (paste the source or point at the file).
2. The test framework in use, including any project-specific helpers.
3. Edge cases you specifically care about, if you have them in mind.
4. The shape of existing tests in the same area, so the agent matches your house style.

## What good output looks like

- One test per behavior, named after the behavior.
- Arrange/act/assert structure, clear and short.
- Edge cases as separate tests, not buried in a single mega-test.
- No tests that just exercise the framework or restate the implementation.
- Mock/stub usage explained — a comment or a helper, not opaque setup magic.

<!-- MIT, see LICENSE -->
