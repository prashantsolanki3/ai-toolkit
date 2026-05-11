# `eval.json` — the toolkit's skill evaluation format

Every asset that wants automated evaluation ships a sibling `eval.json` file next to its source. The format is tool-agnostic: it describes what the asset should do and how to check it, without saying *who* runs the check. In this toolkit the runner is the developer's own IDE — Claude Code, Cursor's agent, the new Copilot CLI, etc. — driven by the [`skill-evaluator`](../skills/skill-evaluator/SKILL.md) skill, so no API key is required.

## Where it lives

```
skills/<name>/
├── SKILL.md         # the skill itself
├── eval.json        # this file
└── ...              # any scripts/, references/, assets/ that the skill ships
```

For agents: `agents/<name>/eval.json` works the same way.

## Schema

```jsonc
{
  "version": "1.0",
  "skill": "<asset name, optional — defaults to the parent directory>",
  "description": "<one-line description of what this eval suite covers>",
  "target_pass_rate": 0.85,           // 0.0–1.0; the rate /improve-skill aims to hit
  "model_hint": "any modern LLM",     // free-form note for the developer
  "tests": [
    {
      "id": "<short stable identifier>",
      "description": "<what behaviour this test pins>",
      "input": "<the user message you want to feed the skill>",
      "context": "<optional extra context the skill should have>",
      "assertions": [
        { "type": "contains",         "value": "string" },
        { "type": "not_contains",     "value": "string" },
        { "type": "contains_any_of",  "value": ["a", "b", "c"] },
        { "type": "contains_all_of",  "value": ["a", "b"] },
        { "type": "regex",            "value": "^expected.*$" },
        { "type": "not_regex",        "value": "(?i)forbidden" },
        { "type": "max_length",       "value": 2000 },
        { "type": "min_length",       "value": 50 }
      ]
    }
  ]
}
```

All fields are optional except `version` and `tests`. Every assertion is binary (pass / fail); aggregate them into a pass rate.

## Assertion types

| Type              | Argument          | Passes when                                        |
| ----------------- | ----------------- | -------------------------------------------------- |
| `contains`        | string            | output contains the string                         |
| `not_contains`    | string            | output does NOT contain the string                 |
| `contains_any_of` | string\[]         | output contains at least one of the strings       |
| `contains_all_of` | string\[]         | output contains every string                       |
| `exact`           | string            | output equals the string (trimmed)                 |
| `not_exact_match` | string            | output is NOT equal to the string (trimmed)       |
| `regex`           | pattern string    | output matches the regex                           |
| `not_regex`       | pattern string    | output does NOT match the regex                    |
| `min_length`      | number            | output length (chars) is ≥ value                   |
| `max_length`      | number            | output length (chars) is ≤ value                   |

Case sensitivity is the responsibility of the assertion. The validator accepts a Python-style inline flag prefix at the start of the pattern: `(?i)…`, `(?im)…`, `(?ims)…` etc. The flags are extracted before compilation; the body of the pattern is plain regex. Strings are matched against the assistant's final response text.

## How a test gets run

The toolkit does NOT ship a runtime. Two equivalent ways to execute an eval suite:

### Through the developer's IDE (recommended for skill authoring)

Install the `skill-evaluator` skill (it's in the `skill-development` preset), then in your IDE chat:

```
/eval-skill comprehensive-review
```

(or, in IDEs without slash commands: "evaluate the comprehensive-review skill using its eval.json")

The IDE's agent walks the procedure:
1. Reads the target skill's body as if it were its own system prompt.
2. For each test in `eval.json`:
   - Generates the response the skill would produce given the test's `input`.
   - Applies every assertion to that response.
   - Records pass/fail with reason.
3. Reports per-test detail and overall pass rate.

For the autonomous improvement loop, run `/improve-skill comprehensive-review` instead. It runs the eval, and if the pass rate is below `target_pass_rate`, the agent proposes edits to the skill body, asks for your approval, applies, and re-runs.

### Outside an IDE (CI, scripted runs)

Not shipped today. If you want CI automation, write a runner script that calls the Anthropic/OpenAI API directly, uses the skill body as the system prompt, feeds each `input` as the user message, and applies the assertions. The schema above is stable enough to script against. Open an issue if you'd like this in the toolkit.

## Design notes

- **The agent simulates; it doesn't proxy.** The IDE's running model is asked to "act as if this skill were your only guidance" and then to respond. This is approximate vs. a fresh API call where the skill is literally the system prompt — but for skill design feedback, the approximation is good enough and avoids billing the developer for API calls.
- **Binary assertions only.** No LLM-judges, no graded scores. The article that motivated this called the same shot: deterministic assertions are fast, cheap, and reproducible.
- **`target_pass_rate` is a hint to `/improve-skill`.** The eval command itself reports the rate; the improve command compares against the target and decides whether to keep iterating.
