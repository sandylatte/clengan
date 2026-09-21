# Accounts and sync, end-to-end encrypted

A design, not a built thing. Nothing in this document exists in the code yet.

Clengan today has no server, no account and no network call. That is not an
omission — it is the reason the privacy story fits in one sentence, and it is a
stronger guarantee than anything below. Read [the threat model](#what-this-does-not-protect-against)
before deciding this is worth building.

Four things are true and shape every decision here:

- **The operator must never be able to read a ledger.** Everything else bends
  to this. Where a feature and this rule conflict, the feature loses.
- **A user who forgets their password and loses their recovery code has lost
  their data.** Permanently. That is not a bug to be fixed later; it is the
  same property as the first bullet, seen from the other side.
- **Sync is opt-in and local-only remains the default.** The app already has
  installed users with data. Signing in must be a thing you choose, not a thing
  that happens to you, and the app must stay fully functional having never seen
  a server.
- **The backend is deliberately stupid.** It stores opaque blobs and hands them
  back. It cannot be clever because it cannot read anything, and that is the
  single best property of the design: a full breach of it leaks ciphertext.

## Key hierarchy

```
password
  └─ Argon2id(password, salt) ─────────────► masterKey        never transmitted
       ├─ HKDF(masterKey, info="auth") ────► authVerifier     sent to log in
       └─ HKDF(masterKey, info="enc") ─────► KEK              never transmitted
                                              │
                                              ▼ wraps
                                            DEK               random, 256-bit
                                              │
                                              ▼ AES-GCM
                                            record ciphertext
```

`salt` is 16 random bytes generated at signup, stored server-side and handed to
the client before login. It is not a secret; it exists so that two users with
the same password derive different keys.

**The auth value and the encryption key must be separate derivations.** This is
the mistake that voids most homegrown end-to-end encryption: if the value sent
to the server to log in is also the value that decrypts, the server can read
everything the moment it decides to, and the claim on the marketing page is
false. Two HKDF expansions with different `info` strings, from one Argon2id
output, costs nothing and closes it.

The server stores `authVerifier` *hashed again* server-side with a slow hash.
A dump of the user table then yields neither a login nor a decryption.

### Why a DEK at all

`KEK` never encrypts a record. It wraps a randomly generated `DEK`, which does.

Without that indirection, changing a password means re-encrypting the user's
entire ledger and re-uploading it. With it, a password change re-derives the KEK
and rewrites one wrapped key: a single row, no data touched.

### Recovery

At signup the client generates a 256-bit recovery code, renders it once as
base32, and stores a *second* wrap of the same DEK under a key derived from it.

Two wraps of one DEK, two independent ways in. The server holds both and can
open neither.

This is not optional. Without it, "forgot my password" destroys a user's
financial history, and at any real user count that stops being hypothetical.

### Record encryption

AES-GCM, 256-bit, with a fresh random 96-bit IV per record. An IV is never
reused under the same key — reuse in GCM is catastrophic, not merely weak.

**The record id goes in the AAD.** Without it the server can move a blob from
one record to another and the client will decrypt it happily, which is a silent
data-corruption primitive handed to the party we are defending against.

The store name (`transactions`, `accounts`, …) lives *inside* the ciphertext,
not beside it. The server therefore cannot tell a category from a transfer.

## Prerequisite: accounts need a stable id (schema v8)

**This lands before any crypto is written.**

Accounts are keyed by name today, and every transaction stores that name as a
plain string. Locally that is survivable: `renameAccount` rewrites every row
across three stores in one atomic transaction, and it works.

Under sync it stops working. A rename becomes "re-encrypt and re-upload the
entire ledger", and two devices renaming the same account while offline produce
a conflict with no correct resolution — there is no identity underneath the
name to reconcile them by.

v8:

- `accounts` gains `id`, a UUID. `name` becomes an ordinary mutable field.
- `transactions.account` becomes `account_id`.
- `settings['default-account']` stores an id rather than a name.
- `renameAccount` collapses from a three-store cursor walk to a single `put`.

Cheap now: one migration, one pass over the rows, the same fall-through
`onupgradeneeded` ladder every other version used. Expensive later: a
coordinated re-key across every device that has already synced.

The case-collision rule in `matchAccountName` stays. Two accounts differing
only in casing are still one account to a reader, id or no id.

## Sync

### What moves

One encrypted blob per record, for every store except `settings` keys that are
device-local. The client keeps its IndexedDB exactly as it is today and treats
the server as a second, untrusted copy.

### Ordering

The server assigns a monotonic `seq` to every write it accepts. A client pulls
"everything with `seq` greater than the last one I saw" and keeps a per-device
cursor.

Client clocks are not used for ordering. They are wrong, they drift, and in a
multi-user system they are attacker-controlled.

### Conflicts

Last-write-wins per record, on a client-supplied `updated_at` used only as a
tiebreak within a pull.

This is lossy and the doc should say so plainly: two devices editing the same
transaction while both offline will silently lose one edit. For one person with
a phone and a laptop that is an acceptable v1. It is not acceptable for a shared
ledger, and if shared ledgers are ever wanted, this section gets replaced by a
CRDT rather than patched.

Deletes are tombstones — a record marked deleted, not a row removed. A hard
delete lets a device that was offline during the delete resurrect the row on its
next push.

### Outbox

Writes go to IndexedDB first and to an outbox queue second. The app stays fully
usable with no network; the queue drains when there is one. This is what keeps
the offline-first behaviour the app already has.

## API surface

Six endpoints. All of them move opaque bytes.

| Endpoint | Purpose |
| --- | --- |
| `POST /signup` | salt, authVerifier, wrapped DEK, recovery-wrapped DEK |
| `GET /salt?email=` | the salt, pre-login. Public by necessity |
| `POST /login` | authVerifier in, session token out |
| `GET /pull?since=` | blobs with `seq` greater than the cursor |
| `POST /push` | blobs up, assigned `seq` back |
| `POST /account/delete` | erases everything for the user |

`GET /salt` is unauthenticated and therefore an account-existence oracle. The
standard mitigation is to return a deterministic fake salt derived from the
email for addresses that do not exist, so the response shape is identical either
way.

## Backend

FastAPI and SQLite. Two tables: users, blobs.

It never sees a key, a password, or a plaintext. There is no server-side
processing to write because there is nothing readable to process — which is
also why no server-side LLM feature can ever be built on this. Anything smart
happens client-side, after decryption.

## What this does not protect against

Stated plainly, because a security design that only lists its strengths is
marketing.

- **A malicious or compromised client build.** The app is JavaScript that the
  operator serves. Whoever controls the deployment can ship a version that
  exfiltrates the KEK on next login, and no amount of cryptography below that
  layer helps. This is the fundamental ceiling of web-delivered end-to-end
  encryption. A signed store build raises the cost — review, versioned
  artifacts, a signing key — but the operator is still the publisher.
- **A compromised device.** Decrypted data lives in IndexedDB on the device by
  design. Device encryption and screen lock are the defence, and neither is ours.
- **Metadata.** The server knows an account exists, its email, when it syncs,
  how often, how many records it holds and how large they are. Activity patterns
  are visible even though content is not.
- **A weak password.** Argon2id raises the cost per guess. It does not rescue
  a password that appears in a wordlist.
- **Traffic analysis.** Sync timing and volume are observable to anyone on the
  path, TLS notwithstanding.

## Build order

Each step is verifiable before the next one starts.

1. **Schema v8** — account ids. No crypto, no network. Existing tests must pass
   and the migration gets its own.
2. **Crypto core** — derive, wrap, encrypt, decrypt, rewrap on password change,
   recover via recovery code. Roughly 200 lines and a test file, no UI, no
   server. If this does not round-trip cleanly nothing after it matters.
3. **Backend** — the six endpoints against SQLite. Testable with `curl`.
4. **Sync engine** — outbox, pull cursor, tombstones. Two browser profiles
   proving a record written in one appears in the other and the server log shows
   only ciphertext.
5. **UI** — signup, login, the recovery code screen, sync state. Not before
   the four steps above work.
6. **Hardening** — rate limiting, account deletion, conflict behaviour under
   deliberate offline divergence.

## Outside the code

These gate shipping and none of them are engineering.

- A privacy policy at a stable URL. Play requires it before a listing exists.
- A data deletion path a user can actually invoke, and a Play Data Safety
  declaration that matches what the code really does.
- GDPR obligations the moment one EU user signs up. Ciphertext does not exempt
  the metadata.
- Hosting, a domain, a TLS certificate and a backup story for the blob table —
  losing it loses every user's ledger, encrypted or not.

Not legal advice. Flags, not answers.

## Open decisions

- **Argon2id or PBKDF2.** Argon2id is the correct choice and needs a WASM
  library; the project currently has zero dependencies and no build step.
  PBKDF2 is native to WebCrypto and structurally free, and meaningfully weaker
  against an attacker holding stolen blobs. This trades a real property of the
  repo against a real property of the security.
- **Email as the account identifier**, which means handling deliverability,
  verification and change-of-address. A username avoids all of it and loses
  password reset by email — though reset is already impossible here by design,
  which weakens the case for email considerably.
- **Whether sync is even the goal.** If the answer is one person across two of
  their own devices, an encrypted file in the user's own cloud drive achieves it
  with no backend, no accounts, and no operator holding anything at all.
