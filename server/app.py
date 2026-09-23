#!/usr/bin/env python3
"""HTTP for encrypted sync. Routing and nothing else — the thinking is in
store.py, which has no HTTP in it and is where the tests point.

Stdlib on purpose. FastAPI would be the choice for something production-grade,
but six endpoints over SQLite do not need it, and requiring `pip install`
on a PEP 668 distribution means a venv to manage before anything runs. Moving
to FastAPI later is mechanical: the Store class is already the whole API.

Run:  python3 server/app.py
Env:  CLENGAN_DB      path to the SQLite file  (default server/sync.db)
      CLENGAN_ORIGINS comma-separated allowed origins for CORS
      CLENGAN_PORT    default 8787
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from store import Store, RateLimit, Conflict, Unauthorised, BadRequest  # noqa: E402

# 8 MiB. A push is capped at 2,000 records in store.py; this is the blunt
# stop in front of that so a hostile body is refused before it is parsed.
MAX_BODY = 8 * 1024 * 1024

DEFAULT_ORIGINS = "http://localhost:8124,http://127.0.0.1:8124,https://sandylatte.github.io"

# Every route that needs a session, declared rather than implied by where the
# auth call happens to sit in the if-chain.
AUTHENTICATED = {
    ("GET", "/pull"),
    ("POST", "/push"),
    ("POST", "/identity"),
    ("POST", "/account/delete"),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "clengan-sync"
    # HTTP/1.1 rather than the 1.0 default: keep-alive, and Content-Length is
    # set on every response below, which is what 1.1 requires. Plain correctness
    # for anything a browser talks to.
    protocol_version = "HTTP/1.1"
    # The default logs every request line to stderr. Paths here carry an email
    # in a query string, so the access log would quietly become a list of who
    # has an account.
    def log_message(self, *args):
        pass

    # -- plumbing ---------------------------------------------------------

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise BadRequest("body too large")
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            raise BadRequest("body must be JSON")

    def _token(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise Unauthorised("a session token is required")
        return header[7:].strip()

    def _client(self):
        return self.client_address[0]

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    # -- routes -----------------------------------------------------------

    def _route(self, method):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        store = self.server.store
        try:
            if method == "GET" and url.path == "/health":
                return self._send(200, {"ok": True})

            if method == "GET" and url.path == "/salt":
                if not self.server.limiter.check(f"salt:{self._client()}"):
                    return self._send(429, {"error": "too many requests"})
                return self._send(200, store.salt_for((query.get("email") or [""])[0]))

            if method == "POST" and url.path == "/signup":
                if not self.server.limiter.check(f"signup:{self._client()}"):
                    return self._send(429, {"error": "too many requests"})
                return self._send(201, store.signup(self._body()))

            if method == "POST" and url.path == "/login":
                body = self._body()
                # Keyed on the address AND the client, so one attacker cannot
                # lock a victim out of their own account by burning the limit
                # on their email from elsewhere.
                key = f"login:{self._client()}:{str(body.get('email') or '')[:320].lower()}"
                if not self.server.limiter.check(key):
                    return self._send(429, {"error": "too many requests"})
                return self._send(200, store.login(body))

            if method == "POST" and url.path == "/logout":
                store.logout(self._token())
                return self._send(200, {"ok": True})

            # Route first, authenticate second. The other order makes an
            # unknown path answer 401, which hides nothing — the endpoint list
            # is in the client's own source — and misleads anyone debugging a
            # typo into thinking their token is bad.
            if (method, url.path) not in AUTHENTICATED:
                return self._send(404, {"error": "no such endpoint"})

            user_id = store.user_for(self._token())

            if method == "GET" and url.path == "/pull":
                since = (query.get("since") or ["0"])[0]
                if not str(since).isdigit():
                    raise BadRequest("since must be a non-negative integer")
                return self._send(200, store.pull(user_id, int(since)))

            if method == "POST" and url.path == "/push":
                return self._send(200, store.push(user_id, self._body().get("records")))

            if method == "POST" and url.path == "/identity":
                return self._send(200, store.change_identity(user_id, self._body().get("identity") or {}))

            if method == "POST" and url.path == "/account/delete":
                return self._send(200, store.delete_account(user_id))

            return self._send(404, {"error": "no such endpoint"})

        except BadRequest as error:
            return self._send(400, {"error": str(error)})
        except Unauthorised as error:
            return self._send(401, {"error": str(error)})
        except Conflict as error:
            return self._send(409, {"error": str(error)})
        except Exception:  # noqa: BLE001
            # Never surface the exception. A stack trace from a store holding
            # ciphertext is a description of the schema to whoever asked.
            import traceback

            traceback.print_exc(file=sys.stderr)
            return self._send(500, {"error": "internal error"})


def build(db_path=":memory:", origins=None):
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.store = Store(db_path)
    server.limiter = RateLimit()
    server.origins = set(origins or DEFAULT_ORIGINS.split(","))
    return server


def main():
    port = int(os.environ.get("CLENGAN_PORT", 8787))
    db_path = os.environ.get(
        "CLENGAN_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync.db")
    )
    origins = os.environ.get("CLENGAN_ORIGINS", DEFAULT_ORIGINS).split(",")

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.store = Store(db_path)
    server.limiter = RateLimit()
    server.origins = set(o.strip() for o in origins if o.strip())

    print(f"clengan sync on http://127.0.0.1:{port}  db={db_path}", file=sys.stderr)
    print(f"origins: {sorted(server.origins)}", file=sys.stderr)
    # Bound to 127.0.0.1 deliberately. Exposing this needs TLS in front of it:
    # the session token is a bearer credential and goes over the wire on every
    # request.
    server.serve_forever()


if __name__ == "__main__":
    main()
