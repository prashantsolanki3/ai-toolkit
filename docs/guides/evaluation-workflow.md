# Guide: the skill evaluation workflow

The toolkit ships an opinionated workflow for iterating on skills: ship an `eval.json` next to your skill, then run `/eval-skill` and `/improve-skill` in your IDE. The runner is your IDE's existing agent — no separate API key required.

For the data format see [../eval-format.md](../eval-format.md). For the skill that drives the loop see [`skills/skill-evaluator/SKILL.md`](../../skills/skill-evaluator/SKILL.md).

## The loop

```
Edit a skill body
    ↓
/eval-skill <skill-name>             read-only: run the suite, report pass/fail per test, summarise rate
    ↓
  ── pass rate ≥ target_pass_rate? ──
       yes: ship it
       no:  /improve-skill <skill-name>   propose minimum edit, ask approval, apply, re-run (capped at 3 iterations)
```

The eval suite lives at `skills/<name>/eval.json` and never moves. Edits happen to the skill body. The eval is the spec; the skill is what changes.

## What lives in `eval.json`

```jsonc
{
  "version": "1.0",
  "skill": "my-skill",
  "description": "What this eval suite covers.",
  "target_pass_rate": 0.85,
  "model_hint": "Any modern instruction-following LLM.",
  "tests": [
    {
      "id": "rejects-bare-lgtm",
      "description": "Bare 'LGTM' must be refused.",
      "input": "Please review this PR: 'LGTM, nothing to add.'",
      "assertions": [
        { "type": "contains_any_of", "value": ["concrete", "specific", "observation"] },
        { "type": "not_exact_match", "value": "LGTM" },
        { "type": "min_length", "value": 100 }
      ]
    }
  ]
}
```

See [../eval-format.md](../eval-format.md) for the full schema and assertion catalog.

## Setup (one-time per project)

```bash
# Either bootstrap everything:
make bootstrap                                   # in the toolkit repo

# Or install the skill-development preset explicitly:
ai-toolkit install --preset skill-development
```

That gives your IDE the `skill-evaluator` skill plus `/eval-skill` and `/improve-skill` commands (or `*.prompt.md` files for VS Code Copilot).

## Running `/eval-skill`

In Claude Code, Cursor, VS Code Copilot, Kiro — any IDE with an agent loop:

```
/eval-skill my-skill
```

For IDEs without slash commands, say it in natural language: "evaluate the my-skill skill using its eval.json".

The agent:

1. Reads the target skill's body as if it were its own system prompt.
2. For each test in `eval.json`, generates the response the skill would produce given the test's `input`.
3. Applies every assertion to that response (deterministic, binary).
4. Reports per-test pass/fail and an aggregate rate.

A successful report looks like:

```
skill: my-skill   pass rate: 6/7 (86%)   target: 85%

Test results:
  ✓ rejects-bare-lgtm
  ✓ avoids-design-rant
  ✗ anchors-claims-to-specific-frames
     ⤷ contains_any_of: did not surface a specific frame
     ⤷ not_regex:       response contained a speculative pattern
  ✓ tests-section-present-when-tests-changed
  ✓ rejects-whitespace-only-review
  ✓ rejects-vague-praise
  ✓ demands-evidence-for-perf-speculation

At target. Ready to ship.
```

For failing tests, the simulated response is included in a collapsed block so you can read what the model emitted.

## Running `/improve-skill`

When the rate is below target:

```
/improve-skill my-skill
```

The agent runs the eval, identifies the smallest plausible edit to the skill body that would fix the failing tests, shows you the diff, and waits for approval. On approval it applies the edit and re-runs. Capped at 3 iterations by default; pass `--max-iterations` to change.

The agent will *not*:

- Edit `eval.json` to make a test pass (the eval is the spec).
- Apply multiple iterations as a single bulk change.
- Continue past two iterations that don't move the needle.

## Designing good eval tests

Two principles:

1. **Assertions favour intent over input echo.** If your `input` mentions "Map<string, number>", don't make a `contains` assertion for "Map" — a response that just quotes the prompt would pass. Test for the structural pattern you want (a reference to a *frame*, a hedging phrase you're guarding against).
2. **Binary assertions only.** No graded scores, no LLM-judges. Fast, deterministic, reproducible. If you can't express what you want as a regex or substring match, you probably want a second test that isolates the property.

### Anti-patterns

- **Echo tests.** `contains: "Map"` when the input also says "Map" — meaningless.
- **Negative-of-a-rare-thing.** `not_contains: "supercalifragilistic"` — passes trivially.
- **Overlapping tests.** Two tests that always pass or fail together — collapse them.
- **Too few tests.** A skill with one test is barely tested. Aim for 5+ covering distinct failure modes.

## Limitations of the IDE-driven approach

- **Your IDE's model is simulating.** When you say "act as if this skill is your system prompt and respond to X", you're getting a hybrid — the IDE's own system prompts are still there. The pass rate is directional, not absolute.
- **Different IDEs may produce different rates.** Same skill, same eval.json, different models — different responses, different pass rates.
- **No CI integration today.** Evals can't run unattended in CI without an API-based runner, which the toolkit doesn't ship. For hermetic CI evals, write a runner that hits the Anthropic or OpenAI API directly and uses the skill body as the system message. The `eval.json` schema is stable enough to script against.

## Tying it all together

A typical contributor flow for an existing skill:

```bash
# 1. Bootstrap once
make bootstrap

# 2. Edit a skill body
$EDITOR skills/my-skill/SKILL.md

# 3. Run eval in your IDE: /eval-skill my-skill
# 4. If below target, run: /improve-skill my-skill
# 5. Approve diffs as they come; agent re-runs until target or cap.

# 6. Commit
git add skills/my-skill/
git commit -m "feat(my-skill): raise pass rate to N/N"
```

For a brand-new skill that ships an eval suite:

```bash
# 1. Author the skill body
$EDITOR skills/my-new-skill/SKILL.md

# 2. Author the eval suite — see ../eval-format.md
$EDITOR skills/my-new-skill/eval.json

# 3. Run eval to confirm tests work as expected (you may discover an assertion is too tight)
# 4. Iterate skill body and/or eval until the suite is honest and the rate is good
# 5. make register && git commit -a
```
