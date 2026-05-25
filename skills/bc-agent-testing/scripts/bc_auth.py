"""BCClient — OAuth2 + REST wrapper for the SmartAgents Business Central AL API.

Standalone helper that ships with the `bc-agent-testing` skill. Stdlib only;
no `requests` dep so anyone can run it. See SKILL.md for usage.

Contract:

- Reads credentials from a `.env` file that sits **next to this script**, not
  in the current working directory. This is intentional: the file carries a
  client secret and we want it to stay in one well-known place.
- `BCClient()` raises `ValueError("Missing credentials: ...")` listing the
  missing keys when any of BC_TENANT_ID / BC_CLIENT_ID / BC_CLIENT_SECRET /
  BC_ENVIRONMENT / BC_COMPANY_ID is absent.
- Token acquisition uses OAuth2 client-credentials against the tenant token
  endpoint with scope `https://api.businesscentral.dynamics.com/.default`.
  Tokens are cached until 30s before their stated expiry.
- Data calls send `Authorization: Bearer <token>` and `Accept:
  application/json`; POST/PATCH bodies are JSON.
- `get_all(path)` follows `@odata.nextLink` until exhausted.
- HTTP 401 raises `BCAuthError` with an actionable hint about app
  registration permissions — this is by far the most common bootstrap
  failure and a silent re-raise wastes time.

The script's behavior is locked down by the unit tests in
`test_bc_auth.py`; keep them green when refactoring.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

_SCRIPT_DIR = Path(__file__).resolve().parent

_REQUIRED_KEYS = (
    "BC_TENANT_ID",
    "BC_CLIENT_ID",
    "BC_CLIENT_SECRET",
    "BC_ENVIRONMENT",
    "BC_COMPANY_ID",
)

_BC_API_HOST = "api.businesscentral.dynamics.com"
_BC_SCOPE = f"https://{_BC_API_HOST}/.default"
_API_ROOT = f"https://{_BC_API_HOST}/v2.0"
_API_SUFFIX = "api/qualiaTechnik/smartAgents/v1.0"
_TOKEN_SKEW_SECONDS = 30
_MAX_PAGES = 10_000  # safety ceiling on get_all pagination

_GUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _redact_secret(text: str, secret: str) -> str:
    """Replace every occurrence of a secret in a string with `<REDACTED>`.
    Used to scrub error payloads before they reach an exception message
    that might be logged."""
    if not secret:
        return text
    return text.replace(secret, "<REDACTED>")


class BCAuthError(RuntimeError):
    """Raised when an API call returns 401 — usually missing API permission
    or expired client secret on the bot's Entra app."""


class BCError(RuntimeError):
    """Raised on any non-2xx HTTP response that isn't a 401."""


def _load_dotenv(path: Path) -> dict[str, str]:
    """Parse a `.env` file into a dict. Ignores blank lines and `#` comments.
    Values may be wrapped in single or double quotes; quotes are stripped.
    Reads as utf-8-sig so a Notepad-saved BOM doesn't corrupt the first key.
    Non-blank, non-comment lines without `=` emit a stderr warning so a typo
    like `BC_TENANT-ID my-id` doesn't masquerade as a missing-key error."""
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for lineno, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            # Deliberately do NOT echo the line content. A typo like
            # `BC_CLIENT_SECRET shh-real-secret` (missing `=`) would otherwise
            # leak the secret to stderr and shell history. The line number
            # plus file path is enough to find the typo.
            print(
                f"bc_auth: warning: skipping malformed line {lineno} in {path} "
                f"(no '=' separator)",
                file=sys.stderr,
            )
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
            val = val[1:-1]
        out[key] = val
    return out


class BCClient:
    """OAuth2 + REST client for the SmartAgents BC AL API.

    Reads credentials from `.env` next to this script. Token is acquired
    lazily on first data call and cached until expiry.
    """

    def __init__(self):
        env = _load_dotenv(_SCRIPT_DIR / ".env")
        missing = [k for k in _REQUIRED_KEYS if not env.get(k)]
        if missing:
            raise ValueError(
                "Missing credentials in .env: " + ", ".join(missing)
                + f". Expected location: {_SCRIPT_DIR / '.env'}"
            )
        self.tenant_id     = env["BC_TENANT_ID"]
        self.client_id     = env["BC_CLIENT_ID"]
        self.client_secret = env["BC_CLIENT_SECRET"]
        self.environment   = env["BC_ENVIRONMENT"]
        self.company_id    = env["BC_COMPANY_ID"]

        self._token: str | None = None
        self._token_expires_at: float = 0.0

    # ── auth ────────────────────────────────────────────────────────────

    def _acquire_token(self) -> str:
        # Use monotonic time for the cache check. Wall-clock (time.time())
        # can step backwards (NTP correction, manual change, VM snapshot
        # restore) which would extend the cache past the token's actual
        # expiry — every subsequent call would 401 with a misleading hint.
        if self._token and time.monotonic() < self._token_expires_at - _TOKEN_SKEW_SECONDS:
            return self._token

        url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        body = urlencode({
            "grant_type":    "client_credentials",
            "client_id":     self.client_id,
            "client_secret": self.client_secret,
            "scope":         _BC_SCOPE,
        }).encode("utf-8")
        req = Request(
            url,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except HTTPError as e:
            # Scrub the secret before it lands in the exception message.
            # Entra echoes the submitted form back in some 4xx responses, and
            # the request body itself contains the secret — `raise ... from None`
            # also drops the original exception so logging.exception() can't
            # capture req.data.
            raw = e.read().decode("utf-8", errors="replace")
            safe = _redact_secret(raw, self.client_secret)
            hint = (
                "BC_CLIENT_SECRET likely expired or wrong, OR the app registration "
                "is missing API permission Financials.ReadWrite.All with admin consent."
                if e.code == 401
                else "Confirm the BC_CLIENT_SECRET is current and the app registration has "
                     "API permission Financials.ReadWrite.All with admin consent granted."
            )
            raise BCAuthError(
                f"Token acquisition failed ({e.code}): {safe[:500]}. {hint}"
            ) from None
        except URLError as e:
            # Same contract as data calls — DNS / connection failures must
            # surface as a typed exception, not a raw urllib stack trace.
            raise BCAuthError(
                f"Token endpoint network error ({url}): {e.reason}. "
                "Check connectivity to login.microsoftonline.com."
            ) from None

        # Validate the response shape explicitly — AAD misroutes / Conditional
        # Access quirks can return 200 with missing fields. Bare KeyError gives
        # the user no signal about what to fix.
        if "access_token" not in data:
            raise BCAuthError(
                f"Token response missing access_token field. "
                f"Body: {json.dumps(data)[:300]}"
            )
        if "expires_in" not in data:
            raise BCAuthError(
                f"Token response missing expires_in field; refusing to guess a lifetime. "
                f"Body: {json.dumps(data)[:300]}"
            )

        self._token = data["access_token"]
        self._token_expires_at = time.monotonic() + int(data["expires_in"])
        return self._token

    def _headers(self, *, body: bool = False) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self._acquire_token()}",
            "Accept":        "application/json",
        }
        if body:
            h["Content-Type"] = "application/json"
        return h

    # ── url construction ────────────────────────────────────────────────

    def _company_url(self, path: str) -> str:
        """Build a full API URL. `path` semantics:

        - `""`                          → company root (`companies({id})`)
        - `"companies"` / `"companies(...)"` → top-level entity set (unscoped)
        - any other string              → company-scoped (`companies({id})/{path}`)
        - already-absolute URL          → treated as a resolved `@odata.nextLink`;
                                          must be https AND on the BC API host,
                                          otherwise refused to prevent the
                                          Bearer token from leaking off-host

        Locking the nextLink host stops a misconfigured proxy (or a malicious
        upstream rewrite) from steering authenticated requests to an attacker-
        controlled endpoint."""
        if path.startswith(("http://", "https://")):
            parsed = urlparse(path)
            if parsed.scheme != "https":
                raise BCError(
                    f"Refusing to follow nextLink over plaintext http: {path[:120]}. "
                    "Check for an upstream proxy rewriting the OData nextLink."
                )
            if parsed.hostname != _BC_API_HOST:
                raise BCError(
                    f"Refusing nextLink to unexpected host {parsed.hostname!r}: "
                    f"{path[:120]}. Only {_BC_API_HOST} is trusted to receive "
                    "the Bearer token."
                )
            return path

        base = f"{_API_ROOT}/{self.tenant_id}/{self.environment}/{_API_SUFFIX}"

        # Top-level paths (companies, companies(<id>), ...) are not company-
        # scoped. The bootstrap step `c.get_all("companies")` documented in
        # SKILL.md depends on this.
        if path == "companies" or path.startswith("companies("):
            return f"{base}/{path}"

        company = f"companies({self.company_id})"
        suffix = f"/{path}" if path else ""
        return f"{base}/{company}{suffix}"

    # ── verbs ───────────────────────────────────────────────────────────

    def get(self, path: str) -> Any:
        return self._call("GET", self._company_url(path))

    def get_all(self, path: str) -> list[dict]:
        """Follow `@odata.nextLink` pagination, returning the concatenated
        `value` arrays. For single-record endpoints (no `value` key), returns
        a one-element list. Guards against pagination loops (BC echoing the
        same nextLink) and an unbounded page count."""
        rows: list[dict] = []
        url = self._company_url(path)
        seen: set[str] = set()
        for _ in range(_MAX_PAGES):
            if url is None:
                return rows
            if url in seen:
                raise BCError(
                    f"Pagination loop detected — server returned the same "
                    f"@odata.nextLink twice: {url[:120]}"
                )
            seen.add(url)
            payload = self._call("GET", url)
            if isinstance(payload, dict) and "value" in payload:
                rows.extend(payload["value"])
                next_link = payload.get("@odata.nextLink")
                url = self._company_url(next_link) if next_link else None
            else:
                rows.append(payload)
                return rows
        raise BCError(
            f"get_all exceeded {_MAX_PAGES} pages — suspected runaway pagination."
        )

    def post(self, path: str, body: dict) -> Any:
        return self._call("POST", self._company_url(path), body=body)

    def patch(self, path: str, body: dict) -> Any:
        return self._call("PATCH", self._company_url(path), body=body)

    def delete(self, path: str) -> Any:
        return self._call("DELETE", self._company_url(path))

    # ── high-level wrappers documented in SKILL.md ──────────────────────

    def chat(self, agent_no: int, message: str) -> dict:
        """POST a message to the synchronous chat endpoint. Returns the full
        response record — see SKILL.md "synchronous test loop" for the shape."""
        return self.post("agentChat", {"agentNo": agent_no, "message": message})

    def post_action(self, path: str, body: dict | None = None) -> Any:
        """POST to an OData v4 action endpoint.

        `path` is the bound/unbound action URL fragment, e.g.
        `"setup/Microsoft.NAV.registerTenant"`. The body defaults to an
        empty object — most BC actions take no parameters.

        This is a thin convenience over ``post()`` so the seeding recipe
        in SKILL.md stays readable; everything ``post()`` documents about
        auth, host validation, and error handling applies here too."""
        return self.post(path, body or {})

    def tool_call_log(self, request_id: str) -> list[dict]:
        """Fetch every tool call row for one chat request, ordered as BC
        returns them (newest entry first). Rejects non-GUID input up front —
        a literal `'` in the input would otherwise survive URL encoding,
        break the OData filter quietly, and return an empty list that looks
        like 'no rows for this request' rather than 'malformed input'."""
        if not _GUID_RE.match(request_id):
            raise ValueError(
                f"request_id must be a GUID; got {request_id!r}"
            )
        # OData filter values need both the GUID quoted (single quotes) and
        # the surrounding spaces percent-encoded. BC's OData layer is
        # forgiving of literal spaces in some envs but rejects in others —
        # encode unconditionally so the call shape is identical everywhere.
        filter_value = quote(f"requestId eq '{request_id}'", safe="=")
        orderby_value = quote("entryNo desc", safe="=")
        path = f"toolCallLog?$filter={filter_value}&$orderby={orderby_value}"
        return self.get_all(path)

    def list_agents(self) -> list[dict]:
        return self.get_all("agentChat")

    # ── core HTTP plumbing ──────────────────────────────────────────────

    def _call(self, method: str, url: str, body: dict | None = None) -> Any:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = Request(
            url,
            data=data,
            headers=self._headers(body=body is not None),
            method=method,
        )
        try:
            with urlopen(req, timeout=180) as resp:
                payload = resp.read()
            if not payload:
                return {}
            return json.loads(payload.decode("utf-8"))
        except HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            safe = _redact_secret(raw, self.client_secret)
            if e.code == 401:
                raise BCAuthError(
                    f"401 Unauthorized on {method} {url}: {safe[:300]}. "
                    "Verify the BC_CLIENT_SECRET is current AND that the app "
                    "registration in Entra has API permission "
                    "Financials.ReadWrite.All for the Business Central resource, "
                    "and admin consent has been granted in the BC tenant."
                ) from None
            if e.code == 403:
                # 403 is "authenticated but not authorized" — distinct fix
                # from 401's app-permission story. Most common causes: the
                # S2S-auth user (Application Access table) lacks the right
                # BC permission set, the app isn't granted access to this
                # company, or the BC license tier excludes the API.
                raise BCAuthError(
                    f"403 Forbidden on {method} {url}: {safe[:300]}. "
                    "Check: (a) the Application Access record assigns a "
                    "permission set that grants this entity, (b) the app's "
                    "S2S user has access to the target company, (c) the BC "
                    "license tier permits the AL API."
                ) from None
            raise BCError(f"{method} {url} failed ({e.code}): {safe[:500]}") from None
        except URLError as e:
            raise BCError(f"{method} {url} network error: {e.reason}") from None
