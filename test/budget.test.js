import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBudget, validateSplit, bucketOf, DEFAULT_SPLIT, DEFAULT_CATEGORIES } from '../budget.js';
import { bucketTotals } from '../rollup.js';

const cats = DEFAULT_CATEGORIES;
const flow = (date, amount, category) => ({ id: date + amount, date, account: 'a', amount, category, transfer_id: null });

test('splitBudget divides income by the configured shares', () => {
  assert.deepEqual(splitBudget(300000, DEFAULT_SPLIT), { fixed: 150000, flexible: 60000, savings: 90000 });
});

test('splitBudget shares always re-sum to income exactly', () => {
  for (const income of [1, 7, 33, 101, 999999, 1234567]) {
    const b = splitBudget(income, { fixed: 33, flexible: 33, savings: 34 });
    assert.equal(b.fixed + b.flexible + b.savings, income, `income ${income}`);
  }
});

test('splitBudget of zero income is all zeroes', () => {
  assert.deepEqual(splitBudget(0, DEFAULT_SPLIT), { fixed: 0, flexible: 0, savings: 0 });
});

test('validateSplit rejects shares that do not total 100', () => {
  assert.throws(() => validateSplit({ fixed: 50, flexible: 20, savings: 20 }), /total 100/);
});

test('validateSplit rejects a negative share', () => {
  assert.throws(() => validateSplit({ fixed: 110, flexible: -10, savings: 0 }), /non-negative/);
});

test('bucketOf returns null for an unknown category', () => {
  assert.equal(bucketOf(cats, 'Housing & Bills'), 'fixed');
  assert.equal(bucketOf(cats, 'Nonexistent'), null);
});

test('bucketTotals charges spending to the bucket its category owns', () => {
  const txns = [
    flow('2026-09-01', 300000, 'Salary'),
    flow('2026-09-02', -100000, 'Housing & Bills'),
    flow('2026-09-03', -5000, 'Food & Drinks'),
  ];
  const t = bucketTotals(txns, cats, '2026-09', DEFAULT_SPLIT);
  assert.equal(t.income, 300000);
  assert.deepEqual(t.fixed, { budget: 150000, spent: 100000, remaining: 50000 });
  assert.deepEqual(t.flexible, { budget: 60000, spent: 5000, remaining: 55000 });
  assert.equal(t.unbucketed, 0);
});

test('unspent budget projects into savings', () => {
  const txns = [flow('2026-09-01', 300000, 'Salary')];
  const t = bucketTotals(txns, cats, '2026-09', DEFAULT_SPLIT);
  assert.equal(t.savings.budget, 90000);
  assert.equal(t.savings.unspent, 210000);
  assert.equal(t.savings.projected, 300000);
});

test('overspending drives remaining negative and shrinks projected savings', () => {
  const txns = [
    flow('2026-09-01', 100000, 'Salary'),
    flow('2026-09-02', -80000, 'Housing & Bills'),
  ];
  const t = bucketTotals(txns, cats, '2026-09', DEFAULT_SPLIT);
  assert.equal(t.fixed.remaining, -30000);
  assert.equal(t.savings.projected, 30000 + (-30000 + 20000));
});

test('spending in an unknown category is reported, never charged to a bucket', () => {
  const txns = [
    flow('2026-09-01', 100000, 'Salary'),
    flow('2026-09-02', -4200, 'Deleted Category'),
  ];
  const t = bucketTotals(txns, cats, '2026-09', DEFAULT_SPLIT);
  assert.equal(t.unbucketed, 4200);
  assert.equal(t.fixed.spent, 0);
  assert.equal(t.flexible.spent, 0);
});

test('transfers never reach a budget bucket', () => {
  const txns = [
    flow('2026-09-01', 100000, 'Salary'),
    { id: 'x', date: '2026-09-02', account: 'a', amount: -50000, category: 'Transfer', transfer_id: 'y' },
    { id: 'y', date: '2026-09-02', account: 'b', amount: 50000, category: 'Transfer', transfer_id: 'x' },
  ];
  const t = bucketTotals(txns, cats, '2026-09', DEFAULT_SPLIT);
  assert.equal(t.fixed.spent, 0);
  assert.equal(t.flexible.spent, 0);
  assert.equal(t.unbucketed, 0);
  assert.equal(t.income, 100000);
});

test('other months do not leak into the total', () => {
  const txns = [
    flow('2026-09-01', 100000, 'Salary'),
    flow('2026-08-15', -90000, 'Housing & Bills'),
  ];
  assert.equal(bucketTotals(txns, cats, '2026-09', DEFAULT_SPLIT).fixed.spent, 0);
});
