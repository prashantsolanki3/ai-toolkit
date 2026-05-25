# bc_auth.py — quickstart

Stdlib-only Python helper for driving the SmartAgents BC AL API. Ships with the [`bc-agent-testing`](../SKILL.md) skill.

## 30-second bootstrap

```bash
cd <wherever-this-script-lives>
cp .env.example .env
# edit .env — set BC_CLIENT_ID / BC_CLIENT_SECRET / BC_COMPANY_ID
python -c "from bc_auth import BCClient; c=BCClient(); print(c.environment)"
```

If `BCClient()` succeeds and prints the env name you're good. If it raises `ValueError: Missing credentials`, the `.env` is either not next to `bc_auth.py` or is missing one of the five required keys — the error message names them.

## Resolve company GUID

```python
from bc_auth import BCClient
c = BCClient()  # company id can be anything for this — we're listing companies
for co in c.get_all("companies"):
    print(co["name"], co["id"])
```

Pin the matching GUID in `.env` (`CRONUS DE` for dev, `smart-agents-prod` for prod).

## Tests

```bash
python -m unittest test_bc_auth.py -v
```

28 tests, no network — every HTTP call is mocked. They lock in the contract documented in SKILL.md (auth shape, token caching, OData filter encoding, 401/403 error messages, pagination + host-locked nextLinks, top-level vs. company-scoped paths, `chat()` POST body, secret redaction, BOM tolerance, monotonic-time token expiry).

If you change `bc_auth.py`, keep them green.

## Files

| File | Purpose |
|---|---|
| `bc_auth.py` | The client. Stdlib only. |
| `test_bc_auth.py` | Unit tests; run before any change. |
| `.env.example` | Copy to `.env`, fill in. `.env` is gitignored. |
| `.gitignore` | Keeps `.env` and `__pycache__/` out of git. |
