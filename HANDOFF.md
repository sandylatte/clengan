# Handoff

Written 5 October 2026, at commit `d480882`. Everything described here is
pushed and live at https://sandylatte.github.io/clengan/ (`clengan-v113`).

Read [README.md](README.md) for how to run it, [DESIGN.md](DESIGN.md) for the
design system (it is machine-checked — see the traps below), and
[ARCHITECTURE-SYNC.md](ARCHITECTURE-SYNC.md) for the encrypted-sync design,
which is the largest thing in the repo and the least finished.

## Where the project actually is

Clengan is a local-first PWA money tracker, in rupiah. It works, it is
deployed, it is installable, and it is in daily use by two people. The last two
sessions were driven by what they hit using it, not by a roadmap.

**Encrypted sync is built and hidden.** Five of six build steps are done:
schema v8, `vault.js`, `server/`, `sync.js`, and a Sync tile. The tile now
carries `hidden` in `index.html` (`516e8ef`), because there is no hosted server
and a feature that does nothing is worse than no feature. All the code is
still there; removing the attribute brings the tile back. With it hidden,
`privacy.html` ("no account, no server") is true again.

**The Play Store is parked by the owner.** "Skip Google Play for now." The
domain-root asset-links file it needs now exists (see below) but still holds
placeholders. Nothing else moved.

**The planner import is now layout-independent.** It was the thing that kept
breaking, because the workbook it reads is edited by hand. See the planner
section below before touching `planner.js`.

## What shipped since the last handoff

| Commit | |
| --- | --- |
| `516e8ef` | Sync tile hidden until there is a server |
| `c771c92` | "Backup" tile renamed **Import & export** — the import button was unfindable |
| `6754e21` | Planner import finds tables wherever they sit (see below) |
| `680afd6` `a50c1be` | Date picker stays open when paging months |
| `fbb8c5e` | Per-month budget: a percent split or rupiah caps, for one month only |
| `ecff77b` | `navigator.storage.persist()` on launch; backup reminder card on Add |
| `5f6b236` | Planner amounts read as rupiah (`10.000` is ten thousand); Indonesian headings and month names |
| `7fabf67` | Add form keeps its date after a save; Spending by category moved to second on Summary; **Remove sample data**; account delete fixed |
| `d480882` | Auto-reload onto a new version as soon as it takes over |

`680afd6`–`ecff77b` came from a separate cloud session on 1 October. They were
pulled in and audited, not written here.

Outside this repo: **`sandylatte/sandylatte.github.io`** was created (`b2d4ad5`)
to serve `https://sandylatte.github.io/.well-known/assetlinks.json` from the
domain root, with `.nojekyll`. It returns 200 `application/json`. The file is
the template from `twa/` with `package_name` and the fingerprint still
`REPLACE_WITH_…`; PWABuilder produces the finished file when the owner makes
the signing key, and it replaces this one wholesale.

## The planner import

`planner.js` reads a hand-kept "FINANCIAL PLANNER" workbook. The old parser
required headings exactly `Date, Category, Amount, Note` side by side and tabs
named like `2026_SEPT`; any rearranging broke it. Now:

- **A table is any heading row** naming a category-like column and an
  amount-like one (`ROLE_WORDS`, English and Indonesian, matched on the
  heading's first or last word). Date, Note, a description and a Type column
  are optional. Unrecognised headings (`Percent`, `Paid?`) sit inside a table
  without breaking it. A blank heading cell or a repeated role splits two
  tables side by side; a heading row containing a number is never a heading.
- **Bucket** comes from the nearest heading above a table within its columns
  (`Fixed`/`Tetap`, `Flexible`/`Variable`), or a per-row Type column. When no
  table in a sheet has a label, the old positional rule stands: first fixed,
  second flexible.
- **Skipped on purpose:** tables under a `Savings`/`Tabungan` heading, `Total`
  lines, and the dashboard's own **per-category summary** — an undated table
  whose categories all appear in the dated ones. The old parser missed that
  summary by accident; the new one would have imported it and **counted every
  expense twice** until it was taught to recognise it.
- **Month** comes from the tab name in any spelling, else a title cell in the
  top six rows, else the most common month in the rows' own dates (and then
  nothing is refiled). A tab naming a month without a year borrows the year
  most other tabs name.
- **Cells are read as values** (`raw: true` in `xlsx-io.js`), not display text.
  A `#,##0` format would otherwise round 10.50 to "11", and `d-mmm` would drop
  the year. Dates therefore usually arrive as Excel serials.
- **Amounts are rupiah.** A run of three-digit groups is thousands whichever
  mark separates them; with both present, the last mark is the decimal point.

**The regression check that matters:** the real workbook must import exactly as
the old parser did. Run the old parser (`git show ad33900:planner.js`, fed
display text) and the new one (fed raw values) over
`~/Downloads/FINANCIAL PLANNER (DRAFT).xlsx` and compare rows, categories and
problems. As of `5f6b236` they are identical: 14 rows across 2026-09 and
2026-10, 4 categories, 4 refile notes. The workbook stays out of git.

The partner's **revised** workbook — the one that prompted all this — was never
received. The parser has only been proven on the old file and on synthetic
layouts in `test/planner.test.js`.

## Traps. Read these before touching anything

These have each cost real debugging time. They are not hypothetical.

**`DB_NAME` is `'moneytrack'` and must never change.** The app was renamed to
Clengan; the database was not. That string is the key to every transaction on
every device that has ever installed this. Renaming it does not migrate
anything — the ledger is simply no longer found. Same for the
`moneytrack-theme` localStorage key.

**Bump `CACHE` in `sw.js` on any change to a file in `SHELL`.** Still true with
auto-reload. The worker is cache-first and only evicts caches whose name
differs; auto-reload only fires when a *new* worker takes over, and a worker is
only new if `sw.js` changed. Skip the bump and nothing reloads, ever.

**Auto-reload (`d480882`) only helps from v113 on.** Any device still on v112
or older runs code without it and needs one manual **Settings → App version →
Fetch the latest version**. When someone says a fix "isn't there", ask for the
version on that tile before debugging — twice this cycle a reported bug (the
date picker, the per-month budget) was already fixed and the device was simply
a version behind.

**Unregister the service worker before every check during development.** A
`CACHE` bump alone is not enough. The worker re-registers on reload and will
serve you the shell from before your edit, and the suite will pass against code
that is no longer on disk. `test.html` imports `db.js` through the worker, so a
stale cache makes new db functions look missing. When a result surprises you,
check the schema version or the file bytes directly rather than trusting the
score.

**GitHub Pages needs the repo public.** On 1 October `clengan` was switched to
private and the site went 404 for four days, because Pages on a private repo
needs a paid plan. It was made public again on 5 October, after auditing the
new commits for personal data, and Pages was re-enabled by API (it does not
come back on by itself). Changing visibility is the owner's call; if it goes
private again, the site goes down with it.

**Accounts are keyed by `id`, not name, since v8.** Anything that deletes or
looks up an account by name must resolve it first (`findAccount`,
`db.deleteAccount`). The Settings delete passed the name straight to
`store.delete` and silently did nothing from v8 until `7fabf67`.

**`node --test test/` silently runs nothing useful.** It reports 1 test, 1 fail.
Use bare `node --test` from the repo root.

**`DESIGN.md` is machine-checked.** `test/tokens.test.js` asserts every
`font-size` in `styles.css` appears in the DESIGN.md ramp. A new size fails the
suite until the doc moves with it. This is a feature; do not add an exception.

**The agent browser pane: what works and what does not.** Page loads from
`localhost:8124` work, and so do `test.html` and driving the app with
`javascript_tool` — this session's checks of the calendar, saving, sample
removal, account delete and auto-reload were all run there. What fails is a
page's `fetch` **GET** to a *different* local port (POST gets through), so the
sync pull path still cannot be verified there; `server/test_integration.mjs`
covers it from node. Screenshots come back black (the pane runs hidden), so
check state with `javascript_tool` or `read_page`, never by looking.

**Testing auto-reload** needs a version that actually changes. Load the app
(controlled), change `CACHE` on disk to a throwaway name, call
`registration.update()` from the page, and check the page navigated and the
App version tile names the throwaway. Put `CACHE` back before committing.

**Never point `test.html` at the real database.** It uses `moneytrack-test`.
`migration-test.html` uses its own throwaway name and deletes it afterwards.

**Git identity is not set globally on this machine.** `clengan` and
`sandylatte.github.io` each have it in their local config. A new repo will
refuse to commit until it is set there too.

## Running and testing

```bash
python3 serve.py 8124              # dev server, sends no-store
node --test                        # 325 pure-logic tests
python3 server/test_server.py      # 34 HTTP tests for the sync backend
node server/test_integration.mjs   # 14 end-to-end, spawns the server itself
```

Two suites need a browser, and both need the service worker unregistered first:

```
http://localhost:8124/test.html            # 30, the IndexedDB layer
http://localhost:8124/migration-test.html  # 17, the v7 → v8 migration
```

Run this cycle: `node --test` (325/325) and `test.html` (30/30). The two server
suites and `migration-test.html` were not touched and not re-run.

`python3 server/app.py` runs the sync backend. Stdlib only — no pip, no venv.

## What is not done

**Test the planner import on the revised workbook.** It is the only real test
of `6754e21`. Ask for the file, put it in `~/Downloads`, and run it through
`importPlanner` from node before anyone imports it on a phone — the import
dialog lists every adjusted row before anything is written, but a wrongly
detected table would still import cleanly.

**Every device needs one manual update to v113.** See the auto-reload trap.

**Per-category monthly limits** ("Food: Rp 2.000.000 in October") were offered
and not asked for yet. The per-month budget from `fbb8c5e` covers fixed /
flexible / savings only.

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

**Play Store, when the owner resumes it.** Run PWABuilder against
`https://sandylatte.github.io/clengan/`, keep and back up the signing key, and
replace `.well-known/assetlinks.json` in `sandylatte.github.io` with the file
PWABuilder produces. `privacy.html` still has a blank contact line, left
deliberately rather than filling in an address nobody agreed to publish. See
[twa/README.md](twa/README.md).

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

**Public or private repo?** Public is what keeps the site up for free. If the
private switch on 1 October was deliberate, the alternatives are GitHub Pro or
hosting elsewhere.

**The Sync tile's UI direction was never chosen.** Moot while it is hidden.
Three were offered; only the recovery-code presentation differs (~40 lines).

**The Settings tile transition** was reworked once and not re-judged on real
hardware. Same for the type ramp. Both were verified at 375×812 in a pane that
cannot render animation.

## Things that are not mine to do

Recorded so the next session does not quietly cross them.

- Store packaging, developer accounts, signing keys, payments. These belong to
  the owner and must not pass through a machine they do not control.
- Repository visibility. It was changed on 5 October only on the owner's
  explicit instruction, after an audit of everything committed since the last
  one.
- The C2 logo mark is not to be redrawn. Icons may be rescaled — that is how the
  maskable variants were made — but the three bars stay as they are.
- `FINANCIAL PLANNER (DRAFT).xlsx` is real personal financial data. `.gitignore`
  blocks `*PLANNER*.xlsx` and `planner-fixture.xlsx`. History was audited before
  the repo was first made public and again before it was made public on
  5 October; nothing but code and tests has ever been committed. Keep it that
  way — the planner tests use invented figures, and so should any new ones.
- `server/*.db` is gitignored. It would hold other people's ciphertext and live
  session tokens and is never a repo artifact.
