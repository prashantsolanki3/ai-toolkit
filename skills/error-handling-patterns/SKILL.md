---
name: error-handling-patterns
description: Patterns for consistent, debuggable error handling across a codebase.
author: ai-toolkit
presets:
  - backend-essentials
  - quality-gates
---

# Error Handling Patterns

## When to use this skill

Invoke this skill when adding error handling to new code, refactoring tangled try/catch logic, or reviewing a PR where error handling looks suspicious.

## When not to use it

- Quick scripts and one-off tooling — keep it simple, let errors propagate.
- When the language's idiomatic style already enforces structure (e.g. Rust's `Result`).

## Principles

1. **Fail loud at boundaries, recover at the edge.** Internal code raises; the outermost layer (HTTP handler, message consumer, CLI entry point) decides how to translate the error for the user.
2. **Errors should carry context.** Plain string errors lose information. Wrap with cause + structured context. Most modern runtimes support error chaining (`Error.cause` in JS, `errors.Wrap` in Go, exception chaining in Python).
3. **Never silently swallow.** An empty catch block is a bug magnet. If you intentionally ignore an error, log it at debug level with the reason in a comment.
4. **Differentiate expected from unexpected.** A validation failure is expected — return a 400 and move on. A database timeout is unexpected — log it with full context and alert.
5. **No catch-all rescues in business logic.** `catch (e) {}` at the top of a function obscures bugs. Catch specific error types you can actually handle.

## Anti-patterns

- Rethrowing as `throw new Error("Something went wrong")` — loses the original stack and message.
- Logging an error and continuing as if nothing happened.
- Returning `null` on error from a function that otherwise returns objects — callers won't check.
- Generic try/catch around an entire request handler, hiding the real failure point.

## Verification

- Trace a deliberate failure through the system. Confirm the error surfaces in logs with enough context to debug without reproducing.
- Pretend you're oncall at 3am. Can you tell what broke and where, just from the log line?

<!-- MIT, see LICENSE -->
