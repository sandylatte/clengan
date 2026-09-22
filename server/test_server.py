"""Tests for the sync server. Run: python3 server/test_server.py

Driven over real HTTP against a live server on a throwaway port with an
in-memory database, so the routing, the status codes and the auth header are
all under test rather than just the Store class.
"""

import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import build  # noqa: E402
from store import Store, RateLimit  # noqa: E402

IDENTITY = {
    "kdf": "pbkdf2-sha256-600k",
    "salt": "c2FsdHNhbHRzYWx0c2E=",
    "recoverySalt": "cmVjb3Zlcnlzc2FsdHM=",
    "authVerifier": "dmVyaWZpZXItYmFzZTY0LXZhbHVl",
    "wrapped": {"iv": "aXZpdml2aXZpdg==", "data": "d3JhcHBlZC1kZWs="},
    "recoveryWrapped": {"iv": "aXYyaXYyaXYyaXY=", "data": "cmVjb3Zlcnktd3JhcA=="},
}


class Client:
    def __init__(self, base):
        self.base = base
        self.token = None

    def __call__(self, method, path, body=None, token=...):
        token = self.token if token is ... else token
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")


class SyncServerTest(unittest.TestCase):
    def setUp(self):
        self.server = build(":memory:")
        # A fresh limiter per test, generous enough that only the test that is
        # actually about rate limiting ever trips it.
        self.server.limiter = RateLimit(limit=1000, window=300)
        host, port = self.server.server_address
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.call = Client(f"http://{host}:{port}")

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def signup(self, email="a@example.com", identity=None):
        status, body = self.call("POST", "/signup", {"email": email, "identity": identity or IDENTITY})
        self.assertEqual(status, 201, body)
        self.call.token = body["token"]
        return body

    # -- identity ---------------------------------------------------------

    def test_health(self):
        self.assertEqual(self.call("GET", "/health")[0], 200)

    def test_signup_returns_a_working_session(self):
        self.signup()
        self.assertEqual(self.call("GET", "/pull")[0], 200)

    def test_signup_requires_every_identity_field(self):
        for missing in IDENTITY:
            partial = {k: v for k, v in IDENTITY.items() if k != missing}
            status, body = self.call("POST", "/signup", {"email": "x@example.com", "identity": partial})
            self.assertEqual(status, 400, f"{missing} was accepted as absent")
            self.assertIn(missing, body["error"])

    def test_signup_rejects_a_nonsense_email(self):
        for bad in ["", "   ", "nope", "a" * 400]:
            status, _ = self.call("POST", "/signup", {"email": bad, "identity": IDENTITY})
            self.assertEqual(status, 400, bad)

    def test_a_duplicate_signup_does_not_reveal_that_the_email_exists(self):
        self.signup("taken@example.com")
        status, body = self.call("POST", "/signup", {"email": "taken@example.com", "identity": IDENTITY})
        self.assertEqual(status, 409)
        # The message must not confirm the address. This is the whole point of
        # the fake-salt design and it would be undone by a candid error here.
        self.assertNotIn("taken@example.com", json.dumps(body))
        self.assertNotIn("exists", json.dumps(body).lower())

    def test_email_is_matched_case_insensitively(self):
        self.signup("Mixed@Example.com")
        status, _ = self.call("POST", "/signup", {"email": "mixed@example.COM", "identity": IDENTITY})
        self.assertEqual(status, 409)

    # -- the salt oracle --------------------------------------------------

    def test_salt_for_a_real_account_is_the_stored_one(self):
        self.signup("real@example.com")
        status, body = self.call("GET", "/salt?email=real@example.com", token=None)
        self.assertEqual(status, 200)
        self.assertEqual(body["salt"], IDENTITY["salt"])

    def test_an_unknown_email_gets_a_salt_of_the_same_shape(self):
        status, body = self.call("GET", "/salt?email=nobody@example.com", token=None)
        self.assertEqual(status, 200)
        self.assertEqual(sorted(body), ["kdf", "recoverySalt", "salt"])
        self.assertTrue(body["salt"])

    def test_the_fake_salt_is_stable_across_calls(self):
        first = self.call("GET", "/salt?email=nobody@example.com", token=None)[1]
        second = self.call("GET", "/salt?email=nobody@example.com", token=None)[1]
        self.assertEqual(first, second, "a fake salt that changes is a tell")

    def test_different_unknown_emails_get_different_fake_salts(self):
        one = self.call("GET", "/salt?email=a@nowhere.test", token=None)[1]
        two = self.call("GET", "/salt?email=b@nowhere.test", token=None)[1]
        self.assertNotEqual(one["salt"], two["salt"])

    # -- login ------------------------------------------------------------

    def test_login_returns_the_identity_to_unlock_with(self):
        self.signup("login@example.com")
        status, body = self.call(
            "POST", "/login",
            {"email": "login@example.com", "authVerifier": IDENTITY["authVerifier"]},
            token=None,
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["identity"]["wrapped"], IDENTITY["wrapped"])
        self.assertTrue(body["token"])

    def test_a_wrong_verifier_is_refused(self):
        self.signup("login@example.com")
        status, _ = self.call(
            "POST", "/login", {"email": "login@example.com", "authVerifier": "d3Jvbmc="}, token=None
        )
        self.assertEqual(status, 401)

    def test_login_says_the_same_thing_for_a_wrong_password_and_no_account(self):
        self.signup("known@example.com")
        _, wrong = self.call(
            "POST", "/login", {"email": "known@example.com", "authVerifier": "d3Jvbmc="}, token=None
        )
        _, absent = self.call(
            "POST", "/login", {"email": "unknown@example.com", "authVerifier": "d3Jvbmc="}, token=None
        )
        self.assertEqual(wrong, absent)

    def test_login_is_rate_limited(self):
        self.server.limiter = RateLimit(limit=3, window=300)
        self.signup("slow@example.com")
        seen = {
            self.call("POST", "/login",
                      {"email": "slow@example.com", "authVerifier": "bm8="}, token=None)[0]
            for _ in range(6)
        }
        self.assertIn(429, seen)

    # -- auth on the sync endpoints ---------------------------------------

    def test_every_sync_endpoint_refuses_an_absent_token(self):
        for method, path, body in [
            ("GET", "/pull", None),
            ("POST", "/push", {"records": []}),
            ("POST", "/identity", {"identity": IDENTITY}),
            ("POST", "/account/delete", None),
        ]:
            status, _ = self.call(method, path, body, token=None)
            self.assertEqual(status, 401, f"{method} {path} was reachable unauthenticated")

    def test_a_forged_token_is_refused(self):
        self.signup()
        status, _ = self.call("GET", "/pull", token="not-a-real-token")
        self.assertEqual(status, 401)

    def test_logout_kills_the_token(self):
        self.signup()
        self.assertEqual(self.call("POST", "/logout")[0], 200)
        self.assertEqual(self.call("GET", "/pull")[0], 401)

    # -- blobs ------------------------------------------------------------

    def test_push_then_pull_round_trips(self):
        self.signup()
        _, pushed = self.call("POST", "/push", {"records": [
            {"id": "r1", "iv": "aXY=", "data": "ZGF0YTE=", "updatedAt": 10},
            {"id": "r2", "iv": "aXY=", "data": "ZGF0YTI=", "updatedAt": 11},
        ]})
        self.assertEqual(pushed["applied"], ["r1", "r2"])
        _, pulled = self.call("GET", "/pull?since=0")
        self.assertEqual([r["id"] for r in pulled["records"]], ["r1", "r2"])
        self.assertEqual(pulled["records"][0]["data"], "ZGF0YTE=")

    def test_pull_since_returns_only_what_is_new(self):
        self.signup()
        self.call("POST", "/push", {"records": [{"id": "r1", "iv": "aXY=", "data": "ZA==", "updatedAt": 1}]})
        _, first = self.call("GET", "/pull?since=0")
        cursor = first["seq"]
        self.call("POST", "/push", {"records": [{"id": "r2", "iv": "aXY=", "data": "ZA==", "updatedAt": 2}]})
        _, second = self.call(f"GET", f"/pull?since={cursor}")
        self.assertEqual([r["id"] for r in second["records"]], ["r2"])

    def test_seq_is_monotonic_even_when_a_record_is_rewritten(self):
        self.signup()
        self.call("POST", "/push", {"records": [{"id": "r1", "iv": "aXY=", "data": "ZA==", "updatedAt": 1}]})
        _, again = self.call("POST", "/push", {"records": [
            {"id": "r1", "iv": "aXY=", "data": "ZTI=", "updatedAt": 2}
        ]})
        _, pulled = self.call("GET", "/pull?since=1")
        self.assertEqual([r["id"] for r in pulled["records"]], ["r1"])
        self.assertEqual(pulled["records"][0]["data"], "ZTI=")
        self.assertGreater(again["seq"], 1)

    def test_an_older_write_does_not_overwrite_a_newer_one(self):
        self.signup()
        self.call("POST", "/push", {"records": [{"id": "r1", "iv": "aXY=", "data": "bmV3", "updatedAt": 50}]})
        _, result = self.call("POST", "/push", {"records": [
            {"id": "r1", "iv": "aXY=", "data": "b2xk", "updatedAt": 10}
        ]})
        self.assertEqual(result["skipped"], ["r1"])
        _, pulled = self.call("GET", "/pull?since=0")
        self.assertEqual(pulled["records"][0]["data"], "bmV3")

    def test_a_delete_is_a_tombstone_a_puller_can_see(self):
        self.signup()
        self.call("POST", "/push", {"records": [{"id": "r1", "iv": "aXY=", "data": "ZA==", "updatedAt": 1}]})
        self.call("POST", "/push", {"records": [
            {"id": "r1", "iv": "aXY=", "data": "ZA==", "updatedAt": 2, "deleted": True}
        ]})
        _, pulled = self.call("GET", "/pull?since=0")
        self.assertTrue(pulled["records"][0]["deleted"])

    def test_a_record_needs_an_id_and_a_body(self):
        self.signup()
        for bad in [{"iv": "aXY=", "data": "ZA=="}, {"id": "r", "data": "ZA=="}, {"id": "r", "iv": "aXY="}]:
            status, _ = self.call("POST", "/push", {"records": [bad]})
            self.assertEqual(status, 400, bad)

    def test_an_oversized_blob_is_refused(self):
        self.signup()
        status, _ = self.call("POST", "/push", {"records": [
            {"id": "big", "iv": "aXY=", "data": "A" * 1_048_577, "updatedAt": 1}
        ]})
        self.assertEqual(status, 400)

    def test_since_must_be_a_number(self):
        self.signup()
        self.assertEqual(self.call("GET", "/pull?since=-1")[0], 400)
        self.assertEqual(self.call("GET", "/pull?since=abc")[0], 400)

    # -- isolation --------------------------------------------------------

    def test_one_account_cannot_see_another_accounts_blobs(self):
        self.signup("first@example.com")
        self.call("POST", "/push", {"records": [
            {"id": "secret", "iv": "aXY=", "data": "bWluZQ==", "updatedAt": 1}
        ]})
        first_token = self.call.token

        self.call.token = None
        self.signup("second@example.com")
        _, pulled = self.call("GET", "/pull?since=0")
        self.assertEqual(pulled["records"], [], "blobs leaked across accounts")

        self.call.token = first_token
        _, mine = self.call("GET", "/pull?since=0")
        self.assertEqual(len(mine["records"]), 1)

    def test_deleting_an_account_removes_its_blobs_and_its_session(self):
        self.signup("bye@example.com")
        self.call("POST", "/push", {"records": [{"id": "r", "iv": "aXY=", "data": "ZA==", "updatedAt": 1}]})
        self.assertEqual(self.call("POST", "/account/delete")[0], 200)
        self.assertEqual(self.call("GET", "/pull")[0], 401)
        # And the address is free again, which proves the user row went too.
        self.assertEqual(
            self.call("POST", "/signup", {"email": "bye@example.com", "identity": IDENTITY}, token=None)[0],
            201,
        )

    # -- identity change --------------------------------------------------

    def test_changing_the_identity_leaves_every_blob_alone(self):
        self.signup("rotate@example.com")
        self.call("POST", "/push", {"records": [
            {"id": "r1", "iv": "aXY=", "data": "dW50b3VjaGVk", "updatedAt": 1}
        ]})
        changed = {**IDENTITY, "salt": "bmV3c2FsdG5ld3NhbHQ=", "authVerifier": "bmV3LXZlcmlmaWVy"}
        status, body = self.call("POST", "/identity", {"identity": changed})
        self.assertEqual(status, 200)

        self.call.token = body["token"]
        _, pulled = self.call("GET", "/pull?since=0")
        self.assertEqual(pulled["records"][0]["data"], "dW50b3VjaGVk")

    def test_changing_the_identity_ends_every_other_session(self):
        self.signup("rotate@example.com")
        stale = self.call.token
        changed = {**IDENTITY, "authVerifier": "bmV3LXZlcmlmaWVy"}
        _, body = self.call("POST", "/identity", {"identity": changed})
        self.assertEqual(self.call("GET", "/pull", token=stale)[0], 401)
        self.assertEqual(self.call("GET", "/pull", token=body["token"])[0], 200)

    def test_the_new_verifier_is_what_logs_in_afterwards(self):
        self.signup("rotate@example.com")
        changed = {**IDENTITY, "authVerifier": "bmV3LXZlcmlmaWVy"}
        self.call("POST", "/identity", {"identity": changed})
        old = self.call("POST", "/login",
                        {"email": "rotate@example.com", "authVerifier": IDENTITY["authVerifier"]},
                        token=None)[0]
        new = self.call("POST", "/login",
                        {"email": "rotate@example.com", "authVerifier": "bmV3LXZlcmlmaWVy"},
                        token=None)[0]
        self.assertEqual(old, 401)
        self.assertEqual(new, 200)

    # -- what the server must never hold ----------------------------------

    def test_the_verifier_is_not_stored_as_given(self):
        store = Store(":memory:")
        store.signup({"email": "x@example.com", "identity": IDENTITY})
        row = store.db.execute("SELECT * FROM users").fetchone()
        dumped = repr(tuple(row))
        self.assertNotIn(IDENTITY["authVerifier"], dumped)

    def test_a_session_token_is_not_stored_as_given(self):
        store = Store(":memory:")
        token = store.signup({"email": "x@example.com", "identity": IDENTITY})["token"]
        rows = store.db.execute("SELECT token_hash FROM sessions").fetchall()
        self.assertTrue(rows)
        self.assertNotIn(token, repr([tuple(r) for r in rows]))

    def test_an_unknown_endpoint_is_a_404_not_a_crash(self):
        self.assertEqual(self.call("GET", "/nope", token=None)[0], 404)

    def test_a_malformed_body_is_a_400_not_a_500(self):
        host, port = self.server.server_address
        request = urllib.request.Request(
            f"http://{host}:{port}/signup", data=b"{not json", method="POST"
        )
        request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
