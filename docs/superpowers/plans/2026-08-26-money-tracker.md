# Money Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-first installable PWA that manually tracks income, spending, transfers and account balances, with a monthly dashboard and Excel import/export.

**Architecture:** Plain ES modules loaded directly by the browser — no bundler, no package manager, no build step. All money arithmetic lives in pure modules (`money.js`, `rollup.js`) that run under Node's test runner. IndexedDB access is isolated in `db.js`, which is the only file permitted to write transactions and therefore the only place the transfer-pair invariant can be broken. The UI reads through `rollup.js` and writes through `db.js`.

**Tech Stack:** Vanilla ES modules, IndexedDB, plain CSS custom properties, vendored SheetJS for `.xlsx`, Node 22 built-in test runner (`node --test`) for pure logic, browser for integration.

## Global Constraints

- **No build step, no npm install, no bundler.** Opening `index.html` runs the app.
- **No runtime dependency fetched from a network at page load.** Every asset is vendored under `vendor/`. A CDN reference breaks offline use and is a defect.
- **Money is a signed integer of minor units (cents), always.** Floats never touch a monetary value. Conversion to decimal happens only at display and at Excel export.
- **No stored `type` column.** Transaction type is derived: `transfer_id` set → transfer; else `amount > 0` → income; else expense.
- **A transfer is two rows**, written in one IndexedDB transaction, each carrying the other's id in `transfer_id`.
- **All IndexedDB access goes through `db.js`.** No other file opens the database.
- **Colour tokens** (exact values): `--color-primary: #1E40AF`, `--color-accent: #059669`, `--color-destructive: #DC2626`, `--color-background: #0F172A`, `--color-foreground: #FFFFFF`, `--color-muted: #101A34`, `--color-border: rgba(255,255,255,0.08)`.
- **Spacing scale:** 8 / 12 / 16 / 24 / 32px.
- **Accessibility floor:** touch targets ≥ 44×44px; focus rings visible and never removed; every input has a real `<label>`, never placeholder-only; text contrast ≥ 4.5:1; `prefers-reduced-motion` respected; transitions 150–300ms.
- **Amounts render in a tabular-figure font** (Fira Code), UI in Fira Sans, both vendored WOFF2 with system fallbacks.
- **Icons are inline Lucide SVG.** Emoji as icons is a defect.
- **Commit after every task.**

**Deviation from the spec, deliberate:** the spec lists `db.js` as holding the logic. This plan splits the pure arithmetic into `money.js` and `rollup.js` so it can be tested with `node --test` in milliseconds instead of only in a browser. `db.js` keeps sole ownership of IndexedDB and of the transfer-pair invariant, exactly as specified.

---

### Task 1: Project skeleton and design tokens

**Files:**
- Create: `index.html`, `styles.css`, `manifest.json`, `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a page with four empty views and a tab bar; CSS custom properties `--color-*` and `--space-*` used by every later task; the `showView(name)` convention (each view is `<section class="view" id="view-add">` etc., shown by toggling the `hidden` attribute)

- [ ] **Step 1: Create `.gitignore`**

```
.DS_Store
*.log
```

- [ ] **Step 2: Create `manifest.json`**

```json
{
  "name": "MoneyTrack",
  "short_name": "MoneyTrack",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0F172A",
  "theme_color": "#0F172A",
  "icons": []
}
```

- [ ] **Step 3: Create `styles.css` with the tokens and base layout**

```css
:root {
  --color-primary: #1E40AF;
  --color-accent: #059669;
  --color-destructive: #DC2626;
  --color-background: #0F172A;
  --color-foreground: #FFFFFF;
  --color-muted: #101A34;
  --color-border: rgba(255, 255, 255, 0.08);

  --space-1: 8px;
  --space-2: 12px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;

  --font-ui: "Fira Sans", system-ui, -apple-system, sans-serif;
  --font-num: "Fira Code", ui-monospace, "SF Mono", Menlo, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 0 72px;
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-ui);
  font-size: 16px;
  line-height: 1.5;
}

.amount { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
.amount--in { color: var(--color-accent); }
.amount--out { color: var(--color-destructive); }

.view { padding: var(--space-3); }
.view[hidden] { display: none; }

.card {
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--color-muted);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.tabbar button {
  flex: 1;
  min-height: 44px;
  background: none;
  border: none;
  color: var(--color-foreground);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: background 150ms ease;
}

.tabbar button[aria-current="page"] {
  color: var(--color-primary);
  font-weight: 600;
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

label { display: block; margin-bottom: 4px; font-size: 14px; }

input, select, button.primary {
  width: 100%;
  min-height: 44px;
  padding: 0 var(--space-2);
  margin-bottom: var(--space-2);
  background: var(--color-background);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font: inherit;
}

button.primary {
  background: var(--color-primary);
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: filter 150ms ease;
}

button.primary:hover { filter: brightness(1.15); }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MoneyTrack</title>
<link rel="manifest" href="./manifest.json">
<link rel="stylesheet" href="./styles.css">
</head>
<body>

<section class="view" id="view-add"><h1>Add</h1></section>
<section class="view" id="view-list" hidden><h1>List</h1></section>
<section class="view" id="view-summary" hidden><h1>Summary</h1></section>
<section class="view" id="view-settings" hidden><h1>Settings</h1></section>

<nav class="tabbar">
  <button data-view="add" aria-current="page">Add</button>
  <button data-view="list">List</button>
  <button data-view="summary">Summary</button>
  <button data-view="settings">Settings</button>
</nav>

<script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `app.js` with view switching only**

```js
function showView(name) {
  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.id !== `view-${name}`;
  }
  for (const button of document.querySelectorAll('.tabbar button')) {
    if (button.dataset.view === name) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }
}

document.querySelector('.tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-view]');
  if (button) showView(button.dataset.view);
});
```

- [ ] **Step 6: Verify it loads**

Open `index.html` in a browser. Expected: dark page, "Add" heading, four tabs at the bottom. Clicking each tab swaps the heading. No console errors.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css app.js manifest.json .gitignore
git commit -m "feat: app shell, design tokens, tab navigation"
```

---

### Task 2: Money arithmetic (`money.js`)

Pure functions, no DOM, no database. This is where a bug costs real money, so it is tested first and hardest.

**Files:**
- Create: `money.js`, `test/money.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `toCents(value: string | number): number` — decimal to signed integer cents, rounding half away from zero
  - `fromCents(cents: number): string` — signed integer cents to a fixed two-decimal string, e.g. `-4500` → `"-45.00"`
  - `formatAmount(cents: number): string` — display string with sign and two decimals, e.g. `4500` → `"+45.00"`, `-4500` → `"-45.00"`, `0` → `"0.00"`

- [ ] **Step 1: Write the failing test**

Create `test/money.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, formatAmount } from '../money.js';

test('toCents converts plain decimals', () => {
  assert.equal(toCents('45.00'), 4500);
  assert.equal(toCents('45'), 4500);
  assert.equal(toCents('0.07'), 7);
  assert.equal(toCents(45.5), 4550);
});

test('toCents keeps the sign', () => {
  assert.equal(toCents('-45.00'), -4500);
  assert.equal(toCents(-0.01), -1);
});

test('toCents rounds half away from zero', () => {
  assert.equal(toCents('0.005'), 1);
  assert.equal(toCents('-0.005'), -1);
  assert.equal(toCents('1.005'), 101);
});

test('toCents survives float representation error', () => {
  // 0.1 + 0.2 === 0.30000000000000004
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('1.1'), 110);
  assert.equal(toCents('2.675'), 268);
});

test('toCents rejects values that are not numbers', () => {
  assert.throws(() => toCents('abc'));
  assert.throws(() => toCents(''));
  assert.throws(() => toCents(null));
  assert.throws(() => toCents(Infinity));
});

test('fromCents renders two decimals with sign', () => {
  assert.equal(fromCents(4500), '45.00');
  assert.equal(fromCents(-4500), '-45.00');
  assert.equal(fromCents(7), '0.07');
  assert.equal(fromCents(0), '0.00');
  assert.equal(fromCents(-7), '-0.07');
});

test('round trip preserves the value exactly', () => {
  for (const cents of [0, 1, -1, 7, -7, 4500, -4500, 123456789, -123456789]) {
    assert.equal(toCents(fromCents(cents)), cents);
  }
});

test('formatAmount marks positives with a plus', () => {
  assert.equal(formatAmount(4500), '+45.00');
  assert.equal(formatAmount(-4500), '-45.00');
  assert.equal(formatAmount(0), '0.00');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test`
Expected: FAIL — cannot find module `../money.js`.

- [ ] **Step 3: Write the implementation**

Create `money.js`:

```js
export function toCents(value) {
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new TypeError(`not a finite number: ${JSON.stringify(value)}`);
  }
  // Scale first, then round half away from zero. Math.round() rounds -0.5 to
  // -0 (toward positive infinity), which would make debits and credits round
  // in opposite directions.
  const scaled = number * 100;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded === 0 ? 0 : rounded;
}

export function fromCents(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`not an integer cent value: ${JSON.stringify(cents)}`);
  }
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

export function formatAmount(cents) {
  const text = fromCents(cents);
  return cents > 0 ? `+${text}` : text;
}
```

**Correction (verified 2026-08-26):** the reference implementation above is
WRONG and fails its own test suite — `1.005 * 100` is `100.49999999999999` in
float, so scale-then-round returns `100` where the spec requires `101`. The
shipped `money.js` parses plain-decimal strings at character level instead,
and routes exponential-notation strings (which the character parser cannot
read) through the float path behind a `/[eE]/` gate. Read the committed
`money.js` rather than the block above.

Original note on `toCents('2.675')`: the float nearest `2.675` is slightly below it, so scaling gives `267.49999...` and the result is `268` only if the rounding is applied after scaling. The assertion in the test pins this behaviour; if it fails, the fix is scaling before rounding, never a tolerance fudge.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add money.js test/money.test.js
git commit -m "feat: money arithmetic in integer cents"
```

---

### Task 3: Rollups (`rollup.js`)

Pure functions over an array of transaction objects. No database — the caller supplies the rows. This is what makes the dashboard testable without a browser.

**Files:**
- Create: `rollup.js`, `test/rollup.test.js`

**Interfaces:**
- Consumes: `money.js` is *not* needed here (rollups stay in cents)
- Produces, where `Txn = { id, date, account, amount, category, transfer_id, note }`:
  - `monthOf(date: string): string` — `"2026-08-26"` → `"2026-08"`
  - `filterMonth(txns: Txn[], month: string): Txn[]`
  - `monthlyTotals(txns: Txn[], month: string): { income: number, spending: number, net: number }` — `spending` is returned as a **negative** number; `net === income + spending`
  - `categoryBreakdown(txns: Txn[], month: string): Array<{ category: string, total: number }>` — spending only, `total` positive, sorted largest first
  - `accountBalances(txns: Txn[], accounts: Array<{name, opening_balance}>): Array<{ account: string, balance: number }>`
  - `netTrend(txns: Txn[], months: string[]): Array<{ month: string, net: number }>`

- [ ] **Step 1: Write the failing test**

Create `test/rollup.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOf, filterMonth, monthlyTotals, categoryBreakdown,
  accountBalances, netTrend,
} from '../rollup.js';

const txns = [
  { id: 'a', date: '2026-08-01', account: 'Bank', amount: 300000, category: 'Salary', transfer_id: null, note: '' },
  { id: 'b', date: '2026-08-03', account: 'Bank', amount: -4500, category: 'Food', transfer_id: null, note: '' },
  { id: 'c', date: '2026-08-04', account: 'Cash', amount: -1500, category: 'Food', transfer_id: null, note: '' },
  { id: 'd', date: '2026-08-05', account: 'Bank', amount: -9000, category: 'Rent', transfer_id: null, note: '' },
  // A transfer pair: Bank -> Savings, 200.00
  { id: 'e', date: '2026-08-06', account: 'Bank', amount: -20000, category: 'Transfer', transfer_id: 'f', note: '' },
  { id: 'f', date: '2026-08-06', account: 'Savings', amount: 20000, category: 'Transfer', transfer_id: 'e', note: '' },
  // Previous month, must not leak into August
  { id: 'g', date: '2026-07-20', account: 'Bank', amount: -5000, category: 'Food', transfer_id: null, note: '' },
];

test('monthOf slices the year-month', () => {
  assert.equal(monthOf('2026-08-26'), '2026-08');
  assert.equal(monthOf('2026-01-01'), '2026-01');
});

test('filterMonth excludes other months', () => {
  assert.deepEqual(filterMonth(txns, '2026-08').map((t) => t.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(filterMonth(txns, '2026-07').map((t) => t.id), ['g']);
});

test('monthlyTotals excludes both sides of a transfer', () => {
  const totals = monthlyTotals(txns, '2026-08');
  assert.equal(totals.income, 300000);
  assert.equal(totals.spending, -15000);
  assert.equal(totals.net, 285000);
});

test('monthlyTotals net always equals income plus spending', () => {
  const totals = monthlyTotals(txns, '2026-08');
  assert.equal(totals.net, totals.income + totals.spending);
});

test('monthlyTotals of an empty month is all zeroes', () => {
  assert.deepEqual(monthlyTotals(txns, '2026-09'), { income: 0, spending: 0, net: 0 });
});

test('categoryBreakdown returns positive totals, largest first, spending only', () => {
  assert.deepEqual(categoryBreakdown(txns, '2026-08'), [
    { category: 'Rent', total: 9000 },
    { category: 'Food', total: 6000 },
  ]);
});

test('accountBalances adds the opening balance', () => {
  const accounts = [
    { name: 'Bank', opening_balance: 100000 },
    { name: 'Cash', opening_balance: 5000 },
    { name: 'Savings', opening_balance: 0 },
  ];
  assert.deepEqual(accountBalances(txns, accounts), [
    { account: 'Bank', balance: 100000 + 300000 - 4500 - 9000 - 20000 - 5000 },
    { account: 'Cash', balance: 5000 - 1500 },
    { account: 'Savings', balance: 20000 },
  ]);
});

test('accountBalances includes an account with no transactions', () => {
  const result = accountBalances([], [{ name: 'Bank', opening_balance: 2500 }]);
  assert.deepEqual(result, [{ account: 'Bank', balance: 2500 }]);
});

test('netTrend returns one entry per requested month, zero-filled', () => {
  assert.deepEqual(netTrend(txns, ['2026-07', '2026-08', '2026-09']), [
    { month: '2026-07', net: -5000 },
    { month: '2026-08', net: 285000 },
    { month: '2026-09', net: 0 },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test`
Expected: FAIL — cannot find module `../rollup.js`. The `money.js` tests still pass.

- [ ] **Step 3: Write the implementation**

Create `rollup.js`:

```js
// A transfer moves money between the user's own accounts. It is neither
// income nor spending, and both of its rows must be excluded from every
// total, or moving 200.00 into savings would read as 200.00 of spending.
const isFlow = (txn) => txn.transfer_id === null || txn.transfer_id === undefined;

export function monthOf(date) {
  return date.slice(0, 7);
}

export function filterMonth(txns, month) {
  return txns.filter((txn) => monthOf(txn.date) === month);
}

export function monthlyTotals(txns, month) {
  let income = 0;
  let spending = 0;
  for (const txn of filterMonth(txns, month)) {
    if (!isFlow(txn)) continue;
    if (txn.amount > 0) income += txn.amount;
    else spending += txn.amount;
  }
  return { income, spending, net: income + spending };
}

export function categoryBreakdown(txns, month) {
  const totals = new Map();
  for (const txn of filterMonth(txns, month)) {
    if (!isFlow(txn) || txn.amount >= 0) continue;
    totals.set(txn.category, (totals.get(txn.category) ?? 0) - txn.amount);
  }
  return [...totals]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}

export function accountBalances(txns, accounts) {
  return accounts.map(({ name, opening_balance }) => {
    let balance = opening_balance;
    for (const txn of txns) {
      if (txn.account === name) balance += txn.amount;
    }
    return { account: name, balance };
  });
}

export function netTrend(txns, months) {
  return months.map((month) => ({ month, net: monthlyTotals(txns, month).net }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: PASS, all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add rollup.js test/rollup.test.js
git commit -m "feat: monthly totals, category breakdown, balances, trend"
```

---

### Task 4: Database layer (`db.js`)

Sole owner of IndexedDB and of the transfer-pair invariant.

**Files:**
- Create: `db.js`, `test.html`

**Interfaces:**
- Consumes: nothing
- Produces (all async):
  - `openDb(name = 'moneytrack'): Promise<IDBDatabase>`
  - `allTransactions(): Promise<Txn[]>`
  - `allAccounts(): Promise<Array<{name, opening_balance}>>`
  - `putAccount(name: string, openingBalance: number): Promise<void>`
  - `addFlow({date, account, amount, category, note}): Promise<string>` — one row, returns its id
  - `addTransfer({date, from, to, amount, note}): Promise<[string, string]>` — `amount` must be positive; writes both rows in one IndexedDB transaction; returns `[fromId, toId]`
  - `updateTransaction(txn: Txn): Promise<void>`
  - `deleteTransaction(id: string): Promise<void>` — deletes the partner too when `transfer_id` is set
  - `putTransactions(txns: Txn[]): Promise<void>` — bulk upsert keyed on `id`, used by import
  - `clearAll(): Promise<void>` — test support

- [ ] **Step 1: Write the failing test page**

Create `test.html`. It runs the browser-only assertions and prints results to the page. Each test opens a uniquely named database so runs cannot contaminate each other.

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>MoneyTrack tests</title>
<style>
body { font-family: system-ui, sans-serif; background: #0F172A; color: #fff; padding: 24px; }
li { margin-bottom: 6px; }
.pass::before { content: "PASS "; color: #059669; font-weight: 700; }
.fail::before { content: "FAIL "; color: #DC2626; font-weight: 700; }
pre { color: #DC2626; margin: 4px 0 0 24px; }
</style>
</head>
<body>
<h1>MoneyTrack tests</h1>
<p id="summary">running…</p>
<ul id="results"></ul>

<script type="module">
import * as db from './db.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const results = document.getElementById('results');

test('addFlow stores one row with a derived-expense sign', async () => {
  await db.clearAll();
  const id = await db.addFlow({ date: '2026-08-03', account: 'Bank', amount: -4500, category: 'Food', note: '' });
  const rows = await db.allTransactions();
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
  if (rows[0].id !== id) throw new Error('returned id does not match the stored row');
  if (rows[0].amount !== -4500) throw new Error(`amount changed: ${rows[0].amount}`);
  if (rows[0].transfer_id !== null) throw new Error('a flow must not have a transfer_id');
});

test('addTransfer writes two rows pointing at each other', async () => {
  await db.clearAll();
  const [fromId, toId] = await db.addTransfer({ date: '2026-08-06', from: 'Bank', to: 'Savings', amount: 20000, note: '' });
  const rows = await db.allTransactions();
  if (rows.length !== 2) throw new Error(`expected 2 rows, got ${rows.length}`);
  const from = rows.find((r) => r.id === fromId);
  const to = rows.find((r) => r.id === toId);
  if (from.amount !== -20000) throw new Error(`source must be negative, got ${from.amount}`);
  if (to.amount !== 20000) throw new Error(`destination must be positive, got ${to.amount}`);
  if (from.transfer_id !== toId || to.transfer_id !== fromId) throw new Error('rows do not point at each other');
});

test('addTransfer rejects a non-positive amount', async () => {
  await db.clearAll();
  let threw = false;
  try {
    await db.addTransfer({ date: '2026-08-06', from: 'Bank', to: 'Savings', amount: -1, note: '' });
  } catch { threw = true; }
  if (!threw) throw new Error('a negative transfer amount must be rejected');
});

test('addTransfer rejects a transfer to the same account', async () => {
  await db.clearAll();
  let threw = false;
  try {
    await db.addTransfer({ date: '2026-08-06', from: 'Bank', to: 'Bank', amount: 100, note: '' });
  } catch { threw = true; }
  if (!threw) throw new Error('a self-transfer must be rejected');
});

test('deleting one side of a transfer deletes both', async () => {
  await db.clearAll();
  const [fromId] = await db.addTransfer({ date: '2026-08-06', from: 'Bank', to: 'Savings', amount: 20000, note: '' });
  await db.deleteTransaction(fromId);
  const rows = await db.allTransactions();
  if (rows.length !== 0) throw new Error(`orphaned half left behind: ${rows.length} rows remain`);
});

test('deleting a flow leaves other rows untouched', async () => {
  await db.clearAll();
  const keep = await db.addFlow({ date: '2026-08-01', account: 'Bank', amount: 300000, category: 'Salary', note: '' });
  const drop = await db.addFlow({ date: '2026-08-03', account: 'Bank', amount: -4500, category: 'Food', note: '' });
  await db.deleteTransaction(drop);
  const rows = await db.allTransactions();
  if (rows.length !== 1 || rows[0].id !== keep) throw new Error('wrong row deleted');
});

test('putTransactions is idempotent on repeated import', async () => {
  await db.clearAll();
  const rows = [
    { id: 'x1', date: '2026-08-01', account: 'Bank', amount: 1000, category: 'Salary', transfer_id: null, note: '' },
    { id: 'x2', date: '2026-08-02', account: 'Bank', amount: -250, category: 'Food', transfer_id: null, note: '' },
  ];
  await db.putTransactions(rows);
  await db.putTransactions(rows);
  const stored = await db.allTransactions();
  if (stored.length !== 2) throw new Error(`re-import duplicated rows: ${stored.length}`);
});

test('putTransactions updates a row with a known id', async () => {
  await db.clearAll();
  await db.putTransactions([{ id: 'x1', date: '2026-08-01', account: 'Bank', amount: 1000, category: 'Salary', transfer_id: null, note: '' }]);
  await db.putTransactions([{ id: 'x1', date: '2026-08-01', account: 'Bank', amount: 9999, category: 'Salary', transfer_id: null, note: 'edited' }]);
  const stored = await db.allTransactions();
  if (stored.length !== 1) throw new Error('update inserted instead of replacing');
  if (stored[0].amount !== 9999) throw new Error('update did not take effect');
});

let passed = 0;
for (const { name, fn } of tests) {
  const item = document.createElement('li');
  try {
    await fn();
    item.className = 'pass';
    item.textContent = name;
    passed += 1;
  } catch (error) {
    item.className = 'fail';
    item.textContent = name;
    const detail = document.createElement('pre');
    detail.textContent = error.message;
    item.append(detail);
  }
  results.append(item);
}
document.getElementById('summary').textContent = `${passed} / ${tests.length} passed`;
await db.clearAll();
</script>
</body>
</html>
```

- [ ] **Step 2: Run the test page to verify it fails**

Serve the directory (`python3 -m http.server 8000`) and open `http://localhost:8000/test.html`. A `file://` URL will not load ES modules.
Expected: the page fails to load `db.js`; the console shows a module resolution error.

- [ ] **Step 3: Write the implementation**

Create `db.js`:

```js
const DB_NAME = 'moneytrack';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb(name = DB_NAME) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const txns = database.createObjectStore('transactions', { keyPath: 'id' });
      txns.createIndex('date', 'date');
      txns.createIndex('account', 'account');
      txns.createIndex('transfer_id', 'transfer_id');
      database.createObjectStore('accounts', { keyPath: 'name' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run(store, mode, work) {
  return openDb().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(store, mode);
    const result = work(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(result.value);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

function readAll(store) {
  return run(store, 'readonly', (objectStore) => {
    const result = { value: [] };
    const request = objectStore.getAll();
    request.onsuccess = () => { result.value = request.result; };
    return result;
  });
}

export const allTransactions = () => readAll('transactions');
export const allAccounts = () => readAll('accounts');

export function putAccount(name, openingBalance) {
  return run('accounts', 'readwrite', (store) => {
    store.put({ name, opening_balance: openingBalance });
    return { value: undefined };
  });
}

export function addFlow({ date, account, amount, category, note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount === 0) throw new RangeError('amount must not be zero');
  const id = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id, date, account, amount, category, transfer_id: null, note });
    return { value: id };
  });
}

// Both rows are written inside one IndexedDB transaction. If either put
// fails the transaction aborts and neither row lands, so a transfer can
// never exist as a single orphaned half.
export function addTransfer({ date, from, to, amount, note }) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be integer cents');
  if (amount <= 0) throw new RangeError('transfer amount must be positive');
  if (from === to) throw new RangeError('cannot transfer to the same account');
  const fromId = crypto.randomUUID();
  const toId = crypto.randomUUID();
  return run('transactions', 'readwrite', (store) => {
    store.add({ id: fromId, date, account: from, amount: -amount, category: 'Transfer', transfer_id: toId, note });
    store.add({ id: toId, date, account: to, amount, category: 'Transfer', transfer_id: fromId, note });
    return { value: [fromId, toId] };
  });
}

export function updateTransaction(txn) {
  if (!Number.isInteger(txn.amount)) throw new TypeError('amount must be integer cents');
  return run('transactions', 'readwrite', (store) => {
    store.put(txn);
    return { value: undefined };
  });
}

// Deleting either side of a transfer deletes both. Leaving one half behind
// would unbalance the two accounts against each other permanently.
export function deleteTransaction(id) {
  return run('transactions', 'readwrite', (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const txn = request.result;
      if (!txn) return;
      store.delete(id);
      if (txn.transfer_id) store.delete(txn.transfer_id);
    };
    return { value: undefined };
  });
}

export function putTransactions(txns) {
  return run('transactions', 'readwrite', (store) => {
    for (const txn of txns) store.put(txn);
    return { value: undefined };
  });
}

export function clearAll() {
  return openDb().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(['transactions', 'accounts'], 'readwrite');
    transaction.objectStore('transactions').clear();
    transaction.objectStore('accounts').clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }));
}
```

- [ ] **Step 4: Run the test page to verify it passes**

Reload `http://localhost:8000/test.html`.
Expected: `8 / 8 passed`, every line green.

- [ ] **Step 5: Commit**

```bash
git add db.js test.html
git commit -m "feat: IndexedDB layer owning the transfer-pair invariant"
```

---

### Task 5: Add screen

**Files:**
- Modify: `index.html` (replace the `view-add` section), `app.js`, `styles.css`

**Interfaces:**
- Consumes: `db.addFlow`, `db.addTransfer`, `db.allAccounts`, `money.toCents`
- Produces: `renderAdd()`; the convention that after any write, `refresh()` re-renders the list and summary

- [ ] **Step 1: Replace the `view-add` section in `index.html`**

```html
<section class="view" id="view-add">
  <h1>Add</h1>
  <form id="add-form">
    <label for="add-date">Date</label>
    <input type="date" id="add-date" required>

    <label for="add-amount">Amount</label>
    <input type="number" id="add-amount" step="0.01" min="0" inputmode="decimal" required>

    <div id="add-kind" role="group" aria-label="Kind">
      <label><input type="radio" name="kind" value="expense" checked> Expense</label>
      <label><input type="radio" name="kind" value="income"> Income</label>
      <label><input type="radio" name="kind" value="transfer"> Transfer</label>
    </div>

    <label for="add-account" id="add-account-label">Account</label>
    <input list="accounts" id="add-account" required>
    <datalist id="accounts"></datalist>

    <div id="add-to-wrap" hidden>
      <label for="add-to">To account</label>
      <input list="accounts" id="add-to">
    </div>

    <div id="add-category-wrap">
      <label for="add-category">Category</label>
      <input list="categories" id="add-category" required>
      <datalist id="categories"></datalist>
    </div>

    <label for="add-note">Note</label>
    <input type="text" id="add-note">

    <button type="submit" class="primary">Save</button>
    <p id="add-status" role="status"></p>
  </form>
</section>
```

The amount input has `min="0"`: direction comes from the kind radio, never from the user typing a minus sign, so the two can never disagree.

- [ ] **Step 2: Add the radio row styling to `styles.css`**

```css
#add-kind { display: flex; gap: var(--space-2); margin-bottom: var(--space-2); }
#add-kind label { display: flex; align-items: center; gap: 6px; min-height: 44px; margin: 0; }
#add-kind input { width: auto; min-height: 0; margin: 0; }
#add-status { min-height: 24px; font-size: 14px; color: var(--color-accent); }
```

- [ ] **Step 3: Wire the form in `app.js`**

Add these imports at the top of `app.js`:

```js
import * as db from './db.js';
import { toCents } from './money.js';
```

Then append:

```js
const SEED_CATEGORIES = ['Food', 'Rent', 'Transport', 'Salary', 'Utilities', 'Fun'];

const form = document.getElementById('add-form');
const kindInputs = form.querySelectorAll('input[name="kind"]');
const toWrap = document.getElementById('add-to-wrap');
const categoryWrap = document.getElementById('add-category-wrap');
const accountLabel = document.getElementById('add-account-label');
const status = document.getElementById('add-status');

const selectedKind = () => form.querySelector('input[name="kind"]:checked').value;

function syncKind() {
  const transfer = selectedKind() === 'transfer';
  toWrap.hidden = !transfer;
  categoryWrap.hidden = transfer;
  document.getElementById('add-category').required = !transfer;
  document.getElementById('add-to').required = transfer;
  accountLabel.textContent = transfer ? 'From account' : 'Account';
}

for (const input of kindInputs) input.addEventListener('change', syncKind);

async function fillDatalists() {
  const [accounts, txns] = await Promise.all([db.allAccounts(), db.allTransactions()]);
  const accountNames = accounts.map((a) => a.name);
  document.getElementById('accounts').innerHTML =
    accountNames.map((name) => `<option value="${name}">`).join('');
  const used = new Set(txns.map((t) => t.category).filter(Boolean));
  const categories = [...new Set([...SEED_CATEGORIES, ...used])].sort();
  document.getElementById('categories').innerHTML =
    categories.map((name) => `<option value="${name}">`).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const kind = selectedKind();
  const date = document.getElementById('add-date').value;
  const note = document.getElementById('add-note').value;
  const account = document.getElementById('add-account').value.trim();

  let magnitude;
  try {
    magnitude = toCents(document.getElementById('add-amount').value);
  } catch {
    status.style.color = 'var(--color-destructive)';
    status.textContent = 'Enter a valid amount.';
    return;
  }
  if (magnitude <= 0) {
    status.style.color = 'var(--color-destructive)';
    status.textContent = 'Amount must be greater than zero.';
    return;
  }

  try {
    if (kind === 'transfer') {
      const to = document.getElementById('add-to').value.trim();
      await db.addTransfer({ date, from: account, to, amount: magnitude, note });
    } else {
      await db.addFlow({
        date,
        account,
        amount: kind === 'income' ? magnitude : -magnitude,
        category: document.getElementById('add-category').value.trim(),
        note,
      });
    }
  } catch (error) {
    status.style.color = 'var(--color-destructive)';
    status.textContent = error.message;
    return;
  }

  // Ensure any account name typed for the first time exists with a zero
  // opening balance, so it appears in balances and in the datalist.
  const accounts = new Set((await db.allAccounts()).map((a) => a.name));
  for (const name of [account, document.getElementById('add-to').value.trim()]) {
    if (name && !accounts.has(name)) await db.putAccount(name, 0);
  }

  form.reset();
  document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
  syncKind();
  status.style.color = 'var(--color-accent)';
  status.textContent = 'Saved.';
  await refresh();
});

async function refresh() {
  await fillDatalists();
}

document.getElementById('add-date').value = new Date().toISOString().slice(0, 10);
syncKind();
await refresh();
```

- [ ] **Step 4: Verify by hand**

With `python3 -m http.server 8000` running, open `http://localhost:8000/`.
- Add an expense of `45.00` on Bank / Food. Expected: "Saved.", form clears, date resets to today.
- Switch to Transfer. Expected: the Category field disappears, "To account" appears, the Account label reads "From account".
- Add a transfer of `200.00` Bank → Savings. Expected: "Saved."
- Submit with an empty amount. Expected: the browser's own required-field prompt, no console error.

Then open `test.html` and confirm the 8 database tests still pass.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: add screen for expenses, income and transfers"
```

---

### Task 6: List screen

**Files:**
- Modify: `index.html` (replace the `view-list` section), `app.js`, `styles.css`

**Interfaces:**
- Consumes: `db.allTransactions`, `db.deleteTransaction`, `rollup.filterMonth`, `money.formatAmount`
- Produces: `renderList()`, called by `refresh()`; the module-level `state.month` (a `"YYYY-MM"` string) shared with the dashboard

- [ ] **Step 1: Replace the `view-list` section in `index.html`**

```html
<section class="view" id="view-list" hidden>
  <h1>List</h1>
  <label for="list-month">Month</label>
  <input type="month" id="list-month">
  <ul id="list-rows" class="rows"></ul>
  <p id="list-empty" hidden>No transactions this month.</p>
</section>
```

- [ ] **Step 2: Add row styling to `styles.css`**

```css
.rows { list-style: none; margin: 0; padding: 0; }

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.row__main { flex: 1; min-width: 0; }
.row__title { display: block; }
.row__meta { display: block; font-size: 13px; opacity: 0.7; }

.row__delete {
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  color: var(--color-destructive);
  cursor: pointer;
  border-radius: 8px;
  transition: background 150ms ease;
}

.row__delete:hover { background: rgba(220, 38, 38, 0.15); }
```

- [ ] **Step 3: Add the rendering to `app.js`**

Extend the imports:

```js
import { toCents, formatAmount } from './money.js';
import { filterMonth, monthOf } from './rollup.js';
```

Append:

```js
const state = { month: new Date().toISOString().slice(0, 7) };

const monthInput = document.getElementById('list-month');
monthInput.value = state.month;
monthInput.addEventListener('change', () => {
  state.month = monthInput.value;
  refresh();
});

const TRASH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

function renderList(txns) {
  const rows = filterMonth(txns, state.month)
    .sort((a, b) => b.date.localeCompare(a.date));
  const list = document.getElementById('list-rows');
  document.getElementById('list-empty').hidden = rows.length > 0;

  list.replaceChildren(...rows.map((txn) => {
    const item = document.createElement('li');
    item.className = 'row';

    const main = document.createElement('div');
    main.className = 'row__main';
    const title = document.createElement('span');
    title.className = 'row__title';
    title.textContent = txn.transfer_id ? 'Transfer' : txn.category;
    const meta = document.createElement('span');
    meta.className = 'row__meta';
    meta.textContent = [txn.date, txn.account, txn.note].filter(Boolean).join(' · ');
    main.append(title, meta);

    const amount = document.createElement('span');
    amount.className = `amount ${txn.amount > 0 ? 'amount--in' : 'amount--out'}`;
    amount.textContent = formatAmount(txn.amount);

    const remove = document.createElement('button');
    remove.className = 'row__delete';
    remove.type = 'button';
    remove.innerHTML = TRASH_ICON;
    remove.setAttribute('aria-label', `Delete ${title.textContent} ${formatAmount(txn.amount)} on ${txn.date}`);
    remove.addEventListener('click', async () => {
      const isTransfer = Boolean(txn.transfer_id);
      const message = isTransfer
        ? 'Delete this transfer? Both sides will be removed.'
        : 'Delete this transaction?';
      if (!confirm(message)) return;
      await db.deleteTransaction(txn.id);
      await refresh();
    });

    item.append(main, amount, remove);
    return item;
  }));
}
```

Replace the existing `refresh()` with:

```js
async function refresh() {
  const txns = await db.allTransactions();
  await fillDatalists();
  renderList(txns);
}
```

Note: `fillDatalists` re-reads the transactions itself. That second read is deliberate — it keeps `fillDatalists` independently callable, and the cost is a single `getAll` over a table of a few thousand rows.

- [ ] **Step 4: Verify by hand**

Reload the app.
- The List tab shows the rows added in Task 5, newest first, amounts right-aligned in the tabular font, spending red and income green.
- Deleting a transfer side prompts, and after confirming **both** rows disappear.
- Changing the month picker to a month with no data shows "No transactions this month."

Confirm `test.html` still reports `8 / 8 passed`.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: monthly transaction list with delete"
```

---

### Task 7: Dashboard

**Files:**
- Modify: `index.html` (replace the `view-summary` section), `app.js`, `styles.css`

**Interfaces:**
- Consumes: `rollup.monthlyTotals`, `rollup.categoryBreakdown`, `rollup.accountBalances`, `rollup.netTrend`, `money.formatAmount`, `money.fromCents`
- Produces: `renderSummary(txns, accounts)`, called by `refresh()`

- [ ] **Step 1: Replace the `view-summary` section in `index.html`**

```html
<section class="view" id="view-summary" hidden>
  <h1>Summary</h1>

  <div class="card stats">
    <div class="stat"><span class="stat__label">Income</span><span class="amount amount--in" id="stat-income">0.00</span></div>
    <div class="stat"><span class="stat__label">Spent</span><span class="amount amount--out" id="stat-spent">0.00</span></div>
    <div class="stat stat--net"><span class="stat__label">Net</span><span class="amount" id="stat-net">0.00</span></div>
  </div>

  <div class="card">
    <h2>Spending by category</h2>
    <table class="bars" id="bars">
      <caption class="visually-hidden">Spending by category for the selected month</caption>
      <thead><tr><th scope="col">Category</th><th scope="col">Amount</th></tr></thead>
      <tbody></tbody>
    </table>
    <p id="bars-empty" hidden>No spending this month.</p>
  </div>

  <div class="card">
    <h2>Net, last 6 months</h2>
    <svg id="trend" viewBox="0 0 300 80" role="img" aria-labelledby="trend-desc"></svg>
    <p id="trend-desc" class="visually-hidden"></p>
  </div>

  <div class="card">
    <h2>Balances</h2>
    <table class="bars" id="balances">
      <thead><tr><th scope="col">Account</th><th scope="col">Balance</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</section>
```

The breakdown is a real `<table>`: the bars are drawn as backgrounds on genuine table rows, so the numbers survive with images off, at any zoom, and in a screen reader. No separate table alternative is needed because the table *is* the chart.

- [ ] **Step 2: Add dashboard styling to `styles.css`**

```css
.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.stats { display: flex; gap: var(--space-2); }
.stat { flex: 1; display: flex; flex-direction: column; }
.stat__label { font-size: 13px; opacity: 0.7; }
.stat .amount { font-size: 20px; }
.stat--net .amount { font-size: 28px; font-weight: 700; }

.bars { width: 100%; border-collapse: collapse; }
.bars thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.bars td { padding: var(--space-1) var(--space-2); position: relative; }
.bars tbody tr { background-image: linear-gradient(to right, var(--color-primary) var(--bar, 0%), transparent var(--bar, 0%)); }
.bars td:last-child { text-align: right; }

#trend { width: 100%; height: auto; }
h2 { font-size: 15px; margin: 0 0 var(--space-2); opacity: 0.8; }
```

- [ ] **Step 3: Add the rendering to `app.js`**

Extend the imports:

```js
import {
  filterMonth, monthOf, monthlyTotals, categoryBreakdown,
  accountBalances, netTrend,
} from './rollup.js';
import { toCents, fromCents, formatAmount } from './money.js';
```

Append:

```js
function lastSixMonths(endMonth) {
  const [year, month] = endMonth.split('-').map(Number);
  const months = [];
  for (let back = 5; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

function renderSummary(txns, accounts) {
  const totals = monthlyTotals(txns, state.month);
  document.getElementById('stat-income').textContent = fromCents(totals.income);
  document.getElementById('stat-spent').textContent = fromCents(-totals.spending);
  const net = document.getElementById('stat-net');
  net.textContent = formatAmount(totals.net);
  net.className = `amount ${totals.net >= 0 ? 'amount--in' : 'amount--out'}`;

  const breakdown = categoryBreakdown(txns, state.month);
  const largest = breakdown.length ? breakdown[0].total : 0;
  document.getElementById('bars-empty').hidden = breakdown.length > 0;
  document.querySelector('#bars tbody').replaceChildren(...breakdown.map(({ category, total }) => {
    const row = document.createElement('tr');
    // largest is 0 only when breakdown is empty, so this never divides by zero
    row.style.setProperty('--bar', `${Math.round((total / largest) * 100)}%`);
    const name = document.createElement('td');
    name.textContent = category;
    const value = document.createElement('td');
    value.className = 'amount';
    value.textContent = fromCents(total);
    row.append(name, value);
    return row;
  }));

  const balances = accountBalances(txns, accounts);
  document.querySelector('#balances tbody').replaceChildren(
    ...balances.map(({ account, balance }) => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = account;
      const value = document.createElement('td');
      value.className = `amount ${balance < 0 ? 'amount--out' : ''}`;
      value.textContent = fromCents(balance);
      row.append(name, value);
      return row;
    }),
    (() => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.innerHTML = '<strong>Total</strong>';
      const value = document.createElement('td');
      const total = balances.reduce((sum, b) => sum + b.balance, 0);
      value.className = `amount ${total < 0 ? 'amount--out' : ''}`;
      value.textContent = fromCents(total);
      row.append(name, value);
      return row;
    })(),
  );

  renderTrend(netTrend(txns, lastSixMonths(state.month)));
}

function renderTrend(points) {
  const svg = document.getElementById('trend');
  const values = points.map((p) => p.net);
  const high = Math.max(...values, 0);
  const low = Math.min(...values, 0);
  const span = high - low || 1;
  const y = (value) => 75 - ((value - low) / span) * 70;
  const x = (index) => (index / Math.max(points.length - 1, 1)) * 300;

  const line = points.map((point, index) => `${x(index)},${y(point.net)}`).join(' ');
  const zero = y(0);

  svg.innerHTML = `
    <line x1="0" y1="${zero}" x2="300" y2="${zero}" stroke="var(--color-border)" stroke-width="1"/>
    <polyline points="${line}" fill="none" stroke="var(--color-primary)" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
    ${points.map((point, index) =>
      `<circle cx="${x(index)}" cy="${y(point.net)}" r="3"
               fill="${point.net >= 0 ? 'var(--color-accent)' : 'var(--color-destructive)'}"/>`).join('')}
  `;

  document.getElementById('trend-desc').textContent =
    'Net by month: ' + points.map((p) => `${p.month} ${fromCents(p.net)}`).join(', ') + '.';
}
```

The `trend-desc` paragraph is the chart's text equivalent and is referenced by `aria-labelledby`, so the trend is readable without seeing it.

Replace `refresh()` with:

```js
async function refresh() {
  const [txns, accounts] = await Promise.all([db.allTransactions(), db.allAccounts()]);
  await fillDatalists();
  renderList(txns);
  renderSummary(txns, accounts);
}
```

- [ ] **Step 4: Verify by hand against known numbers**

Reload the app and, in a fresh profile or after clearing storage, enter exactly:
- Income `3000.00`, Bank, Salary
- Expense `45.00`, Bank, Food
- Expense `15.00`, Cash, Food
- Expense `90.00`, Bank, Rent
- Transfer `200.00`, Bank → Savings

Expected on the Summary tab: Income `3000.00`, Spent `150.00`, Net `+2850.00`. Category bars: Rent `90.00` (full width), Food `60.00` (two-thirds width). Balances: Bank `2665.00`, Cash `-15.00`, Savings `200.00`, Total `2850.00`.

The transfer must appear in **neither** Income nor Spent, and Savings must read `200.00`. If either fails, the transfer exclusion is broken — fix `rollup.js` and add the failing case to `test/rollup.test.js`.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js styles.css
git commit -m "feat: dashboard with stat row, category bars and net trend"
```

---

### Task 8: Excel export and import

**Files:**
- Create: `xlsx-io.js`, `vendor/xlsx.full.min.js`, `test/xlsx-io.test.js`
- Modify: `index.html` (replace the `view-settings` section), `app.js`

**Interfaces:**
- Consumes: `money.toCents`, `money.fromCents`, `db.allTransactions`, `db.putTransactions`
- Produces:
  - `rowsToSheetData(txns: Txn[]): Array<object>` — pure, one plain object per transaction with decimal amounts
  - `sheetDataToRows(rows: Array<object>): Txn[]` — pure, inverse of the above; throws on a malformed row
  - `exportXlsx(txns: Txn[]): void` — triggers the browser download
  - `importXlsx(file: File): Promise<Txn[]>`

The two pure functions carry the round-trip test under Node; only the file plumbing needs a browser.

- [ ] **Step 1: Vendor SheetJS**

```bash
mkdir -p vendor
curl -L -o vendor/xlsx.full.min.js https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
ls -lh vendor/xlsx.full.min.js
```

Expected: roughly 900KB. This is the one download; after it, the app never touches the network. If the URL fails, fetch the current build link from https://cdn.sheetjs.com/ — do not fall back to a `<script src>` pointing at the CDN, which would break offline use.

- [ ] **Step 2: Write the failing test**

Create `test/xlsx-io.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToSheetData, sheetDataToRows } from '../xlsx-io.js';

const txns = [
  { id: 'a', date: '2026-08-01', account: 'Bank', amount: 300000, category: 'Salary', transfer_id: null, note: 'pay' },
  { id: 'e', date: '2026-08-06', account: 'Bank', amount: -20000, category: 'Transfer', transfer_id: 'f', note: '' },
  { id: 'f', date: '2026-08-06', account: 'Savings', amount: 20000, category: 'Transfer', transfer_id: 'e', note: '' },
];

test('rowsToSheetData writes decimal amounts and readable headers', () => {
  const [first] = rowsToSheetData(txns);
  assert.deepEqual(first, {
    id: 'a', date: '2026-08-01', account: 'Bank',
    amount: '3000.00', category: 'Salary', transfer_id: '', note: 'pay',
  });
});

test('round trip preserves every field exactly', () => {
  assert.deepEqual(sheetDataToRows(rowsToSheetData(txns)), txns);
});

test('round trip preserves sub-unit amounts', () => {
  const odd = [{ id: 'x', date: '2026-08-01', account: 'Bank', amount: -7, category: 'Food', transfer_id: null, note: '' }];
  assert.deepEqual(sheetDataToRows(rowsToSheetData(odd)), odd);
});

test('sheetDataToRows accepts an amount typed as a number by Excel', () => {
  const rows = [{ id: 'x', date: '2026-08-01', account: 'Bank', amount: -45.5, category: 'Food', transfer_id: '', note: '' }];
  assert.equal(sheetDataToRows(rows)[0].amount, -4550);
});

test('sheetDataToRows normalises an empty transfer_id to null', () => {
  const rows = [{ id: 'x', date: '2026-08-01', account: 'Bank', amount: '1.00', category: 'Food', transfer_id: '', note: '' }];
  assert.equal(sheetDataToRows(rows)[0].transfer_id, null);
});

test('sheetDataToRows rejects a row with no id', () => {
  assert.throws(() => sheetDataToRows([{ date: '2026-08-01', account: 'Bank', amount: '1.00', category: 'Food' }]), /id/);
});

test('sheetDataToRows rejects a malformed date', () => {
  assert.throws(() => sheetDataToRows([{ id: 'x', date: '01/08/2026', account: 'Bank', amount: '1.00', category: 'Food' }]), /date/);
});

test('sheetDataToRows rejects a non-numeric amount', () => {
  assert.throws(() => sheetDataToRows([{ id: 'x', date: '2026-08-01', account: 'Bank', amount: 'lots', category: 'Food' }]));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test`
Expected: FAIL — cannot find module `../xlsx-io.js`.

- [ ] **Step 4: Write the implementation**

Create `xlsx-io.js`:

```js
import { toCents, fromCents } from './money.js';

export const COLUMNS = ['id', 'date', 'account', 'amount', 'category', 'transfer_id', 'note'];

export function rowsToSheetData(txns) {
  return txns.map((txn) => ({
    id: txn.id,
    date: txn.date,
    account: txn.account,
    amount: fromCents(txn.amount),
    category: txn.category,
    transfer_id: txn.transfer_id ?? '',
    note: txn.note ?? '',
  }));
}

export function sheetDataToRows(rows) {
  return rows.map((row, index) => {
    const where = `row ${index + 2}`; // +2: one-based, plus the header row
    const id = String(row.id ?? '').trim();
    if (!id) throw new Error(`${where}: missing id`);
    const date = String(row.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${where}: date must be YYYY-MM-DD, got "${row.date}"`);
    const account = String(row.account ?? '').trim();
    if (!account) throw new Error(`${where}: missing account`);

    let amount;
    try {
      amount = toCents(row.amount);
    } catch {
      throw new Error(`${where}: amount is not a number: "${row.amount}"`);
    }

    const transferId = String(row.transfer_id ?? '').trim();
    return {
      id,
      date,
      account,
      amount,
      category: String(row.category ?? '').trim(),
      transfer_id: transferId === '' ? null : transferId,
      note: String(row.note ?? ''),
    };
  });
}

// Browser-only below this line. XLSX is the global from vendor/xlsx.full.min.js,
// loaded by a plain <script> tag in index.html.
export function exportXlsx(txns) {
  const sheet = XLSX.utils.json_to_sheet(rowsToSheetData(txns), { header: COLUMNS });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'transactions');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `moneytrack-${stamp}.xlsx`);
}

export async function importXlsx(file) {
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]];
  // raw:false keeps cells as the text the user sees, so a date Excel
  // reformatted still arrives as a string this code can validate.
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  return sheetDataToRows(rows);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test`
Expected: PASS, all files. The browser-only functions are never called under Node, so the missing `XLSX` global is harmless.

- [ ] **Step 6: Load SheetJS and replace the `view-settings` section in `index.html`**

Add before the module script tag:

```html
<script src="./vendor/xlsx.full.min.js"></script>
```

Replace the settings section:

```html
<section class="view" id="view-settings" hidden>
  <h1>Settings</h1>

  <div class="card">
    <h2>Backup</h2>
    <button type="button" class="primary" id="export-button">Export to Excel</button>
    <label for="import-input">Import from Excel</label>
    <input type="file" id="import-input" accept=".xlsx,.xls">
    <p id="io-status" role="status"></p>
  </div>

  <div class="card">
    <h2>Accounts</h2>
    <form id="account-form">
      <label for="account-name">Name</label>
      <input type="text" id="account-name" required>
      <label for="account-opening">Opening balance</label>
      <input type="number" id="account-opening" step="0.01" value="0" inputmode="decimal">
      <button type="submit" class="primary">Save account</button>
    </form>
    <ul id="account-list" class="rows"></ul>
  </div>
</section>
```

- [ ] **Step 7: Wire settings in `app.js`**

Extend the imports:

```js
import { exportXlsx, importXlsx } from './xlsx-io.js';
```

Append:

```js
const ioStatus = document.getElementById('io-status');

document.getElementById('export-button').addEventListener('click', async () => {
  exportXlsx(await db.allTransactions());
  ioStatus.style.color = 'var(--color-accent)';
  ioStatus.textContent = 'Exported.';
});

document.getElementById('import-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const rows = await importXlsx(file);
    await db.putTransactions(rows);
    // Any account named in the file must exist, or its rows would be
    // invisible in Balances.
    const known = new Set((await db.allAccounts()).map((a) => a.name));
    for (const name of new Set(rows.map((r) => r.account))) {
      if (!known.has(name)) await db.putAccount(name, 0);
    }
    ioStatus.style.color = 'var(--color-accent)';
    ioStatus.textContent = `Imported ${rows.length} transactions.`;
    await refresh();
  } catch (error) {
    ioStatus.style.color = 'var(--color-destructive)';
    ioStatus.textContent = `Import failed — nothing was changed. ${error.message}`;
  }
  event.target.value = '';
});

document.getElementById('account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('account-name').value.trim();
  if (!name) return;
  await db.putAccount(name, toCents(document.getElementById('account-opening').value || 0));
  event.target.reset();
  document.getElementById('account-opening').value = '0';
  await refresh();
});

async function renderAccounts(accounts) {
  document.getElementById('account-list').replaceChildren(...accounts.map(({ name, opening_balance }) => {
    const item = document.createElement('li');
    item.className = 'row';
    const main = document.createElement('div');
    main.className = 'row__main';
    main.textContent = name;
    const value = document.createElement('span');
    value.className = 'amount';
    value.textContent = fromCents(opening_balance);
    item.append(main, value);
    return item;
  }));
}
```

Add `await renderAccounts(accounts);` to the end of `refresh()`.

Note: `importXlsx` parses and validates the whole file **before** `putTransactions` is called, so a malformed row aborts the import with the database untouched. The status message says so explicitly.

- [ ] **Step 8: Verify the round trip by hand**

With the five transactions from Task 7 present:
1. Settings → Export to Excel. A `moneytrack-YYYY-MM-DD.xlsx` file downloads. Open it: 6 rows (5 entries, but the transfer is 2 rows) plus a header, amounts as `3000.00`, `-45.00` and so on.
2. Import that same file. Expected: "Imported 6 transactions." Go to Summary — every figure is **unchanged**. That is the idempotence check: matching on `id` means re-import updates rather than duplicates.
3. Edit one amount in Excel, save, import again. Expected: Summary reflects the edited figure, still 6 rows in the List.
4. Import a file with a broken date. Expected: a red "Import failed — nothing was changed" message, and Summary unchanged.

- [ ] **Step 9: Commit**

```bash
git add xlsx-io.js test/xlsx-io.test.js vendor/xlsx.full.min.js index.html app.js
git commit -m "feat: Excel export and idempotent import"
```

---

### Task 9: Offline shell and installability

**Files:**
- Create: `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `vendor/fira-sans.woff2`, `vendor/fira-code.woff2`
- Modify: `index.html`, `manifest.json`, `styles.css`

**Interfaces:**
- Consumes: every file created so far (they become the cached shell)
- Produces: an installable, offline-capable app

- [ ] **Step 1: Vendor the fonts**

```bash
mkdir -p vendor
curl -L -o vendor/fira-sans.woff2 "https://fonts.gstatic.com/s/firasans/v17/va9E4kDNxMZdWfMOD5VvmojLazX3dGTP.woff2"
curl -L -o vendor/fira-code.woff2 "https://fonts.gstatic.com/s/firacode/v22/uU9eCBsR6Z2vfE9aq3bL0fxyUs4tcw4W_D1sJVD7Ng.woff2"
ls -lh vendor/*.woff2
```

Expected: two files, roughly 15–30KB each. If a URL 404s, open `https://fonts.googleapis.com/css2?family=Fira+Sans&family=Fira+Code&display=swap` in a browser and copy the current `.woff2` URLs from the response. Do **not** link the stylesheet — it would make first paint depend on the network.

- [ ] **Step 2: Declare the fonts in `styles.css`**

Add at the very top, above `:root`:

```css
@font-face {
  font-family: "Fira Sans";
  src: url("./vendor/fira-sans.woff2") format("woff2");
  font-weight: 300 700;
  font-display: swap;
}

@font-face {
  font-family: "Fira Code";
  src: url("./vendor/fira-code.woff2") format("woff2");
  font-weight: 400 700;
  font-display: swap;
}
```

`font-display: swap` means a slow or failed font load shows the system fallback instead of blank text.

- [ ] **Step 3: Create the icons**

```bash
mkdir -p icons
python3 - <<'PY'
import struct, zlib

def png(path, size, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * size for _ in range(size))
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))
    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    blob = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
    open(path, 'wb').write(blob)

png('icons/icon-192.png', 192, (30, 64, 175))
png('icons/icon-512.png', 512, (30, 64, 175))
print('written')
PY
ls -lh icons/
```

Flat `#1E40AF` squares — placeholders that satisfy the install requirement. Replace them with a real mark whenever you like; nothing else depends on their content.

- [ ] **Step 4: Point the manifest at the icons**

Replace the `"icons"` array in `manifest.json`:

```json
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
```

- [ ] **Step 5: Create `sw.js`**

```js
const CACHE = 'moneytrack-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './money.js',
  './rollup.js',
  './xlsx-io.js',
  './manifest.json',
  './vendor/xlsx.full.min.js',
  './vendor/fira-sans.woff2',
  './vendor/fira-code.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

// Cache-first. Every entry is a versioned part of the shell, and the app has
// no server to be stale against — bump CACHE to ship an update.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request)),
  );
});
```

- [ ] **Step 6: Register the service worker in `app.js`**

Append:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Registration fails on file:// and on some private-mode profiles. The
    // app works without it; only offline caching is lost.
  });
}
```

- [ ] **Step 7: Verify offline**

1. `python3 -m http.server 8000`, open `http://localhost:8000/`.
2. DevTools → Application → Service Workers: shows activated.
3. DevTools → Network → check **Offline**. Reload. Expected: the app loads fully, previously entered data still shows, adding a transaction still works.
4. Uncheck Offline. In DevTools → Application → Manifest: no errors, both icons listed, "Installable" with no warnings.
5. On a phone on the same network, open `http://<your-ip>:8000/` and use "Add to Home Screen". Expected: it launches without browser chrome.

Note: iOS requires HTTPS for service workers on anything but `localhost`. For real phone use, serve the folder over HTTPS or from any static host — the app itself needs no server logic.

- [ ] **Step 8: Run the whole verification suite**

```bash
node --test
```
Expected: PASS, all three test files.

Then open `http://localhost:8000/test.html`. Expected: `8 / 8 passed`.

- [ ] **Step 9: Commit**

```bash
git add sw.js manifest.json styles.css app.js icons/ vendor/
git commit -m "feat: offline shell, vendored fonts, installable manifest"
```

---

## Verification summary

| Layer | Command | Covers |
| --- | --- | --- |
| Money arithmetic | `node --test` | rounding, sign, float error, round trip |
| Rollups | `node --test` | transfer exclusion, breakdown order, balances, trend |
| Excel round trip | `node --test` | field preservation, malformed-row rejection |
| Database invariants | `test.html` in a browser | transfer pairs written and deleted together, import idempotence |
| The app itself | Task 7 Step 4 and Task 8 Step 8, by hand | the numbers a user actually sees |
| Offline | Task 9 Step 7 | shell cache, installability |

A change to `rollup.js` or `money.js` that does not break `node --test` is not proven correct — add the case that would have caught it.
