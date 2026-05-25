---
name: bc-agent-testing
description: Drive the SmartAgents Microsoft Dynamics 365 Business Central AL API as an external caller — sandbox configuration, sync chat-loop testing, Tool Call Log assertions, regression replay. The fastest way to validate that an agent actually works end-to-end without clicking through the BC UI.
author: ai-toolkit
presets:
  - bc-development
tools:
  - claude-code
  - cursor
  - vscode-copilot
---

# bc-agent-testing

How to test SmartAgents agents running inside a Business Central sandbox **as an external caller** — Python / curl / Postman against the published AL API. The same surface the in-product test framework uses.

## When to use this skill

- Seeding a fresh BC sandbox: register a tenant, create an agent, publish to a channel (Teams, web, etc.) — programmatically, not via the setup wizard.
- Smoke-testing an agent after a code change to either the BC extension or the backend (`smart-agents-backend`).
- Reproducing a customer-reported failure with a known prompt + agent number + request id.
- Writing a regression test that runs a saved conversation and diffs against a baseline (`testCases` / `testRuns`).
- Investigating which BC tools an agent actually invoked — read the **Tool Call Log**, not the response.

## When not to use it

- Pure BC AL unit tests of codeunits / pages — those live in the AL test runner (`Agent-Testing/` test codeunits in `smart-agents-bc-extension`); this skill is API-level.
- Backend chat-loop unit tests with no BC involvement — use `smart-agents-backend/tests/` directly.
- Whiteboard exploration of "what should this agent do?" — write a contract first; this skill is for validating that the implementation matches an existing contract.

## Environment shape

Pick the right pair of (BC environment, company) for the backend you're targeting. The Entra tenant is the same for both.

| Target | BC env | Company | UI URL |
|---|---|---|---|
| Smart Agents **prod** backend (`api.agent.net.ai`) | `SmartAgents_Prod` | `smart-agents-prod` | <https://businesscentral.dynamics.com/80189abf-5929-4f1c-9c77-e8a43717d27e/SmartAgents_Prod?company=smart-agents-prod> |
| Smart Agents **dev** backend (`api.dev.agent.net.ai`) | `Ext_Dev_v26` | `CRONUS DE` | <https://businesscentral.dynamics.com/80189abf-5929-4f1c-9c77-e8a43717d27e/Ext_Dev_v26?company=CRONUS%20DE> |

| Field | Value |
|---|---|
| Tenant (Entra) | `80189abf-5929-4f1c-9c77-e8a43717d27e` |
| API base | `https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env}/api/qualiaTechnik/smartAgents/v1.0` |
| Auth | OAuth2 client credentials (Entra app registration) |
| Scope | `https://api.businesscentral.dynamics.com/.default` |

The full company-scoped URL prefix is `{API base}/companies({companyId})/`. The `{companyId}` is the GUID, not the display name — resolve it once with `c.get_all("companies")` and cache.

⚠️ **Pick `Ext_Dev_v26` / `CRONUS DE` for any test that mutates data or seeds the dev backend.** `SmartAgents_Prod` is real and the data is shared.

## Helper script + credentials

A Python helper (`bc_auth.py`) and matching `.env` live **outside** the BC extension repo:

- Default Windows path used in the QUALIA dev environment: `C:\Smart-Agents 3\Agent-Testing\`
- Equivalent macOS / Linux path is anywhere outside the repo (e.g. `~/secrets/bc-agent-testing/`).

Why outside the repo: the `.env` carries the client secret. Keep it out of any git checkout. Do not symlink it into `smart-agents-bc-extension/` or any sibling repo.

```
bc-agent-testing/
├── bc_auth.py        # BCClient — OAuth2 + REST wrapper
├── .env              # tenant / client_id / client_secret / env / company
└── _tmp_*.py         # ad-hoc probes; delete freely
```

`bc_auth.py` autoloads `.env` from its own directory; `cd` there before running anything.

Expected `.env` (example — `Ext_Dev_v26` / `CRONUS DE` shown):

```
BC_TENANT_ID=80189abf-5929-4f1c-9c77-e8a43717d27e
BC_CLIENT_ID=<app-registration-client-id>
BC_CLIENT_SECRET=<app-registration-client-secret>
BC_ENVIRONMENT=Ext_Dev_v26
BC_COMPANY_ID=<companyId GUID — resolve via c.get_all("companies")>
```

`BC_COMPANY_ID` is the GUID, not the display name. Resolve once with a quick probe (no `.env` needed for the company list):

```python
from bc_auth import BCClient
c = BCClient()
for co in c.get_all("companies"):
    print(co["name"], co["id"])
```

Pick the row whose `name` matches the company in the UI URL (`CRONUS DE` for dev, `smart-agents-prod` for prod) and pin that GUID in `.env`.

If `BCClient()` raises `ValueError: Missing credentials`, you're running the script from a different working directory — `cd` into the helper folder. If the token call itself fails: confirm the app registration has BC API permissions (`Financials.ReadWrite.All` + admin consent) and that the secret is current.

## Available API entities

All under `/api/qualiaTechnik/smartAgents/v1.0/companies({companyId})/`.

| Entity | Verb(s) | Purpose |
|---|---|---|
| `agentChat` | GET, POST | List active agents; send a synchronous test prompt and get the full response back |
| `agents({no})` | GET, PATCH | Read / update an agent record |
| `agents({no})/dataSources` | GET | List the agent's BC data sources (tool configs) |
| `agents({no})/toolLinks` | GET | List web/tool links attached to the agent |
| `agents({no})/authorizedUsers` | GET | Users who can chat with this agent |
| `toolConfigs` | GET | Browse all tool configs |
| `toolConfigs('{name}')?$expand=toolConfigTools` | GET | Get a config + its tool list |
| `availableTools` | GET | Discover BC objects that can be added to a tool config |
| `toolCallLog` | GET | Read-only audit log of every BC tool call (filterable by `agentNo`, `requestId`, `sessionId`, `createdAt`) |
| `resultSetCache` | GET | Cached tool-call result sets for export / pagination |
| `setup` | GET, PATCH | Tenant-level Smart Agent setup record (Backend Base URL, Backend Environment) |
| `testCases`, `testCaseSteps`, `testRuns`, `testRunSteps` | GET, POST | Server-side test framework — run a saved conversation as a regression test |

## The synchronous test loop

The fastest way to validate end-to-end:

```python
from bc_auth import BCClient
c = BCClient()

# 1. Send the prompt — server polls internally and returns the full answer
result = c.chat(agent_no=110, message="List the 5 customers with the highest balance.")
print(result["status"], "|", result["response"][:300])
print("credits=", result.get("creditsUsed"), "tokens=", result.get("tokensUsed"))
print("requestId=", result["requestId"], "sessionId=", result["sessionId"])

# 2. Pull the tool call log for that exact request
calls = c.tool_call_log(result["requestId"])
for call in calls:
    ok = "OK" if call["success"] else "ERR"
    print(f"  {call['entryNo']:>5} {ok} {call['functionName']:<14} {call['entityName']:<30} {call.get('durationMs','?')}ms")
```

Status values to care about:

| Status | Meaning | Action |
|---|---|---|
| `completed` | Agent finished cleanly | Assert on `response`, then on `toolCallLog` rows |
| `error` | Something failed; `errorText` populated | Inspect; do not retry blindly |
| `awaiting_confirmation` | Write tool call needs user approval | The default `agentChat` POST auto-approves; use `cleanupStaleAwaitingConfirmations` to kill abandoned ones |
| `tool_calls_pending` | Backend handed off to BC, BC executing | Server keeps polling for up to 120s |
| `timeout` | Did not finish in 120s | Use `requestId` to keep polling via `toolCallLog` |

## Reading the Tool Call Log

The Tool Call Log is the single source of truth for what an agent actually did. Every BC tool call (`bc_search`, `bc_create`, `bc_update`, `bc_delete`, `bc_describe`, `bc_invoke`, `bc_aggregate`, `bc_export`, `bc_report`, `thread_memory`, …) lands here.

```python
# Latest 20 entries across all agents
c.get_all("toolCallLog?$top=20&$orderby=entryNo desc")

# All calls in a single chat request
c.tool_call_log(result["requestId"])

# All calls for one agent in the last day
import datetime
since = (datetime.datetime.utcnow() - datetime.timedelta(days=1)).isoformat() + "Z"
c.get_all(f"toolCallLog?$filter=agentNo eq 110 and createdAt ge {since}&$orderby=entryNo desc")

# Real failures only — Status=Error. Filtering by `success eq false` also
# returns Pending / AwaitingConfirmation / Rejected rows; prefer isFailure.
c.get_all("toolCallLog?$filter=isFailure eq true&$top=50&$orderby=entryNo desc")
```

Status enum (camelCase, no `_x0020_`): `AwaitingConfirmation`, `Pending`, `Running`, `Completed`, `Error`, `Rejected`, `StagedPendingApproval`.

## Common test patterns

### 1. Smoke — does the agent respond at all?

```python
r = c.chat(110, "Hello, are you online?")
assert r["status"] == "completed", r
assert r["response"]
assert r["creditsUsed"] >= 0
```

### 2. Tool execution — did the right tool fire?

```python
r = c.chat(agent_no, "Show me 5 customers in Germany.")
calls = c.tool_call_log(r["requestId"])
fns = [x["functionName"] for x in calls]
assert "bc_search" in fns, fns
search = next(x for x in calls if x["functionName"] == "bc_search")
assert search["success"] is True
assert search["entityName"].lower() in ("customers", "customer")
assert search["recordCount"] >= 1
```

### 3. Write-tool grounding — does the agent stage a confirmation envelope?

```python
r = c.chat(agent_no, "Create a new customer 'Acme Test'.")
# The synchronous endpoint auto-approves. Inspect the log to verify the
# write was staged through a confirmation envelope first.
calls = c.tool_call_log(r["requestId"])
create = next((x for x in calls if x["functionName"] == "bc_create"), None)
assert create is not None
assert create.get("envelopeId"), "Write tool must run via a confirmation envelope"
```

### 4. Negative — null filter no longer crashes

```python
r = c.chat(agent_no, "Send `bc_search` with filter=null and top=20 against customers.")
calls = c.tool_call_log(r["requestId"])
search = next(x for x in calls if x["functionName"] == "bc_search")
assert search["success"] is True
```

### 5. Regression — replay a saved test case

```python
# Trigger a server-side run of a saved test case
run = c.post("testRuns", {"testCaseNo": 7})
# Poll for completion via testRuns({no})/testRunSteps
```

The `testCases` / `testCaseSteps` / `testRuns` / `testRunSteps` API set runs a previously captured conversation and diffs the new response against the baseline. The AL-side runner lives in the extension's `Agent-Testing/` test codeunits; this API surface mirrors it.

## Seeding a sandbox programmatically

When the test target is a fresh BC environment (empty agents, no published channels), drive the setup itself through the same API instead of clicking through the wizard. Useful for retargeting Backend Base URL to a dev backend before a Teams bot smoke test, for example:

```python
from bc_auth import BCClient
c = BCClient()

# 1. Point setup at a dev backend
c.patch("setup", {"backendBaseUrl": "https://api.dev.agent.net.ai"})

# 2. Register the tenant against the backend
c.post_action("registerTenant", {})

# 3. Create a minimal agent
new = c.post("agents", {"name": "Bot Smoke", "active": True, "modelTier": "Smart"})
agent_no = new["no"]

# 4. Publish to a channel (e.g. teams) so the bot router picks it up
c.post(f"agents({agent_no})/publishers", {"channel": "teams", "status": "published"})

# 5. Confirm via the chat surface
print(c.chat(agent_no, "ping")["status"])
```

The exact field names depend on the BC extension's published API page schema — verify against `src/page/Page.72778326.SAAgentsAPI.al` and the `Smart Agent Setup QUA` table. If a field name doesn't resolve, do `c.get("setup")` first and read the actual property keys returned.

## Gotchas

| Symptom | Cause | Resolution |
|---|---|---|
| `success eq false` filter returns Pending / Awaiting rows | `Success` is false-by-default on non-terminal rows | Filter on `isFailure eq true` instead |
| `Awaiting_x0020_Confirmation` in OData responses | Older builds URL-encoded the enum caption | Newer builds emit `AwaitingConfirmation`; bump the extension |
| `bc_search top=20` returns 10 rows | Older agents capped at 10 | Override per agent via `Max Search Results`; default is 20 in newer builds |
| `Field 'memoryUpdate' could not be matched to table fields` | LLM put meta keys in `data{}` | Backend prompt + BC `StripNonDataTopLevelKeys` strip them in newer builds |
| `bc_update` succeeds but record gets deleted | LLM invented `data: {delete: true}` | Dispatcher rejects with "use bc_delete" in newer builds |
| `Field 'City': value 'Köln' does not exist in Post Code` | Misleading wording | Newer builds say "'Köln' is not a registered value (lookup table: Post Code)" |
| `ValueError: Missing credentials` | `bc_auth.py` running from wrong cwd | `cd` into the helper directory |
| `401 Unauthorized` on first call | App reg secret expired or missing API permission | Rotate secret + re-grant `Financials.ReadWrite.All` + admin consent |

## Cleanup

Test runs can leave orphan `AwaitingConfirmation` rows behind if killed mid-execution. Periodically:

- Run `Codeunit "Smart Agent Mgmt. QUA"::CleanupStaleAwaitingConfirmations` via any admin action that wraps it (default age threshold 24h, returns count of rows abandoned).
- Or schedule it as a daily Job Queue entry pointing at that procedure.

## Reference files (paths in `smart-agents-bc-extension`)

- API page sources:
  - `src/page/Page.72778321.SAAgentChatAPI.al`
  - `src/page/Page.72778322.SAToolCallLogAPI.al`
  - `src/page/Page.72778326.SAAgentsAPI.al`
- Tool dispatcher: `src/codeunit/Codeunit.72778300.SmartAgentMgmt.al` (`ExecuteToolCall`)
- Status enum: `src/enum/Enum.72778311.SAToolCallStatus.al`
- Backend tool schemas: `smart-agents-backend/app/services/agent_service.py` (search for `"name": "bc_search"`)
- BC ↔ backend contract: `smart-agents-hub/docs/contracts/bc-backend-contract.md`

<!-- MIT, see LICENSE -->
