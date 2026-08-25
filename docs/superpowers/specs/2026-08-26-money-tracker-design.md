# Money Tracker — Design

Date: 2026-08-26
Status: approved for prototype

## Purpose

Track personal money manually on a phone: income, spending, savings, and
account balances. Data stays on the device. Excel export/import is the backup
and the escape hatch.

## Scope

In scope:

- Manual entry of income, expenses, and transfers between accounts
- Multiple accounts with opening balances
- Categories
- Monthly summary: income, spend, net, per-category breakdown, account balances
- Excel (.xlsx) export and import

Out of scope for the prototype:

- Bank connections or automatic import
- Multi-device sync, accounts, login, any server
- Multi-currency
- Recurring transactions
- Attachments and receipt photos
- Split transactions (the schema leaves room; the UI does not expose it)

## Platform

Installable PWA. One codebase runs on Android and iOS through the browser's
"Add to Home Screen". No app stores, no Apple developer account, no Mac, no
build step, no npm.

Accepted trade-offs: no store listing, no useful iOS push notifications. The
app is a form, a list, sums, and an export button — none of that needs native
code. The data model ports unchanged to React Native later if store presence
becomes worth the cost.

## Data model

One table, `transactions`. One row per account-side of a movement.

| field | type | notes |
| --- | --- | --- |
| `id` | uuid string | stable across export/import, so re-import cannot duplicate |
| `date` | `YYYY-MM-DD` string | sorts lexically, no timezone handling |
| `account` | string | account name |
| `amount` | integer | **signed minor units (cents)**. Positive into the account, negative out |
| `category` | string | |
| `transfer_id` | uuid string or null | id of the paired row when this is a transfer |
| `note` | string | |

Second store, `accounts`: `name` and `opening_balance` (integer cents).

Categories have no store. The category list offered in the UI is the distinct
set of `category` values already present in `transactions`, plus a seed list on
first run. Renaming a category rewrites the matching rows; removing one is
just ceasing to use it.

### Why signed integer cents

Floats lose money. `0.1 + 0.2 !== 0.3`, and the error compounds across a
year of rows. All arithmetic is on integers; conversion to decimal happens
only at display and at Excel export.

Signed amounts, rather than a positive amount plus a credit/debit flag, keep
every balance a single sum with no branching.

### Why no `type` column

Transaction type is derived, never stored:

- `transfer_id` is set → transfer
- else `amount > 0` → income
- else → expense

A stored type can contradict the amount's sign. A derived one cannot.

### Why transfers are two rows

A transfer moves money between two accounts, so it names two accounts. A
single row with one `account` field cannot represent it — the earlier
single-row draft silently left savings balances unchanged. A single row with
`account` plus `to_account` can represent it, but then every balance query
branches over two columns.

Two linked rows keeps the invariants simple:

- Balance of any account: `opening_balance + SUM(amount) WHERE account = X`
- Net worth: sum of all account balances
- Income for a month: `SUM(amount)` where `amount > 0`, `transfer_id IS NULL`
- Spending for a month: `SUM(amount)` where `amount < 0`, `transfer_id IS NULL`

Transfers drop out of income and spending by a null check rather than by
convention, so moving $200 into savings is never miscounted as either.

This matches what Actual Budget does (signed amounts, one row per
account-side, halves linked by `transfer_id`) and what every double-entry
tool converges on.

Cost, accepted: writing a transfer writes both rows in one transaction, and
deleting or editing either side must apply to its partner. Roughly fifteen
lines of code, enforced in one place in `db.js`.

## Storage

IndexedDB, opened in `db.js`. Object store `transactions` keyed by `id`, with
indexes on `date` and `account`. Object store `accounts` keyed by `name`. No
ORM, no wrapper library.

All writes go through `db.js`. Nothing else touches IndexedDB directly, so the
transfer-pair invariant has exactly one place it can be violated.

## Screens

One HTML file, four views toggled by a tab bar. No router library.

**Add** (default view) — date (defaults to today), account, amount, category,
note. A transfer toggle reveals a second account field and writes the linked
pair. Account and category inputs remember previous values.

**List** — month picker, optional filter by account and category. Rows show
date, category, account, amount. Tap to edit or delete. Deleting a transfer
side deletes both.

**Summary** — for the selected month: income, spending, net. Per-category
breakdown. Current balance per account plus the total.

**Settings** — Excel export and import. Add, rename, and remove accounts and
categories. Set opening balances.

## Excel export and import

SheetJS, vendored into the repo. A CDN reference would break the app offline,
which defeats the point of a local-first tracker.

**Export** — one sheet, one row per transaction, columns matching the schema.
Amounts written as decimal so the file is editable by hand.

**Import** — reads the same columns and converts decimals back to integer
cents. Rows are matched on `id`: a known id updates that row, an unknown id
inserts. Import is therefore idempotent — importing the same file twice
produces the same database — and the export doubles as a full backup and
restore.

Transfer pairs survive a round-trip because both rows carry their own `id` and
each other's `transfer_id`.

## Files

```
index.html      markup and the four views
app.js          UI wiring and rendering
db.js           IndexedDB access; sole owner of the transfer-pair invariant
xlsx-io.js      Excel export and import
sw.js           service worker, caches the shell for offline use
manifest.json   PWA manifest: name, icons, standalone display
vendor/xlsx.full.min.js
test.html       assertion-based self-check
```

No build step. No package manager. Opening `index.html` runs the app.

## Testing

`test.html` runs assertions in the browser and prints pass or fail. It covers
the paths where a bug costs real money:

- Decimal-to-cents and cents-to-decimal conversion, including rounding at the
  half-cent boundary
- Writing a transfer creates both rows, each pointing at the other
- Deleting either side of a transfer deletes both
- Monthly income and spending sums exclude transfers
- Account balance equals opening balance plus the sum of its rows
- Excel round-trip preserves amounts exactly and does not duplicate rows

The UI is verified by using it. The arithmetic is verified by assertions.

## Open questions

None blocking the prototype.
