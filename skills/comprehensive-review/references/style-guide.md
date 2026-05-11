# Style guide (excerpt)

Generic, language-agnostic style expectations the comprehensive-review skill cites. Replace this with the project's actual style guide if one exists.

## Names

- Functions are verbs (`load_config`, `parse_response`), not nouns.
- Booleans read like statements (`is_active`, `has_permission`), not commands.
- Avoid abbreviations unless they're already idiomatic in the domain.

## Error handling

- Throw or return errors with structured context (cause + relevant inputs), not bare strings.
- One layer of error wrapping per logical boundary. Don't wrap on every function.
- Never silently swallow an exception — log at minimum, or re-raise with context.

## Tests

- Each test asserts one behavior. Setup blocks can be shared; assertion logic should be local.
- Avoid mocking the system under test. Mock at the boundary (network, clock, randomness).
- A failing test name should tell the reader what behavior broke without reading the body.

## Comments

- Comments explain *why*, not *what*. The code already shows what.
- TODOs reference an issue or are deleted.
