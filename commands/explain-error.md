---
name: explain-error
description: Analyze a stack trace or error message and explain the root cause.
---

# /explain-error

Paste a stack trace or error message and get a focused explanation of what failed, why, and where to start fixing it.

## Usage

```
/explain-error
```

Then paste the error or stack trace.

## What it does

1. Identifies the immediate exception/error type and message.
2. Walks the stack from the topmost user-code frame.
3. Names the most likely root cause, distinguishing it from incidental noise.
4. Suggests the first thing to check (a specific file/line if possible) and the next two or three after that.
5. Calls out anything in the trace that doesn't make sense given the apparent failure — those are usually the most informative clues.

## Style guidance

- No generic "have you tried restarting" advice.
- Cite the exact frame or log line being interpreted.
- Be honest about uncertainty: "could be A or B; the deciding evidence would be X."

<!-- MIT, see LICENSE -->
