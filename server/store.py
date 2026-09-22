"""Storage and auth for encrypted sync. No HTTP in this file.

The server is deliberately stupid. It holds opaque blobs and hands them back;
it cannot be clever because it cannot read anything. A full breach of it leaks
ciphertext and metadata, and that is the whole security argument — see
ARCHITECTURE-SYNC.md.

Nothing here ever sees a password, a key, or a plaintext record. The client
derives an auth verifier that is NOT the encryption key (vault.js, rule 1) and
this module stores a slow hash of that verifier. So a dump of the users table
yields neither a login nor a decryption.
"""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time

# A blob is one encrypted record. Clengan's largest row is a transaction with a
# note, which is a few hundred bytes before encryption; a megabyte cap is
# nowhere near it and still stops the store being used as free file hosting.
MAX_BLOB_BYTES = 1_048_576
MAX_RECORDS_PER_PUSH = 2_000

SESSION_TTL = 30 * 24 * 3600

# scrypt at interactive-login cost. The verifier reaching us is already 256
# bits of HKDF output rather than a human password, so this is defence against
# a table dump being replayed as a login, not against guessing.
SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  kdf              TEXT NOT NULL,
  salt             TEXT NOT NULL,
  recovery_salt    TEXT NOT NULL,
  verifier_hash    BLOB NOT NULL,
  verifier_salt    BLOB NOT NULL,
  wrapped          TEXT NOT NULL,
  recovery_wrapped TEXT NOT NULL,
  next_seq         INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blobs (
  user_id    TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  iv         TEXT NOT NULL,
  data       TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, record_id)
);
CREATE INDEX IF NOT EXISTS blobs_by_seq ON blobs (user_id, seq);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash BLOB PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);
"""


class Conflict(Exception):
    """A signup that cannot proceed. Never says why, to the caller or the log."""


class Unauthorised(Exception):
    pass


class BadRequest(Exception):
    pass


def _normalise_email(value):
    email = str(value or "").strip().lower()
    # Not validation, just a floor. Deliverability is not this module's problem
    # and a stricter regex would reject addresses that are actually valid.
    if len(email) < 3 or "@" not in email or len(email) > 320:
        raise BadRequest("an email address is required")
    return email


def _hash_verifier(verifier, salt):
    return hashlib.scrypt(verifier.encode(), salt=salt, **SCRYPT)


def _hash_token(token):
    return hashlib.sha256(token.encode()).digest()


class Store:
    def __init__(self, path=":memory:"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SCHEMA)
        self.secret = self._secret()

    def _secret(self):
        """Server-side secret for deterministic fake salts. Created once."""
        row = self.db.execute("SELECT value FROM meta WHERE key='secret'").fetchone()
        if row:
            return row["value"]
        secret = secrets.token_bytes(32)
        with self.db:
            self.db.execute("INSERT INTO meta (key, value) VALUES ('secret', ?)", (secret,))
        return secret

    # -- identity ---------------------------------------------------------

    def signup(self, body):
        email = _normalise_email(body.get("email"))
        identity = body.get("identity") or {}
        for field in ("kdf", "salt", "recoverySalt", "authVerifier", "wrapped", "recoveryWrapped"):
            if not identity.get(field):
                raise BadRequest(f"identity.{field} is required")

        verifier_salt = secrets.token_bytes(16)
        verifier_hash = _hash_verifier(identity["authVerifier"], verifier_salt)
        user_id = secrets.token_hex(16)
        try:
            with self.db:
                self.db.execute(
                    "INSERT INTO users (id, email, kdf, salt, recovery_salt, verifier_hash,"
                    " verifier_salt, wrapped, recovery_wrapped, created_at)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (
                        user_id, email, identity["kdf"], identity["salt"],
                        identity["recoverySalt"], verifier_hash, verifier_salt,
                        json.dumps(identity["wrapped"]),
                        json.dumps(identity["recoveryWrapped"]),
                        int(time.time()),
                    ),
                )
        except sqlite3.IntegrityError:
            # Deliberately the same opaque failure whatever went wrong. "That
            # email is taken" is an account-existence oracle handed to anyone
            # who asks.
            raise Conflict("could not create that account")
        return {"token": self._issue(user_id)}

    def salt_for(self, email_value):
        """Pre-login. Unauthenticated by necessity: the client cannot derive
        its verifier without the salt, and it has not logged in yet.

        An unknown address gets a FAKE salt derived deterministically from the
        server secret, so the response is identical in shape and stable across
        calls. Returning an error here would turn this endpoint into a list of
        who has an account.
        """
        email = _normalise_email(email_value)
        row = self.db.execute(
            "SELECT kdf, salt, recovery_salt FROM users WHERE email=?", (email,)
        ).fetchone()
        if row:
            return {"kdf": row["kdf"], "salt": row["salt"], "recoverySalt": row["recovery_salt"]}
        fake = hmac.new(self.secret, email.encode(), hashlib.sha256).digest()
        import base64

        return {
            "kdf": "pbkdf2-sha256-600k",
            "salt": base64.b64encode(fake[:16]).decode(),
            "recoverySalt": base64.b64encode(fake[16:32]).decode(),
        }

    def login(self, body):
        email = _normalise_email(body.get("email"))
        verifier = str(body.get("authVerifier") or "")
        row = self.db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row:
            # Spend comparable time on an unknown address so the response time
            # does not answer the question the fake salt refused to.
            _hash_verifier(verifier or "x", b"0" * 16)
            raise Unauthorised("email or password is wrong")

        candidate = _hash_verifier(verifier, row["verifier_salt"])
        if not hmac.compare_digest(candidate, row["verifier_hash"]):
            raise Unauthorised("email or password is wrong")

        return {
            "token": self._issue(row["id"]),
            "identity": {
                "kdf": row["kdf"],
                "salt": row["salt"],
                "recoverySalt": row["recovery_salt"],
                "wrapped": json.loads(row["wrapped"]),
                "recoveryWrapped": json.loads(row["recovery_wrapped"]),
            },
        }

    def change_identity(self, user_id, identity):
        """After a client-side password change or recovery-code rotation. The
        DEK is unchanged and every blob stays exactly as it is — that is the
        entire point of wrapping a data key rather than encrypting under the
        password.
        """
        for field in ("kdf", "salt", "recoverySalt", "authVerifier", "wrapped", "recoveryWrapped"):
            if not identity.get(field):
                raise BadRequest(f"identity.{field} is required")
        verifier_salt = secrets.token_bytes(16)
        with self.db:
            self.db.execute(
                "UPDATE users SET kdf=?, salt=?, recovery_salt=?, verifier_hash=?,"
                " verifier_salt=?, wrapped=?, recovery_wrapped=? WHERE id=?",
                (
                    identity["kdf"], identity["salt"], identity["recoverySalt"],
                    _hash_verifier(identity["authVerifier"], verifier_salt), verifier_salt,
                    json.dumps(identity["wrapped"]), json.dumps(identity["recoveryWrapped"]),
                    user_id,
                ),
            )
            # Every other session dies. A password change that leaves old
            # sessions alive does not lock out whoever the change was aimed at.
            self.db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        return {"token": self._issue(user_id)}

    # -- sessions ---------------------------------------------------------

    def _issue(self, user_id):
        token = secrets.token_urlsafe(32)
        with self.db:
            self.db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
                (_hash_token(token), user_id, int(time.time()) + SESSION_TTL),
            )
        return token

    def user_for(self, token):
        """Tokens are stored hashed for the same reason passwords are: a dump
        of the sessions table should not be a set of live logins.
        """
        if not token:
            raise Unauthorised("a session token is required")
        row = self.db.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token_hash=?", (_hash_token(token),)
        ).fetchone()
        if not row or row["expires_at"] < time.time():
            raise Unauthorised("session expired")
        return row["user_id"]

    def logout(self, token):
        with self.db:
            self.db.execute("DELETE FROM sessions WHERE token_hash=?", (_hash_token(token),))

    # -- blobs ------------------------------------------------------------

    def pull(self, user_id, since=0):
        rows = self.db.execute(
            "SELECT record_id, seq, iv, data, deleted, updated_at FROM blobs"
            " WHERE user_id=? AND seq>? ORDER BY seq",
            (user_id, int(since)),
        ).fetchall()
        return {
            "records": [
                {
                    "id": r["record_id"], "seq": r["seq"], "iv": r["iv"], "data": r["data"],
                    "deleted": bool(r["deleted"]), "updatedAt": r["updated_at"],
                }
                for r in rows
            ],
            "seq": rows[-1]["seq"] if rows else int(since),
        }

    def push(self, user_id, records):
        """Last-write-wins on the client's updatedAt, with the server's own seq
        used for ordering.

        Client clocks are wrong, drift, and are attacker-controlled, so they
        never decide what a puller sees next — that is seq, assigned here. The
        timestamp only breaks the tie over which of two versions of the SAME
        record survives, which is lossy and documented as such.
        """
        if not isinstance(records, list):
            raise BadRequest("records must be a list")
        if len(records) > MAX_RECORDS_PER_PUSH:
            raise BadRequest(f"at most {MAX_RECORDS_PER_PUSH} records per push")

        applied, skipped = [], []
        with self.db:
            row = self.db.execute("SELECT next_seq FROM users WHERE id=?", (user_id,)).fetchone()
            if row is None:
                raise Unauthorised("no such user")
            seq = row["next_seq"]

            for record in records:
                record_id = str(record.get("id") or "")
                iv, data = str(record.get("iv") or ""), str(record.get("data") or "")
                if not record_id or not iv or not data:
                    raise BadRequest("each record needs an id, an iv and data")
                if len(data) > MAX_BLOB_BYTES:
                    raise BadRequest(f"record {record_id} is over {MAX_BLOB_BYTES} bytes")
                updated_at = int(record.get("updatedAt") or 0)

                existing = self.db.execute(
                    "SELECT updated_at FROM blobs WHERE user_id=? AND record_id=?",
                    (user_id, record_id),
                ).fetchone()
                if existing and existing["updated_at"] > updated_at:
                    skipped.append(record_id)
                    continue

                self.db.execute(
                    "INSERT INTO blobs (user_id, record_id, seq, iv, data, deleted, updated_at)"
                    " VALUES (?,?,?,?,?,?,?)"
                    " ON CONFLICT(user_id, record_id) DO UPDATE SET"
                    " seq=excluded.seq, iv=excluded.iv, data=excluded.data,"
                    " deleted=excluded.deleted, updated_at=excluded.updated_at",
                    (user_id, record_id, seq, iv, data,
                     1 if record.get("deleted") else 0, updated_at),
                )
                applied.append(record_id)
                seq += 1

            self.db.execute("UPDATE users SET next_seq=? WHERE id=?", (seq, user_id))
        return {"seq": seq - 1, "applied": applied, "skipped": skipped}

    def delete_account(self, user_id):
        with self.db:
            self.db.execute("DELETE FROM blobs WHERE user_id=?", (user_id,))
            self.db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
            self.db.execute("DELETE FROM users WHERE id=?", (user_id,))
        return {"deleted": True}


class RateLimit:
    """A fixed window per key, in memory.

    ponytail: in-memory, so it resets on restart and does not span processes.
    Move to a table or a shared cache if this ever runs behind more than one
    worker — as written, N workers means N times the allowance.
    """

    def __init__(self, limit=10, window=300):
        self.limit, self.window = limit, window
        self.hits = {}

    def check(self, key):
        now = time.time()
        recent = [t for t in self.hits.get(key, []) if now - t < self.window]
        if len(recent) >= self.limit:
            self.hits[key] = recent
            return False
        recent.append(now)
        self.hits[key] = recent
        return True
