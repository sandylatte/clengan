# Handoff

Written 22 September 2026, at commit `1655bce`. Everything described here is
pushed and live at https://sandylatte.github.io/clengan/ (`clengan-v104`).

Read [README.md](README.md) for how to run it, [DESIGN.md](DESIGN.md) for the
design system (it is machine-checked — see the traps below), and
[ARCHITECTURE-SYNC.md](ARCHITECTURE-SYNC.md) for the encrypted-sync design,
which is the largest thing in the repo and the least finished.

## Where the project actually is

Clengan is a local-first PWA money tracker. It works, it is deployed, it is
installable, and the core has been stable for a while. Two large things landed
recently and neither is finished business.

**Encrypted sync exists but nobody can use it.** Five of six build steps are
done: schema v8, `vault.js`, `server/`, `sync.js`, and a Sync tile in Settings.
There is no hosted server anywhere and the tile's server field ships blank, so
it is inert until someone points it at one they run. That is deliberate, not an
oversight — see the open questions.

**The Play Store listing is prepared but not submitted.** Everything that can be
done without a Google account, a signing key and a payment method is done. The
rest cannot be done by anyone but the owner.

## What shipped in the last session

| Commit | |
| --- | --- |
| `6e15853` | Spacing cut 25% — the Add form ran 1188px on an 812px screen |
| `26d4eae` | Type ramp down one step; form fields pinned at 16px (iOS zoom trap) |
| `120e86e` | Settings tile opens on one beat instead of three |
| `b132ca4` | Encrypted-sync design, written before any of it was built |
| `d539302` | Schema v8 — accounts get a stable UUID |
| `e435eec` | `vault.js`, the crypto core |
| `99f3c71` | `server/`, six endpoints over SQLite |
| `91d3419` | Play Store prep: maskable icons, `twa/`, `privacy.html` |
| `74f575c` | `sync.js`, the sync engine |
| `1655bce` | The Sync tile |

## Traps. Read these before touching anything

These have each cost real debugging time. They are not hypothetical.

**`DB_NAME` is `'moneytrack'` and must never change.** The app was renamed to
Clengan; the database was not. That string is the key to every transaction on
every device that has ever installed this. Renaming it does not migrate
anything — the ledger is simply no longer found. Same for the
`moneytrack-theme` localStorage key.

**Bump `CACHE` in `sw.js` on any change to a file in `SHELL`.** The worker is
cache-first and only evicts caches whose name differs. Skip the bump and every
existing install keeps the old code forever, silently, including whatever bug
you just fixed.

**Unregister the service worker before every check during development.** A
`CACHE` bump alone is not enough. The worker re-registers on reload and will
serve you the shell from before your edit, and the suite will pass against code
that is no longer on disk. This has produced at least three false results,
including one this session where a migration test reported 14/17 against a
database that had never been migrated. When a result surprises you, check the
schema version or the file bytes directly rather than trusting the score.

**`node --test test/` silently runs nothing useful.** It reports 1 test, 1 fail.
Use bare `node --test` from the repo root.

**`DESIGN.md` is machine-checked.** `test/tokens.test.js` asserts every
`font-size` in `styles.css` appears in the DESIGN.md ramp. A new size fails the
suite until the doc moves with it. This is a feature; do not add an exception.

**The agent browser pane blocks `GET` to a local server while allowing `POST`.**
This is an environment artifact, not a bug in the app — `curl` gets correct GETs
with correct CORS headers from the same process, and a plain POST to the same
URL reaches it. Consequence: the sync **pull** path cannot be verified in that
pane. It is covered by `server/test_integration.mjs`, which drives real pulls
from node. The pane also cannot take screenshots reliably (it runs hidden), so
animations can be confirmed to attach but never watched.

**Never point `test.html` at the real database.** It uses `moneytrack-test`.
`migration-test.html` uses its own throwaway name and deletes it afterwards.

## Running and testing

```bash
python3 serve.py                   # dev server, sends no-store
node --test                        # 296 pure-logic tests
python3 server/test_server.py      # 34 HTTP tests for the sync backend
node server/test_integration.mjs   # 14 end-to-end, spawns the server itself
```

Two suites need a browser, and both need the service worker unregistered first:

```
http://localhost:8124/test.html            # 28, the IndexedDB layer
http://localhost:8124/migration-test.html  # 17, the v7 → v8 migration
```

`python3 server/app.py` runs the sync backend. Stdlib only — no pip, no venv.

## What is not done

**Step 6 of the sync build order.** Client-side handling of rate limits, account
deletion in the UI, and conflict behaviour under deliberate offline divergence.
The engine does last-write-wins and that is **lossy**: two devices editing the
same record while both offline will silently lose one edit. Acceptable for one
person with two devices; not acceptable for anything shared, and it needs a CRDT
rather than a patch if that changes.

**PBKDF2 is the weak point, deliberately and reversibly.** `vault.js` uses
PBKDF2-SHA256 at 600k because it is native to WebCrypto and costs no dependency
and no build step. It is cheap to attack on a GPU in a way Argon2id is not. The
parameters are a named set stored on each identity and a password change carries
the identity forward, so adding Argon2id is a new entry in `KDFS` rather than a
migration. **Revisit before real users exist.**

**The Play Store blocker.** Digital Asset Links must be served from the domain
root, and `https://sandylatte.github.io/` is a 404 with no repository behind it.
A project Pages site under `/clengan/` cannot serve that path. Fix is a second
repo named exactly `sandylatte.github.io` holding `.nojekyll` and
`.well-known/assetlinks.json` — the `.nojekyll` is not optional, Jekyll drops
dot-directories and the file will 404 while committed. See
[twa/README.md](twa/README.md).

**`privacy.html` has a blank contact line.** Left deliberately rather than
filling in an address nobody agreed to publish. Play needs the URL before a
listing goes live.

## Open questions, for the owner

**Should sync ship at all?** It was built because it was asked for, but the
honest position from the design doc still stands: local-only is a *stronger*
privacy guarantee than end-to-end encryption, because E2E asks users to trust
that the operator will not ship a malicious client build, and local-only asks
them to trust nothing. Running a server also means holding other people's
financial metadata, a privacy policy that covers it, GDPR obligations, and a
deletion path. None of that exists yet.

**If it ships, where does it run, and who pays?** There is no hosting, no
domain, no TLS, and no backup of the blob table — losing that table loses every
user's ledger, encrypted or not.

**The Sync tile's UI direction was never chosen.** Three were offered; the
dialog was built because they share most of their code and only the
recovery-code presentation differs (~40 lines). Swapping it is small.

**The Settings tile transition** was reworked once and not re-judged on real
hardware. Same for the type ramp. Both were verified at 375×812 in a pane that
cannot render animation.

## Things that are not mine to do

Recorded so the next session does not quietly cross them.

- Store packaging, developer accounts, signing keys, payments. These belong to
  the owner and must not pass through a machine they do not control.
- The C2 logo mark is not to be redrawn. Icons may be rescaled — that is how the
  maskable variants were made — but the three bars stay as they are.
- `FINANCIAL PLANNER (DRAFT).xlsx` is real personal financial data. `.gitignore`
  blocks `*PLANNER*.xlsx` and `planner-fixture.xlsx`; git history was audited
  before the repo was made public. Keep it that way.
- `server/*.db` is gitignored. It would hold other people's ciphertext and live
  session tokens and is never a repo artifact.
