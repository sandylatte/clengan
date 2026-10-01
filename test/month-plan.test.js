import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthBudget, validateMonthPlan, DEFAULT_SPLIT } from '../budget.js';
import { bucketTotals, periodBuckets, fundsByYear } from '../rollup.js';

const row = (id, date, amount, bucket = null) => ({
  id, date, account: 'Bank', amount, category: 'X', bucket, transfer_id: null, note: '',
});

// Rp 10.000.000 income in both months, Rp 1.000.000 flexible spend in October.
const txns = [
  row('s1', '2026-09-01', 1_000_000_000),
  row('s2', '2026-10-01', 1_000_000_000),
  row('f1', '2026-10-05', -100_000_000, 'flexible'),
];

test('a month with no plan keeps the default split exactly as before', () => {
  assert.deepEqual(monthBudget(1_000_000_000, DEFAULT_SPLIT, undefined),
    { fixed: 500_000_000, flexible: 200_000_000, savings: 300_000_000 });
  assert.deepEqual(bucketTotals(txns, '2026-10', DEFAULT_SPLIT),
    bucketTotals(txns, '2026-10', DEFAULT_SPLIT, {}));
});

test('a percent plan replaces the split for its own month only', () => {
  const plans = { '2026-10': { mode: 'percent', fixed: 40, flexible: 40, savings: 20 } };
  assert.equal(bucketTotals(txns, '2026-10', DEFAULT_SPLIT, plans).flexible.budget, 400_000_000);
  assert.equal(bucketTotals(txns, '2026-09', DEFAULT_SPLIT, plans).flexible.budget, 200_000_000);
});

test('an amount plan caps the buckets and leaves the rest of income to savings', () => {
  const plans = { '2026-10': { mode: 'amount', fixed: 300_000_000, flexible: 150_000_000 } };
  const t = bucketTotals(txns, '2026-10', DEFAULT_SPLIT, plans);
  assert.equal(t.fixed.budget, 300_000_000);
  assert.equal(t.flexible.budget, 150_000_000);
  assert.equal(t.flexible.remaining, 50_000_000);
  assert.equal(t.savings.budget, 550_000_000);
});

test('an amount plan larger than income shows a negative savings target', () => {
  assert.equal(monthBudget(100, DEFAULT_SPLIT, { mode: 'amount', fixed: 100, flexible: 50 }).savings, -50);
});

test('the year view sums each month under its own plan', () => {
  const plans = { '2026-10': { mode: 'amount', fixed: 0, flexible: 0 } };
  const year = periodBuckets(txns, 'year', '2026-10', DEFAULT_SPLIT, plans);
  assert.equal(year.flexible.budget, 200_000_000);
  const funds = fundsByYear(txns, DEFAULT_SPLIT, [{ name: 'All', percent: 100 }], 2026, plans);
  // September: nothing spent, so all 10jt lands in savings. October: no
  // budget at all, so the whole income is the savings target and the 1jt
  // flexible spend comes straight out of it.
  assert.equal(funds.total, 1_000_000_000 + (1_000_000_000 - 100_000_000));
});

test('an unreadable plan falls back to the default split instead of throwing', () => {
  for (const bad of [{ mode: 'percent', fixed: 10, flexible: 10, savings: 10 },
    { mode: 'amount', fixed: -1, flexible: 0 }, { mode: 'amount', fixed: 1.5, flexible: 0 }, { mode: 'x' }, 'junk']) {
    assert.deepEqual(monthBudget(1000, DEFAULT_SPLIT, bad), monthBudget(1000, DEFAULT_SPLIT, undefined));
    assert.throws(() => validateMonthPlan(bad));
  }
});

test('month plans survive the backup file unchanged', async () => {
  const { settingsToSheetData, sheetDataToSettings } = await import('../xlsx-io.js');
  const { MONTH_PLANS_KEY } = await import('../budget.js');
  const plans = {
    '2026-09': { mode: 'percent', fixed: 40, flexible: 30, savings: 30 },
    '2026-10': { mode: 'amount', fixed: 300_000_000, flexible: 150_000_000 },
  };
  const back = sheetDataToSettings(settingsToSheetData([{ key: MONTH_PLANS_KEY, value: plans }]));
  assert.deepEqual(back, [{ key: MONTH_PLANS_KEY, value: plans }]);
});

test('the dialog line says where an amount plan leaves savings', async () => {
  const { planBalance } = await import('../budget.js');
  const fmt = (c) => String(c);
  assert.match(planBalance({ mode: 'amount', fixed: 60, flexible: 30 }, 100, fmt).message, /Leaves 10/);
  assert.match(planBalance({ mode: 'amount', fixed: 80, flexible: 30 }, 100, fmt).message, /10 more than/);
  assert.equal(planBalance({ mode: 'amount', fixed: 80, flexible: 30 }, 100, fmt).ok, true);
  assert.equal(planBalance({ mode: 'percent', fixed: 50, flexible: 50, savings: 50 }, 100, fmt).ok, false);
});
