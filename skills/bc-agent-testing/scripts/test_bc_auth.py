"""Unit tests for bc_auth.BCClient.

Run from the scripts/ directory:

    python -m unittest test_bc_auth.py -v

These tests do not require a real BC tenant or network access — every
outbound call is mocked. They cover the contract the SKILL.md guarantees:

- Credentials load from a `.env` adjacent to bc_auth.py, not from cwd
- OAuth2 client-credentials shape (grant_type, scope, client_id)
- Token caching until expiry
- Bearer auth on data calls
- `chat()` POST body and response passthrough
- `tool_call_log()` OData filter shape
- `get_all()` follows `@odata.nextLink`
- 401 surfaces a permission-shaped error, not a silent shrug
"""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))


def _resp(body: dict | list, status: int = 200, headers: dict | None = None):
    """Build a fake urllib response object."""
    class _R:
        def __init__(self):
            self.status = status
            self.headers = headers or {}
            self._payload = json.dumps(body).encode("utf-8")

        def read(self):
            return self._payload

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def getcode(self):
            return self.status

    return _R()


def _err(status: int, body: dict | str = ""):
    """Build a urllib.error.HTTPError analog."""
    from urllib.error import HTTPError
    if isinstance(body, bytes):
        payload = body
    elif isinstance(body, dict):
        payload = json.dumps(body).encode("utf-8")
    else:
        payload = body.encode("utf-8")
    fp = io.BytesIO(payload)
    return HTTPError("https://example.invalid", status, "err", {}, fp)


_VALID_ENV = {
    "BC_TENANT_ID":     "80189abf-5929-4f1c-9c77-e8a43717d27e",
    "BC_CLIENT_ID":     "00000000-1111-2222-3333-444444444444",
    "BC_CLIENT_SECRET": "shh-test-only",
    "BC_ENVIRONMENT":   "Ext_Dev_v26",
    "BC_COMPANY_ID":    "18e7dd9f-c2e6-ef11-9345-6045bdaca720",
}


class _EnvDir:
    """Context manager: writes a .env into a tempdir + cd's a freshly-imported
    bc_auth module to treat that tempdir as its own location.
    """

    def __init__(self, env: dict | None):
        self._env = env
        self._tmp = None
        self._patcher = None

    def __enter__(self):
        self._tmp = tempfile.TemporaryDirectory()
        if self._env is not None:
            (Path(self._tmp.name) / ".env").write_text(
                "\n".join(f"{k}={v}" for k, v in self._env.items()) + "\n",
                encoding="utf-8",
            )
        # Point bc_auth at this dir as if the script lived there
        import bc_auth
        self._patcher = patch.object(bc_auth, "_SCRIPT_DIR", Path(self._tmp.name))
        self._patcher.start()
        # Clear any OS env vars so they don't bleed into the test
        for k in _VALID_ENV:
            os.environ.pop(k, None)
        return Path(self._tmp.name)

    def __exit__(self, *a):
        self._patcher.stop()
        self._tmp.cleanup()


class TestEnvLoading(unittest.TestCase):

    def test_missing_env_file_raises(self):
        import bc_auth
        with _EnvDir(env=None):
            with self.assertRaises(ValueError) as cm:
                bc_auth.BCClient()
            self.assertIn("Missing credentials", str(cm.exception))

    def test_partial_env_raises_naming_missing_keys(self):
        import bc_auth
        partial = dict(_VALID_ENV)
        partial.pop("BC_CLIENT_SECRET")
        with _EnvDir(partial):
            with self.assertRaises(ValueError) as cm:
                bc_auth.BCClient()
            self.assertIn("BC_CLIENT_SECRET", str(cm.exception))

    def test_env_loads_from_script_dir_not_cwd(self):
        """Run the test from a different cwd to prove .env discovery is
        anchored to the script's own directory."""
        import bc_auth
        with _EnvDir(_VALID_ENV), tempfile.TemporaryDirectory() as other_cwd:
            old = os.getcwd()
            try:
                os.chdir(other_cwd)
                # Should NOT find a .env at other_cwd, but DOES find it at script_dir
                c = bc_auth.BCClient()
                self.assertEqual(c.environment, "Ext_Dev_v26")
                self.assertEqual(c.company_id, _VALID_ENV["BC_COMPANY_ID"])
            finally:
                os.chdir(old)


class TestTokenAcquisition(unittest.TestCase):

    def test_oauth_body_shape(self):
        import bc_auth
        captured = {}

        def fake_open(req, timeout=None):
            captured["url"] = req.full_url
            captured["headers"] = dict(req.header_items())
            captured["body"] = req.data
            return _resp({"access_token": "tok-123", "expires_in": 3600})

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                tok = c._acquire_token()
        self.assertEqual(tok, "tok-123")
        self.assertIn(_VALID_ENV["BC_TENANT_ID"], captured["url"])
        self.assertIn("oauth2/v2.0/token", captured["url"])
        body = captured["body"].decode("utf-8")
        self.assertIn("grant_type=client_credentials", body)
        self.assertIn(f"client_id={_VALID_ENV['BC_CLIENT_ID']}", body)
        self.assertIn(f"client_secret={_VALID_ENV['BC_CLIENT_SECRET']}", body)
        # The scope must be the BC API resource — this is what most config errors
        # set wrong, so the assert is worth its weight.
        self.assertIn("api.businesscentral.dynamics.com", body)
        self.assertIn(".default", body)

    def test_token_is_cached_until_expiry(self):
        import bc_auth
        calls = {"n": 0}

        def fake_open(req, timeout=None):
            calls["n"] += 1
            return _resp({"access_token": f"tok-{calls['n']}", "expires_in": 3600})

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                t1 = c._acquire_token()
                t2 = c._acquire_token()
        self.assertEqual(t1, t2)
        self.assertEqual(calls["n"], 1, "second _acquire_token should hit cache")

    def test_token_refreshes_after_expiry(self):
        import bc_auth

        def fake_open(req, timeout=None):
            return _resp({"access_token": "tok-A", "expires_in": 60})

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                c._acquire_token()
                # simulate expiry well past the configured 30s skew —
                # _token_expires_at is monotonic time, so pin it to the past
                # relative to monotonic, not wall-clock
                c._token_expires_at = time.monotonic() - 1
                with patch("bc_auth.urlopen", return_value=_resp(
                    {"access_token": "tok-B", "expires_in": 60}
                )):
                    self.assertEqual(c._acquire_token(), "tok-B")


class TestApiCalls(unittest.TestCase):

    def _client(self):
        import bc_auth
        c = bc_auth.BCClient()
        # Pre-load a fake token so we don't have to mock the token endpoint
        # in every data-call test.
        c._token = "test-token"
        c._token_expires_at = time.time() + 3600
        return c

    def test_chat_post_shape(self):
        import bc_auth
        captured = {}

        def fake_open(req, timeout=None):
            captured["method"] = req.get_method()
            captured["url"] = req.full_url
            captured["headers"] = dict(req.header_items())
            captured["body"] = json.loads(req.data.decode("utf-8"))
            return _resp({
                "agentNo": 110,
                "message": "hi",
                "status": "completed",
                "response": "Hello back",
                "requestId": "11111111-1111-1111-1111-111111111111",
                "sessionId": "22222222-2222-2222-2222-222222222222",
                "creditsUsed": 0.02,
                "tokensUsed": 240,
            })

        with _EnvDir(_VALID_ENV):
            c = self._client()
            with patch("bc_auth.urlopen", side_effect=fake_open):
                result = c.chat(110, "hi")

        self.assertEqual(captured["method"], "POST")
        self.assertIn(f"companies({_VALID_ENV['BC_COMPANY_ID']})/agentChat", captured["url"])
        self.assertIn(_VALID_ENV["BC_ENVIRONMENT"], captured["url"])
        self.assertEqual(captured["body"], {"agentNo": 110, "message": "hi"})
        # Authorization header must be Bearer + the cached token
        # urllib lowercases header names when capturing via header_items()
        auth_val = next(v for k, v in captured["headers"].items() if k.lower() == "authorization")
        self.assertEqual(auth_val, "Bearer test-token")
        # Content-Type must be application/json (BC rejects form-encoded POST to API pages)
        ct = next(v for k, v in captured["headers"].items() if k.lower() == "content-type")
        self.assertEqual(ct, "application/json")

        # Response must passthrough untouched
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["response"], "Hello back")
        self.assertEqual(result["requestId"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(result["creditsUsed"], 0.02)

    def test_tool_call_log_filter_shape(self):
        import bc_auth
        captured = {}

        def fake_open(req, timeout=None):
            captured["url"] = req.full_url
            return _resp({"value": [
                {"entryNo": 1, "functionName": "bc_search", "success": True},
            ]})

        with _EnvDir(_VALID_ENV):
            c = self._client()
            with patch("bc_auth.urlopen", side_effect=fake_open):
                rows = c.tool_call_log("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.assertEqual(rows[0]["functionName"], "bc_search")
        # GUID must be quoted properly in OData $filter — BC rejects un-quoted GUIDs on string fields
        self.assertIn("toolCallLog", captured["url"])
        self.assertIn("requestId%20eq%20%27aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee%27", captured["url"])
        # Tool Call Log auto-orders desc on entryNo — make sure we don't accidentally drop the ordering
        self.assertIn("orderby=entryNo%20desc", captured["url"])

    def test_get_all_follows_nextlink(self):
        import bc_auth
        page1 = {
            "value": [{"id": 1}, {"id": 2}],
            "@odata.nextLink": "https://api.businesscentral.dynamics.com/PAGE2",
        }
        page2 = {"value": [{"id": 3}]}
        responses = [_resp(page1), _resp(page2)]

        def fake_open(req, timeout=None):
            return responses.pop(0)

        with _EnvDir(_VALID_ENV):
            c = self._client()
            with patch("bc_auth.urlopen", side_effect=fake_open):
                rows = c.get_all("anything")
        self.assertEqual([r["id"] for r in rows], [1, 2, 3])
        self.assertEqual(len(responses), 0, "second page should be fetched")

    def test_401_surfaces_permission_hint(self):
        import bc_auth

        def fake_open(req, timeout=None):
            # Trigger HTTPError on the data call (not on the token call —
            # _client() pre-seeded the token)
            raise _err(401, {"error": {"code": "Unauthorized", "message": "no perms"}})

        with _EnvDir(_VALID_ENV):
            c = self._client()
            with patch("bc_auth.urlopen", side_effect=fake_open):
                with self.assertRaises(bc_auth.BCAuthError) as cm:
                    c.get("anything")
        msg = str(cm.exception)
        # Must surface permission hint loudly — this is the most common failure mode
        # and a silent re-raise wastes 20 minutes of debugging
        self.assertIn("401", msg)
        self.assertTrue(
            "permission" in msg.lower() or "consent" in msg.lower() or "Financials.ReadWrite.All" in msg,
            msg,
        )


class TestSilentFailureGuards(unittest.TestCase):
    """Cover the failure modes the three review agents flagged.

    Each test pins a specific silent-failure mode that the helper
    must NOT exhibit. Removing the corresponding guard re-fails the test.
    """

    def test_env_with_utf8_bom_loads_correctly(self):
        """A .env saved by Notepad on Windows starts with a UTF-8 BOM.
        Without utf-8-sig the BOM becomes part of the first key name
        and produces a confusing 'Missing credentials' error."""
        import bc_auth
        with tempfile.TemporaryDirectory() as d:
            env_path = Path(d) / ".env"
            # Write with explicit BOM, mirroring Windows Notepad
            env_path.write_bytes(
                b"\xef\xbb\xbf"
                + "\n".join(f"{k}={v}" for k, v in _VALID_ENV.items()).encode("utf-8")
            )
            with patch.object(bc_auth, "_SCRIPT_DIR", Path(d)):
                for k in _VALID_ENV:
                    os.environ.pop(k, None)
                c = bc_auth.BCClient()
                self.assertEqual(c.tenant_id, _VALID_ENV["BC_TENANT_ID"])

    def test_malformed_dotenv_line_emits_warning(self):
        """Lines without `=` get silently dropped today — a typo like
        `BC_TENANT-ID my-id` would surface as 'Missing credentials' instead
        of the real cause. Loader should warn on stderr."""
        import bc_auth
        with tempfile.TemporaryDirectory() as d:
            env_path = Path(d) / ".env"
            env_path.write_text(
                "\n".join(f"{k}={v}" for k, v in _VALID_ENV.items())
                + "\nthis line has no equals sign\n",
                encoding="utf-8",
            )
            with patch.object(bc_auth, "_SCRIPT_DIR", Path(d)):
                for k in _VALID_ENV:
                    os.environ.pop(k, None)
                captured_stderr = io.StringIO()
                with patch.object(sys, "stderr", captured_stderr):
                    bc_auth.BCClient()
                self.assertIn("malformed", captured_stderr.getvalue().lower())

    def test_malformed_dotenv_warning_does_not_echo_line_content(self):
        """If a user accidentally writes `BC_CLIENT_SECRET shh-real-secret`
        (missing =), echoing the line content would leak the secret into
        stderr / shell history. The warning must give the user enough to
        find the line (line number) without printing the value."""
        import bc_auth
        leak_marker = "totally-secret-shhhh-1234567890abc"
        with tempfile.TemporaryDirectory() as d:
            env_path = Path(d) / ".env"
            env_path.write_text(
                "\n".join(f"{k}={v}" for k, v in _VALID_ENV.items())
                + f"\nBC_CLIENT_SECRET {leak_marker}\n",
                encoding="utf-8",
            )
            with patch.object(bc_auth, "_SCRIPT_DIR", Path(d)):
                for k in _VALID_ENV:
                    os.environ.pop(k, None)
                captured_stderr = io.StringIO()
                with patch.object(sys, "stderr", captured_stderr):
                    bc_auth.BCClient()
                out = captured_stderr.getvalue()
                self.assertNotIn(leak_marker, out, "warning leaked a secret-looking token")
                # Must still be useful — line number gets the user to the typo
                self.assertIn("line", out.lower())

    def test_token_missing_access_token_raises_clearly(self):
        """If AAD returns a 200 with no access_token field (gateway misroute,
        Conditional Access policy quirk), bare KeyError gives no context."""
        import bc_auth

        def fake_open(req, timeout=None):
            return _resp({"error_description": "weird response"})

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                with self.assertRaises(bc_auth.BCAuthError) as cm:
                    c._acquire_token()
        self.assertIn("access_token", str(cm.exception))

    def test_token_missing_expires_in_raises_clearly(self):
        """expires_in missing is also AAD misconfiguration — defaulting to 1h
        silently could mint a stale token for an hour if AAD ever shrank
        lifetimes. Hard error, not a guess."""
        import bc_auth

        def fake_open(req, timeout=None):
            return _resp({"access_token": "tok"})  # no expires_in

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                with self.assertRaises(bc_auth.BCAuthError) as cm:
                    c._acquire_token()
        self.assertIn("expires_in", str(cm.exception))

    def test_token_endpoint_401_surfaces_hint(self):
        """The token endpoint has its own 401 code path (separate from data
        calls). Expired client_secret is the #1 cause."""
        import bc_auth

        def fake_open(req, timeout=None):
            raise _err(401, {"error": "invalid_client", "error_description": "secret expired"})

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                with self.assertRaises(bc_auth.BCAuthError) as cm:
                    c._acquire_token()
        msg = str(cm.exception)
        self.assertIn("401", msg)
        self.assertTrue(
            "secret" in msg.lower() or "consent" in msg.lower(),
            f"token-endpoint 401 should mention the actionable hint: {msg}",
        )

    def test_token_error_does_not_leak_client_secret(self):
        """Entra echoes the submitted form back on some 4xx — and the secret
        is in that form. Anything that logs the exception (Sentry, etc.) would
        capture the secret. Must scrub."""
        import bc_auth
        # Simulate Entra echoing the request body — which contains client_secret
        echoed_body = {
            "error": "invalid_client",
            "submitted": f"client_id=foo&client_secret={_VALID_ENV['BC_CLIENT_SECRET']}",
        }

        def fake_open(req, timeout=None):
            raise _err(400, echoed_body)

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                try:
                    c._acquire_token()
                except bc_auth.BCAuthError as e:
                    # The raised message + its chained context must not contain the secret
                    self.assertNotIn(_VALID_ENV["BC_CLIENT_SECRET"], str(e))
                    self.assertIsNone(e.__cause__, "use `raise ... from None` to suppress the original (which carries the secret in req.data)")
                else:
                    self.fail("BCAuthError not raised")

    def test_https_nextlink_accepted_http_rejected(self):
        """An HTTPS nextLink pointing at the BC API host is normal — accept.
        An HTTP nextLink, or a nextLink to ANY other host, would send the
        Bearer token over cleartext / to an attacker-controlled endpoint —
        reject in both cases."""
        import bc_auth

        bc_host = "https://api.businesscentral.dynamics.com"

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "tok"
            c._token_expires_at = time.monotonic() + 3600

            # HTTPS nextLink on the BC API host is fine
            page1 = {"value": [{"id": 1}], "@odata.nextLink": f"{bc_host}/page2"}
            page2 = {"value": [{"id": 2}]}
            responses = [_resp(page1), _resp(page2)]
            with patch("bc_auth.urlopen", side_effect=lambda *_a, **_k: responses.pop(0)):
                rows = c.get_all("a")
            self.assertEqual([r["id"] for r in rows], [1, 2])

            # HTTP nextLink must be refused
            bad_http = {"value": [{"id": 1}], "@odata.nextLink": f"http://api.businesscentral.dynamics.com/page2"}
            with patch("bc_auth.urlopen", return_value=_resp(bad_http)):
                with self.assertRaises(bc_auth.BCError) as cm:
                    c.get_all("a")
            msg = str(cm.exception).lower()
            self.assertTrue(
                "plaintext" in msg or "cleartext" in msg or "http:" in msg,
                f"http:// nextLink rejection should call out the protocol downgrade: {msg}",
            )

    def test_nextlink_rejects_unknown_host(self):
        """nextLink pointing at a host other than BC's API host = token
        exfiltration vector. Refuse loudly even if the scheme is https."""
        import bc_auth

        attacker = "https://evil.example.com/steal"
        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "tok"
            c._token_expires_at = time.monotonic() + 3600
            page = {"value": [{"id": 1}], "@odata.nextLink": attacker}
            with patch("bc_auth.urlopen", return_value=_resp(page)):
                with self.assertRaises(bc_auth.BCError) as cm:
                    c.get_all("a")
        msg = str(cm.exception).lower()
        self.assertIn("host", msg)

    def test_get_all_companies_does_not_double_prefix(self):
        """`get_all('companies')` must hit the top-level companies endpoint,
        not `companies({id})/companies` — the documented bootstrap flow for
        resolving BC_COMPANY_ID needs this to work."""
        import bc_auth
        captured = {}

        def fake_open(req, timeout=None):
            captured["url"] = req.full_url
            return _resp({"value": [{"id": "co-guid", "name": "CRONUS DE"}]})

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "tok"
            c._token_expires_at = time.monotonic() + 3600
            with patch("bc_auth.urlopen", side_effect=fake_open):
                rows = c.get_all("companies")
        self.assertEqual(rows[0]["name"], "CRONUS DE")
        # Must NOT contain a duplicated companies segment
        self.assertNotIn("companies(" + _VALID_ENV["BC_COMPANY_ID"] + ")/companies", captured["url"])
        # Must end with /companies (the top-level entity set)
        self.assertTrue(
            captured["url"].endswith("/companies"),
            f"top-level companies path malformed: {captured['url']}",
        )

    def test_post_action_helper_calls_post(self):
        """SKILL.md's sandbox seeding snippet calls `c.post_action(...)`.
        Add the helper so the documented snippet is executable."""
        import bc_auth
        captured = {}

        def fake_open(req, timeout=None):
            captured["method"] = req.get_method()
            captured["url"] = req.full_url
            captured["body"] = json.loads(req.data.decode("utf-8"))
            return _resp({"ok": True})

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "tok"
            c._token_expires_at = time.monotonic() + 3600
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c.post_action("setup/Microsoft.NAV.registerTenant", {"forceRefresh": True})
        self.assertEqual(captured["method"], "POST")
        self.assertIn("setup/Microsoft.NAV.registerTenant", captured["url"])
        self.assertEqual(captured["body"], {"forceRefresh": True})

    def test_acquire_token_handles_urlerror(self):
        """DNS failure or connection refused on the token endpoint should
        raise BCAuthError, not a raw urllib stack trace — that's the same
        contract we hold for data calls."""
        import bc_auth
        from urllib.error import URLError

        def fake_open(req, timeout=None):
            raise URLError("nodename nor servname provided")

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                with self.assertRaises(bc_auth.BCAuthError) as cm:
                    c._acquire_token()
        msg = str(cm.exception).lower()
        self.assertIn("network", msg)

    def test_get_all_breaks_on_repeating_nextlink(self):
        """If BC ever echoes the same nextLink, current code spins forever
        accumulating duplicates. Must break with a clear error."""
        import bc_auth

        loop_url = "https://api.businesscentral.dynamics.com/v2.0/loop"
        loop_payload = {"value": [{"id": 1}], "@odata.nextLink": loop_url}

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "tok"
            c._token_expires_at = time.monotonic() + 3600
            with patch("bc_auth.urlopen", return_value=_resp(loop_payload)):
                with self.assertRaises(bc_auth.BCError) as cm:
                    c.get_all("anything")
        self.assertIn("loop", str(cm.exception).lower())

    def test_tool_call_log_rejects_non_guid(self):
        """A literal `'` in request_id survives URL encoding and breaks the
        OData filter (returns []). Reject non-GUID input up front so the
        failure is loud."""
        import bc_auth

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "tok"
            c._token_expires_at = time.monotonic() + 3600
            with self.assertRaises(ValueError):
                c.tool_call_log("not-a-guid")
            with self.assertRaises(ValueError):
                c.tool_call_log("aaaa'; drop table--")

    def test_token_cache_uses_monotonic_time(self):
        """`time.time()` is wall-clock. If NTP steps backwards while the
        client is up, the cached token can stay 'fresh' past its true
        expiry and every subsequent call 401s. Must use time.monotonic()."""
        import bc_auth

        def fake_open(req, timeout=None):
            return _resp({"access_token": "tok-1", "expires_in": 3600})

        with _EnvDir(_VALID_ENV):
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c = bc_auth.BCClient()
                c._acquire_token()
                # If implementation used wall-clock time, time.time() jumping
                # backwards would extend the cache. Verify the recorded
                # expires_at is monotonic-shaped (i.e. relatively small —
                # monotonic is process-uptime; wall-clock is unix-epoch ~1.7e9).
                self.assertLess(
                    c._token_expires_at, 1_000_000_000,
                    "token expiry timestamp looks like wall-clock seconds-since-epoch; should be monotonic"
                )

    def test_403_distinct_from_401(self):
        """403 means "you're authenticated but not authorized" — different
        actionable hint from 401's "your auth is broken". Both deserve a
        BCAuthError, but with different guidance."""
        import bc_auth

        def fake_open(req, timeout=None):
            raise _err(403, {"error": {"message": "forbidden"}})

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "test-token"
            c._token_expires_at = time.monotonic() + 3600
            with patch("bc_auth.urlopen", side_effect=fake_open):
                with self.assertRaises(bc_auth.BCAuthError) as cm:
                    c.get("anything")
        msg = str(cm.exception)
        self.assertIn("403", msg)
        # 403 hint should talk about permission-sets / company access, not
        # admin consent on the Entra app (which is what 401 talks about).
        self.assertTrue(
            "permission set" in msg.lower() or "company" in msg.lower() or "license" in msg.lower(),
            f"403 should hint at BC-side permission sets / company access: {msg}",
        )

    def test_5xx_surfaces_as_bcerror(self):
        """500-class errors aren't a silent failure but the test was missing —
        ensure refactors don't accidentally swallow them."""
        import bc_auth

        def fake_open(req, timeout=None):
            raise _err(500, "internal server error")

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "test-token"
            c._token_expires_at = time.monotonic() + 3600
            with patch("bc_auth.urlopen", side_effect=fake_open):
                with self.assertRaises(bc_auth.BCError) as cm:
                    c.get("anything")
        self.assertIn("500", str(cm.exception))

    def test_network_error_surfaces_as_bcerror(self):
        """URLError (DNS failure, connection refused) should become BCError,
        not a bare urllib stack trace."""
        import bc_auth
        from urllib.error import URLError

        def fake_open(req, timeout=None):
            raise URLError("nodename nor servname provided")

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "test-token"
            c._token_expires_at = time.monotonic() + 3600
            with patch("bc_auth.urlopen", side_effect=fake_open):
                with self.assertRaises(bc_auth.BCError) as cm:
                    c.get("anything")
        self.assertIn("network", str(cm.exception).lower())


class TestWriteHelpers(unittest.TestCase):

    def test_patch_uses_patch_verb_with_body(self):
        import bc_auth
        captured = {}

        def fake_open(req, timeout=None):
            captured["method"] = req.get_method()
            captured["body"] = json.loads(req.data.decode("utf-8"))
            return _resp({"ok": True})

        with _EnvDir(_VALID_ENV):
            c = bc_auth.BCClient()
            c._token = "test-token"
            c._token_expires_at = time.time() + 3600
            with patch("bc_auth.urlopen", side_effect=fake_open):
                c.patch("setup", {"backendBaseUrl": "https://api.dev.agent.net.ai"})
        self.assertEqual(captured["method"], "PATCH")
        self.assertEqual(captured["body"], {"backendBaseUrl": "https://api.dev.agent.net.ai"})


if __name__ == "__main__":
    unittest.main()
