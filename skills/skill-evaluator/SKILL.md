---
name: skill-evaluator
description: Teaches your IDE's agent to run an eval suite against any toolkit skill, using your IDE's own model — no separate API key.
author: ai-toolkit
presets:
  - skill-development
---

# Skill Evaluator

This skill turns your IDE's agent into the runner for any toolkit skill's `eval.json`. It is the thing the `/eval-skill` and `/improve-skill` commands invoke.

## When to use this skill

Invoke this skill when you want to know whether a toolkit skill is doing its job — typically during authoring, after editing the body, or before merging a change. The output is a per-test pass/fail report plus an aggregate pass rate.

## When not to use it

- For testing tool *integration* (does Cursor actually load this rule? does Claude Code surface this skill?). That lives in `docs/verification-matrix.md` and needs the live IDE in front of you.
- For testing the LLM itself. Failures here usually mean the skill prompt isn't tight enough, not that the model is broken.

## Inputs you need

1. The name of the skill to evaluate, e.g. `comprehensive-review`. The skill body lives at `skills/<name>/SKILL.md`; the eval suite at `skills/<name>/eval.json`. (Agents follow the same layout under `agents/<name>/`.)
2. Filesystem access to read both files.

## Procedure

Walk it explicitly — do not skip steps, the determinism is the point.

### Step 1 — Load the skill

Read `skills/<name>/SKILL.md` (or `agents/<name>/agent.md`). Strip the frontmatter; the body is what the IDE/tool would otherwise load as the skill's prompt. Treat that body as if it were your only guidance for this turn.

### Step 2 — Load the eval suite

Read `skills/<name>/eval.json`. Parse it. Note the `target_pass_rate` (defaults to 0.85 if absent). The `tests` array is the source of truth.

If the file is missing, stop and tell the user: "No eval.json for skill `<name>`. Create one at `skills/<name>/eval.json` — see `docs/eval-format.md` for the schema."

### Step 3 — For each test, generate and check

For each entry in `tests`:

1. **Simulate.** Pretend the skill body is your system prompt. Read the test's `input` (and `context`, if present) as the user message. Produce the response the skill would produce. Keep it short — same shape and quality you'd actually emit.
2. **Apply assertions.** For each assertion in `assertions[]`:
    - `contains` — does the response contain the value? (case-sensitive)
    - `not_contains` — does it NOT contain the value?
    - `contains_any_of` — does it contain at least one value from the array?
    - `contains_all_of` — does it contain every value from the array?
    - `exact` — does it equal the value (trimmed)?
    - `not_exact_match` — is it NOT equal to the value (trimmed)?
    - `regex` — does the regex match?
    - `not_regex` — does the regex fail to match?
    - `min_length` / `max_length` — is the character count within bounds?
3. **Record** pass/fail per assertion with a one-sentence reason. A test passes only if every assertion passes.

### Step 4 — Report

Emit a structured report:

```
skill: comprehensive-review
pass rate: 4/5 (80%)  — below target (85%)

✓ rejects-bare-lgtm
✓ avoids-design-rant
✓ tests-section-present-when-tests-changed
✓ rejects-whitespace-only-review
✗ anchors-claims-to-specific-frames
    contains_any_of: ["line", "function", "file", ...]   ← FAIL
       response did not name a specific frame; said "memory might grow over time"
    not_regex: (?i)\bmight (be|leak|cause)\b[^.]*?\bnot sure\b   ← FAIL
       response included the speculative phrasing we're guarding against
```

Also include each test's simulated response in a collapsible block so the user can audit.

### Step 5 — If invoked via `/improve-skill`, iterate

For the improvement loop (the `improve-skill` command body invokes this skill with the `--improve` flag in mind):

1. If pass rate ≥ `target_pass_rate`, stop and report success.
2. Otherwise, identify the smallest edit to the skill body that would plausibly fix the failing tests without breaking the passing ones.
3. Present the proposed diff to the user. Wait for approval before writing.
4. Apply the edit. Re-run from Step 1.
5. Cap at 3 iterations or whatever the user permits — runaway loops cost time and clarity.

## Output guidelines

- Be explicit about which test failed and which assertion within it.
- Quote the response text that triggered the failure — guesswork from a pass-rate alone is unhelpful.
- Do NOT silently rewrite the skill outside the `/improve-skill` flow. Eval is read-only; improvement is opt-in.
- Do NOT inflate a pass by being charitable about an ambiguous assertion. A bare "contains 'design'" must literally contain the substring `design`, not paraphrase it.

## Limitations of the IDE-driven approach

- Your IDE's model generates the test response. A different model would produce a different response and possibly a different pass rate. Treat the rate as directional, not absolute.
- The IDE is operating with its own system prompts; you're asking it to "imagine" the skill is its system prompt. This is approximate. For a truly hermetic eval, write an out-of-band runner that calls the LLM API directly with the skill as the system message — `docs/eval-format.md` covers what that script would look like.

<!-- MIT, see LICENSE -->
