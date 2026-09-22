# The sync server

Step 3 of [ARCHITECTURE-SYNC.md](../ARCHITECTURE-SYNC.md). It stores opaque
blobs and hands them back. It cannot read a single one of them, and that is the
entire security argument.

Nothing in the app imports this yet. The client half is `vault.js`; the wiring
between them is step 4 and does not exist.

## Running it

```bash
python3 server/app.py
```

Stdlib only — no `pip install`, no venv, no `requirements.txt`. FastAPI would
be the choice if this ever needed to be production-grade, and the move is
mechanical because `Store` already is the whole API with no HTTP in it.

| Variable | Default | |
| --- | --- | --- |
| `CLENGAN_PORT` | `8787` | |
| `CLENGAN_DB` | `server/sync.db` | `:memory:` for a throwaway |
| `CLENGAN_ORIGINS` | localhost:8124 and the Pages origin | comma separated |

It binds to `127.0.0.1` on purpose. The session token is a bearer credential
sent on every request, so exposing this needs TLS in front of it — there is no
configuration flag for "serve this to the internet in the clear".

## Tests

```bash
python3 server/test_server.py      # 34, over real HTTP
node server/test_integration.mjs   # 9, real vault.js keys through the real server
```

The integration run spawns the Python server itself, so `node` and `python3`
both have to be on the path. It is the only place the two halves are proven to
fit: an identity made by the browser's crypto, accepted by the server, pushed
as ciphertext, pulled by a second "device" holding nothing but the password.

## What it holds, and what it cannot

Per user: an email, a KDF name, two public salts, a slow hash of the auth
verifier, the wrapped DEK, the recovery-wrapped DEK, and a pile of ciphertext
with sequence numbers and sizes.

It never sees a password, a key, or a plaintext record. The verifier the client
sends to log in is a *different* HKDF expansion from the key that decrypts
(`vault.js`, rule 1), so even the value it does receive cannot open anything —
and it is stored scrypt-hashed, so a dump of the table is not a login either.

Three things it deliberately does not defend against, all of them in the threat
model and none of them fixable here:

- **A malicious client build.** Whoever serves the JavaScript can ship a
  version that leaks the key. This is the ceiling of web-delivered end-to-end
  encryption and no server-side measure raises it.
- **Metadata.** Who has an account, when they sync, how much they hold.
- **A weak password.** The KDF raises the cost per guess and nothing more.

## Notes on the design that are easy to undo by accident

- **`GET /salt` must answer for addresses that do not exist.** It returns a
  deterministic fake derived from a server secret, stable across calls, so the
  endpoint is not a list of who has an account. A 404 here would undo it.
- **Signup failures must stay opaque.** `"could not create that account"`, never
  `"that email is taken"` — same reason.
- **Login answers identically** for a wrong password and an absent account, and
  spends comparable time on both.
- **Order is the server's `seq`, never a client clock.** Client clocks drift and
  are attacker-controlled. `updatedAt` only breaks the tie over which version of
  one record survives, which is last-write-wins and lossy — two devices editing
  the same row offline will silently lose one edit. Acceptable for one person
  with two devices; replace with a CRDT before it is anything else.
- **Deletes are tombstones.** A hard delete lets a device that was offline
  during it resurrect the row on its next push.

Each of those has a test, and each test was checked to fail when the property is
removed. A security test that cannot fail is decoration.
