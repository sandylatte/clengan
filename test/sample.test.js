import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_ACCOUNTS, SAMPLE_COLOURS, SAMPLE_NOTE, sampleMonths, sampleTransactions,
} from '../sample.js';
import { monthlyTotals, bucketTotals, accountBalances, selectSpending } from '../rollup.js';
import { CATEGORY_COLOURS, DEFAULT_CATEGORIES, DEFAULT_SPLIT, kindOf } from '../budget.js';

// Sample data is shown to someone deciding whether the app works. If it is
// itself malformed, every screen it fills is lying, and the reader cannot
// tell which of the two is at fault. So it is held to the same rules as
// anything the user types.

let counter = 0;
const makeId = () => `sample-${counter += 1}`;
const build = (month = '2026-09') => { counter = 0; return sampleTransactions(month, makeId); };

test('sampleMonths ends on the month asked for and runs consecutively', () => {
  assert.deepEqual(sampleMonths('2026-09'), ['2026-07', '2026-08', '2026-09']);
});

test('sampleMonths crosses a year boundary correctly', () => {
  assert.deepEqual(sampleMonths('2026-01'), ['2025-11', '2025-12', '2026-01']);
});

test('every amount is integer cents and never zero', () => {
  for (const row of build()) {
    assert.equal(Number.isInteger(row.amount), true, `${row.name} amount ${row.amount}`);
    assert.notEqual(row.amount, 0, `${row.name} is zero`);
  }
});

test('every id is unique', () => {
  const ids = build().map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every row names an account that the sample actually creates', () => {
  const names = new Set(SAMPLE_ACCOUNTS.map((a) => a.name));
  for (const row of build()) {
    assert.equal(names.has(row.account), true, `${row.name} files against unknown account ${row.account}`);
  }
});

test('every category used exists in the default set', () => {
  // Otherwise the sample fills the chart with names that are not in Settings,
  // and deleting one would look like it did nothing.
  for (const row of build()) {
    if (row.category === 'Transfer' || row.category === '') continue;
    assert.notEqual(kindOf(DEFAULT_CATEGORIES, row.category), null, `unknown category ${row.category}`);
  }
});

test('income rows use income categories and spending rows do not', () => {
  for (const row of build()) {
    if (row.transfer_id) continue;
    const expected = row.amount > 0 ? 'income' : 'expense';
    assert.equal(kindOf(DEFAULT_CATEGORIES, row.category), expected, `${row.name} (${row.category})`);
  }
});

test('every expense carries a real bucket, and nothing else does', () => {
  for (const row of build()) {
    if (row.transfer_id || row.amount > 0) {
      assert.equal(row.bucket, null, `${row.name} should carry no bucket`);
    } else {
      assert.ok(['fixed', 'flexible'].includes(row.bucket), `${row.name} bucket ${row.bucket}`);
    }
  }
});

test('transfers are balanced pairs that point at each other', () => {
  const rows = build();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const halves = rows.filter((r) => r.transfer_id);
  assert.ok(halves.length > 0, 'the sample should include transfers');
  for (const half of halves) {
    const partner = byId.get(half.transfer_id);
    assert.ok(partner, `${half.id} has no partner`);
    assert.equal(partner.transfer_id, half.id, 'partners must point back');
    assert.equal(half.amount + partner.amount, 0, 'a transfer must net to zero');
    assert.notEqual(half.account, partner.account, 'a transfer needs two accounts');
  }
});

test('every date falls inside the months the sample claims', () => {
  const months = new Set(sampleMonths('2026-09'));
  for (const row of build()) {
    assert.equal(months.has(row.date.slice(0, 7)), true, `${row.date} is outside the sample months`);
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('the sample lives within its means every month', () => {
  // A demo that overspends every month shows a permanently negative savings
  // figure, which reads as the app being broken rather than as the example
  // being pessimistic.
  const rows = build();
  for (const month of sampleMonths('2026-09')) {
    const { income, net } = monthlyTotals(rows, month);
    assert.ok(income > 0, `${month} has no income`);
    assert.ok(net > 0, `${month} net is ${net}`);
  }
});

test('the sample demonstrates one category in both buckets', () => {
  // The point of the model, so the example has to actually contain it or the
  // feature is invisible to anyone evaluating the app.
  const rows = build();
  const both = rows.filter((r) => r.category === 'Groceries');
  const buckets = new Set(both.map((r) => r.bucket));
  assert.equal(buckets.has('fixed') && buckets.has('flexible'), true,
    'Groceries should appear as both fixed and flexible somewhere in the sample');
});

test('no month is left unbucketed, so the budget always reconciles', () => {
  const rows = build();
  for (const month of sampleMonths('2026-09')) {
    const t = bucketTotals(rows, month, DEFAULT_SPLIT);
    assert.equal(t.unbucketed, 0, `${month} has ${t.unbucketed} unbucketed`);
  }
});

test('no account is driven negative by the sample', () => {
  // A demo opening on a negative balance looks like a bug in the balances.
  const balances = accountBalances(build(), SAMPLE_ACCOUNTS);
  for (const { account, balance } of balances) {
    assert.ok(balance >= 0, `${account} ends at ${balance}`);
  }
});

test('the chart filters all have something to show', () => {
  const rows = build();
  const month = sampleMonths('2026-09').at(-1);
  for (const bucket of ['', 'fixed', 'flexible']) {
    assert.ok(
      selectSpending(rows, { month, bucket }).length > 0,
      `bucket filter "${bucket}" is empty in the sample month`,
    );
  }
  for (const account of ['', 'Bank BCA', 'E-Wallet']) {
    assert.ok(
      selectSpending(rows, { month, account }).length > 0,
      `account filter "${account}" is empty in the sample month`,
    );
  }
});

test('every sample row is labelled so the user can find and delete them', () => {
  // Settings tells the user the rows are labelled in their note. That claim
  // has to be enforceable, not just written.
  for (const row of build()) {
    assert.equal(row.note, SAMPLE_NOTE, `${row.name} is not labelled`);
  }
});

test('every colour the sample presets is one of the curated ten', () => {
  // A colour outside the set would be normalised away to null on save, so
  // the sample would silently colour nothing.
  const allowed = new Set(CATEGORY_COLOURS.map((c) => c.value));
  for (const [name, value] of SAMPLE_COLOURS) {
    assert.ok(allowed.has(value), `${name} uses ${value}, which is not in CATEGORY_COLOURS`);
  }
});

test('the sample presets a colour for every category it spends in', () => {
  // Otherwise the chart arrives part coloured and part ramp, which reads as
  // a bug rather than as a choice.
  const spent = new Set(build().filter((r) => r.amount < 0 && !r.transfer_id).map((r) => r.category));
  for (const category of spent) {
    assert.ok(SAMPLE_COLOURS.has(category), `${category} is spent in but has no sample colour`);
  }
});

test('no two sample categories share a colour', () => {
  const values = [...SAMPLE_COLOURS.values()];
  assert.equal(new Set(values).size, values.length);
});
