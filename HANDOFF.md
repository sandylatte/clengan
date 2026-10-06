# Handoff

Written 6 October 2026. Everything described here is committed on `master`
(`clengan-v125`). v124 is pushed and live; v125 is not pushed yet. Check the
live `sw.js` and the App version tile on a phone before telling anyone a
change is on their device.

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

**Amounts are private by default (`6a53303`, `0c6284e`).** Every figure shows
as `Rp •••••` until the eye in a title bar is tapped, and hides again on every
launch and whenever the app leaves the screen. See the privacy section below
before adding anything that displays money.

**v117–v120 (this session) were one round of owner feedback**, in three
commit groups: polish and motion, sample data plus a Summary redesign chosen
from rendered options, and List filters, finer hide toggles and a PIN. See
"v117–v120" below. **v121–v122** followed: every button now has a style
(primary buttons had silently lost their font and corners), and DESIGN.md's
radius scale and component sizes were brought back in line with
`styles.css`. See "v121–v122".

**The UI was reworked in `bb4fa4f`.** Settings is a rail of pages, every
dropdown is the app's own, the List spans months, and the Summary leads with
its chart. The layout was chosen by the owner from three rendered options; it
is recorded in DESIGN.md (`settings-rail`, `select`, `date-field`). See the UI
section below before adding a setting or a dropdown.

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
| `26c8005` | Handoff updated |
| `bb4fa4f` | Settings rail with search; own dropdowns and month picker; List Month / Year / All; Done key; chart first on Summary; month plans listed in Settings |
| `d000f37` | Handoff updated for v114 |
| `6a53303` | **Privacy:** every amount masked by default behind an eye in each title bar (v115) |
| `0c6284e` | Title bars show this month's net; Balance back on top of Summary; spending chart is a ring with percentages; filters as pills; muted mask dots; closed-eye icon (v116) |

| `1682991` | Kind radio dots hidden; every tab slides the same way (Settings' extra fades removed); budget chips aligned; popovers and month changes animate (v117) |
| `2acde75` | Sample data: six varied months, four accounts, 236 rows (v118) |
| `8f5a3b6` | One-hue spending ring with an Other slice; answer-first budget card (v119) |
| `992eff2` | List category / account filters; List net follows what is listed; per-section eyes; optional PIN (v120) |
| `b6fcac2` | `button.secondary` and `button.ghost`; primary buttons get Fira Sans and rounded corners back (v121) |
| `f1192e3` `15907de` | DESIGN.md radius scale matches the stylesheet, plus `pill`; the List's tag rail uses `--radius-xs` (v122) |
| `e752ed6` `e4988f8` | DESIGN.md field heights (40 / 60px), tab items (48px) and tab bar clearance match the stylesheet (docs only) |
| `4faaf71` | Savings by fund redesigned: one bar for the split, then a this-period / this-year table (owner picked option B of 3) (v123) |
| `8f44f04` | Settings rail marks the open page quietly (no box); calendar month and year jump straight to a month or year grid (v124) |
| `7ed2631` | Three more category colours, Azure, Mauve, Slate, chosen by measured distance; a test keeps every pair apart (v125) |
| (this commit) | App version shows the release date and what's new, from `changelog.js` (v125) |

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
`~/Documents/docs/keuangan/FINANCIAL PLANNER (DRAFT).xlsx` and compare rows, categories and
problems. As of `5f6b236` they are identical: 14 rows across 2026-09 and
2026-10, 4 categories, 4 refile notes. The workbook stays out of git.

The partner's **revised** workbook — the one that prompted all this — was never
received. The parser has only been proven on the old file and on synthetic
layouts in `test/planner.test.js`.

## Privacy masking (v115–v116)

**Every displayed amount goes through `formatIDR` / `formatAmount` in
`app.js`, which are wrappers.** The real formatters are imported as
`plainIDR` / `plainAmount` from `money.js`. The wrappers format the real value
first (so a corrupt amount still throws exactly as before), then return
`Rp •••••` unless `state.reveal` is true. A row keeps its `+`/`-`; a balance
does not. **Anything new that displays money must use the wrappers**, or it
leaks while hidden. `plainIDR` is used only where the user is typing the
figure: the month-plan dialog's live line and the account-clash dialog.

- `state.reveal` starts `false`, is **never persisted**, and is reset to false
  on `visibilitychange` → hidden. Toggling calls `refresh()` to re-render.
- One `.privacy-toggle` button per `<h1>` (four), all painted together by
  `paintPrivacy()`. Icons are `#i-eye` (showing) and `#i-eye-closed` (hidden).
- **Muted dots** come from `dimMasks()` plus a `MutationObserver` on `body`:
  any text node containing the mask is split and the dots wrapped in
  `span.mask`. Inside an SVG it must be a `tspan` — an HTML span is not drawn
  there, which made the donut's masked total read as a bare "Rp".
- **Not masked, on purpose:** inputs (the edit dialog shows the real amount),
  pie slice sizes and percentages, budget bar lengths, category names. It hides
  figures from someone glancing at the screen; it is not an app lock.
- Exports and backups are unaffected.

Verified in headless Chromium: a full DOM walk (text, `aria-label`, `title`,
input values) finds no digit groups while hidden, on all four views.

## v117–v120

**Motion.** All four views take the same `view-in` slide and nothing else on
arrival. `compose()` in `app.js` restarts `is-entering`; it runs on arrival
and on a month or period change (never on a save). A Settings page picked
from the rail gets `is-opening` for one `page-in`, set only by a pick and
removed on `animationend`/`animationcancel` — **never key an animation on
`.setting:not([hidden])`**: that replays whenever the Settings view itself
appears and stacks inside the view slide, which was the reported glitch.

**Spending ring** (owner picked option 2 of 3): one hue from
`--color-active`, top four categories plus one grey Other (`chartSlices` in
`rollup.js`). Category colours no longer appear on the ring. Slices are
dashes on one stroked circle (`pathLength="100"`), parted by gaps, no
outlines, no on-ring percentages. The legend lost its background bars and
`--color-bar` is gone from both tones.

**Budget card** (owner picked option C of 3): `.dials`, one row per bucket,
a dial for used and the left/over amount as the big figure. In the peach
tone the normal dial (`--color-active`) and the over dial
(`--color-destructive`) are close in colour; the red figure and "over" carry
the difference there.

**Sample data** is six months ending on the month in view (like before, the
current month's rows run to the 28th, so some are future-dated), seeded so
each month is deterministic, with a fourth account, Bank Jago.

**List.** Category and account filters (`filterRows` in `rollup.js`) narrow
the period or the search. The title-bar net is now `rowsNet` of exactly what
is listed — this reverses the v116 decision below, at the owner's request.
The Add title bar still shows the calendar month's net.

**Finer hide toggles.** `state.reveal` is the master (every title bar's eye).
`state.sections` holds one override per section (`list`, `balance`,
`spending`, `budget`, `funds`, `balances`), `null` meaning "follow the
master"; tapping the master resets them all. Rendering wraps each section in
`inScope(scope, paint)` and `formatIDR` / `formatAmount` read the ambient
scope, so **a new figure inside a section must be formatted inside that
section's `inScope`**, or it follows the master instead of its section's eye.

**PIN** (`pin.js`, tested). Optional, four digits, PBKDF2 hash plus salt in
**localStorage** (`clengan-pin`), lockout state in `clengan-pin-lock` (five
free tries, then 30 s doubling to 30 min). Deliberately not in the settings
store, so sync would never upload it and backups never carry it. Frequency:
every reveal (default), once until the app is left, or at most every X
minutes (1–240). "Forgot the PIN?" removes it after an hour; the right PIN or
"Keep the PIN" cancels. It is a privacy screen: exports still carry every
figure.

Verified in the agent pane at 375×812: a DOM walk with everything hidden
finds no digit groups on any view; every PIN path (set, mismatch, wrong
tries, lockout refusing the right PIN, expiry, each frequency, change,
forgot, keep, remove) was driven through the real dialogs. **Screenshots
work in the pane now, but not of an open `<dialog>`** (top layer), so dialog
layout was checked by measurement only.

## v121–v122

**Buttons.** A `<button>` with no class renders as the browser's grey box,
and five did: Remove sample data, Copy diagnostics, Sync's Create account
and Sign out, and the in-row `.ghost` actions (Edit on a month plan, Delete
on a recurring rule), which had a class but no rule. Now there are two
styles: `button.secondary`, the second action on a page (primary's size and
shape, the dialogs' Cancel look), and `button.ghost`, a word inside a list
row. **Every button takes one of primary, secondary, ghost, chip or a
component class.** In the pane, a filter on `getComputedStyle(b).borderStyle
=== 'outset'` over every button finds any that slipped through; it found
none after the fix.

**Primary buttons had no font or radius since `ee3094e` (6 Sep).** That
commit split `button.primary` out of `input, select, button.primary` to keep
44px when fields went to 40px, and dropped `font: inherit` and the radius
with it, so every primary button ("Save", "Load sample data") rendered in
Arial 13.3px with square corners for a month. v121 restores DESIGN.md's
spec: Fira Sans 13px, weight 600, `--radius-md`. If a primary button ever
looks wrong again, check that rule first — buttons inherit neither font nor
radius.

**DESIGN.md now matches the stylesheet** where it had drifted: the rounded
scale is xs 3 / sm 8 / md 12 / lg 16 / xl 20 / pill 999px (it said
2 / 6 / 8 / 12); text and amount fields are `rounded.sm`, 40px and 60px (it
said md, 44 and 64); the amount field is Fira Sans 300 with
`inputmode="numeric"`; tab items are 48px (it said 56); `body` clears the
tab bar with `calc(58px + env(safe-area-inset-bottom))` (it said 88px).
The impeccable design hook checks literal radii against that scale, which
is why `pill` was added rather than waived.

## The UI as of v116

**Title bars** (List changed in v120, see above). Add and List show **this calendar month's net** (income minus
spending since the 1st, transfers excluded), labelled with the month: `Oct
+Rp …`. `renderHeadNet()` writes both. It is always the *calendar* month, never
the month a picker is on. This replaced the all-time balance on Add and the
listed-rows total on List — **the List no longer shows a total for a search or
a year**; the owner was told and has not asked for it back.

**Summary order:** Balance, Net, Income / Spent first, then Spending by
category, Budget, Funds, trend, Balances. The Net label is `netLabel()`: "Net
this month", "Net in Sep 2026", "Net this year", "Net in 2025".

**Spending chart** is a ring (`R = 46`, `HOLE = 28`): the hole shows "Spent in
Oct" and the total in compact Indonesian form (`compactIDR`, "Rp 6,9 jt")
because the exact figure overflows the hole. Slices of 7% or more carry their
percent with a halo (`paint-order: stroke`); the legend rows carry a share
column (`sharePercent`, "<1%" for slivers). SVG `font-size` is set as an
attribute in viewBox units, deliberately not in `styles.css`, so it stays out
of the type ramp check. The filters are `.filters--compact` pills with
visually-hidden labels; the old "Rp X across 2026-10." scope line is gone.

**`state.month` starts from local time** (`toISO(new Date())`). It used
`toISOString()`, which is UTC and opened the previous month in Jakarta until
07:00 on the 1st.

## The UI as of v114

**Settings** (`settings.js`). Each section is a `<section class="setting"
data-short="…">` with a `.setting__head` holding its icon, `<h2>` and state
line. The rail on the right is built from those sections at load, so **adding a
setting is adding a section** — nothing else to register. `data-short` is the
one-word rail label on a phone; the `<h2>` is the label from 640px. A section
marked `setting--off` (Sync) is left out of the rail. Only one section is
visible at a time (`hidden` on the rest); the last one opened is kept in
`localStorage` under `clengan-setting`. The search reads each section's
`textContent` plus placeholders, `aria-label`s and its `data-short`, dims rail
items that do not match (never removes them), opens the first match, and
outlines the smallest matching elements on the page with `.is-hit`.

**Dropdowns** (`picker.js`). `enhanceAllSelects()` wraps every `<select>` in
`.pick` and draws a button and a list over it, and a MutationObserver does the
same for any select added later (the edit dialog builds three). **The real
`<select>` stays and is the source of truth**: keep reading `.value`, keep
listening for `change`, keep rebuilding `<option>`s — the button follows. Its
`value`/`selectedIndex` setters are patched per element so a programmatic set
updates the button; form `reset`, option changes and `disabled`/`hidden` are
observed. It is invisible but not `display:none`, so a `required` select still
blocks a submit and shows its bubble. A list with no room below opens upward
(`is-up`).

**Month fields** are `attachMonthPicker()` in `picker.js`: a button, a hidden
`<input>` holding `YYYY-MM` that fires `change`, and a `.calendar` popup with
twelve months. `list-month` and `summary-month` share `state.month` and are
kept in step through `monthPickers`; `plan-month` opens the month-plan editor.

**List range** is `state.listPeriod` (`month` / `year` / `all`), separate from
the Summary's `state.filter.period`. The two segmented controls are scoped by
`#list-period` and `#summary-period`; a bare `.seg__button` selector would
bind both.

**Month plans** are edited by one function, `editMonthPlan(month)`, from the
Summary's Budget card and from Settings → Budget split, which lists every
month in `month-budgets`. The Summary's **Default split** chip calls
`settingsNav.select('split')`.

**The Done key.** `app.js` gives every text-like `<input>` `enterkeyhint="done"`
(at load and on focus, so dialog fields get it too). On a coarse pointer, Enter
in such a field blurs it and does nothing else; a handler that already called
`preventDefault` (the prompt dialog's own field) wins. Enter on a desktop
still submits.

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
only new if `sw.js` changed. Skip the bump and nothing reloads, ever. **And
add the new version to the top of `changelog.js`** (date and plain-language
notes): Settings → App version shows it, and `test/changelog.test.js` fails
until it is there.

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

**`node --check app.js` passes code the browser rejects.** It exited 0 on an
`app.js` with two `const total` in one function, which would have stopped
the whole app loading. Parse it as the module it is instead:
`node --experimental-vm-modules -e "new (require('vm').SourceTextModule)(require('fs').readFileSync('app.js','utf8'))"`
throws on that. Loading the page and reading the console is the real check.

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

**A new script file must go in `SHELL`.** `test/` has a check that every file
the page loads is listed; it caught `picker.js` missing. Without it the app
breaks offline.

**`test.html` refuses to run while a service worker controls it.** It reports
"Not run" rather than a score. Unregister first (or Settings → App version →
Fetch the latest version), then reload it.

**Testing auto-reload** needs a version that actually changes. Load the app
(controlled), change `CACHE` on disk to a throwaway name, call
`registration.update()` from the page, and check the page navigated and the
App version tile names the throwaway. Put `CACHE` back before committing.

**Sync uploads the whole `settings` store.** That is right for `split` and
`month-budgets`, wrong for the device-local keys added since: `last-backup`
and `backup-snooze` (backup reminder). Exporting on one device would silence
the reminder on another. Harmless while sync is hidden; exclude them in
`sync.js` before sync ever ships.

**Never point `test.html` at the real database.** It uses `moneytrack-test`.
`migration-test.html` uses its own throwaway name and deletes it afterwards.

**Git identity is not set globally on this machine.** `clengan` and
`sandylatte.github.io` each have it in their local config. A new repo will
refuse to commit until it is set there too.

## Running and testing

```bash
python3 serve.py 8124              # dev server, sends no-store
node --test                        # 337 pure-logic tests
python3 server/test_server.py      # 34 HTTP tests for the sync backend
node server/test_integration.mjs   # 14 end-to-end, spawns the server itself
```

Two suites need a browser, and both need the service worker unregistered first:

```
http://localhost:8124/test.html            # 30, the IndexedDB layer
http://localhost:8124/migration-test.html  # 17, the v7 → v8 migration
```

Run this cycle (v117–v122): `node --test` at 337/337 after every commit
(12 tests added: `chartSlices`, `filterRows`, `rowsNet`, `pin.js`, sample
coverage), and `test.html` at 30/30 before the push. Before that,
v115–v116 added no tests (display-only) and re-ran `node --test` at 325/325. The two server
suites and `migration-test.html` were not touched and not re-run. The v114 UI
was checked in the agent pane at desktop width and at 375×812 with a touch
emulation: every Settings page fits its column with no horizontal scroll, the
rail fits without scrolling, dropdowns open inside the edit dialog unclipped,
and a simulated Enter on a touch screen closes the field without saving.

`python3 server/app.py` runs the sync backend. Stdlib only — no pip, no venv.

## What is not done

**Test the planner import on the revised workbook.** It is the only real test
of `6754e21`. Ask for the file, put it in `~/Downloads`, and run it through
`importPlanner` from node before anyone imports it on a phone — the import
dialog lists every adjusted row before anything is written, but a wrongly
detected table would still import cleanly.

**Every device needs one manual update to v113.** See the auto-reload trap.
From v113 on, v114 arrives by itself.

**Not yet seen on a real phone:** everything in v117–v122 (the slides on Add and
List, the new ring and budget card, the filters, the section eyes, the PIN
dialog and its number pad, and the restyled buttons — the Save button on Add
now looks different from what the owner is used to). Also the v114 Settings rail, the dropdowns, the
Done key, and everything in v115–v116 (the eye, masked dots, the ring chart,
the title-bar net). v115–v116 were checked only in headless Chromium at
375×812. The keyboard's return-key label comes from the platform; Android
Chrome and iOS Safari both honour `enterkeyhint`, but only a real device shows
what it actually says. Animations were only partly watched: the pane renders
screenshots now, but a frame caught mid-slide is all it shows of motion.

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
