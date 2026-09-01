import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocate, allocateFunds, validatePercentages, splitBudget,
  DEFAULT_FUNDS, DEFAULT_SPLIT, DEFAULT_CATEGORIES,
} from '../budget.js';
import { fundsByYear, monthsOfYear } from '../rollup.js';

const cats = DEFAULT_CATEGORIES;
const flow = (date, amount, category, bucket = null) => ({ id: date + amount + category, date, account: 'a', amount, category, bucket, transfer_id: null });

test('allocate divides a pool and the parts always re-sum to it', () => {
  for (const pool of [0, 1, 7, 101, 999999, 30000000]) {
    const parts = allocate(pool, [35, 30, 15, 10, 5, 5]);
    assert.equal(parts.reduce((s, p) => s + p, 0), pool, `pool ${pool}`);
  }
});

test('allocate rejects shares that do not total 100', () => {
  assert.throws(() => allocate(1000, [50, 40]), /total 100/);
});

test('splitBudget still behaves after being rebuilt on allocate', () => {
  assert.deepEqual(splitBudget(300000, DEFAULT_SPLIT), { fixed: 150000, flexible: 60000, savings: 90000 });
  assert.deepEqual(splitBudget(0, DEFAULT_SPLIT), { fixed: 0, flexible: 0, savings: 0 });
});

test('allocateFunds reproduces the planner percentages of a savings pool', () => {
  const funds = allocateFunds(9006000, DEFAULT_FUNDS);
  const byName = Object.fromEntries(funds.map((f) => [f.name, f.amount]));
  assert.equal(byName['Emergency Fund'], 3152100);
  assert.equal(byName['Home Fund'], 2701800);
  assert.equal(byName['Vehicle Fund'], 1350900);
  assert.equal(byName['Travel Fund'], 900600);
  assert.equal(byName['Gift Fund'], 450300);
  assert.equal(funds.reduce((s, f) => s + f.amount, 0), 9006000);
});

test('a negative savings pool allocates negative shares rather than clamping', () => {
  const funds = allocateFunds(-10000, DEFAULT_FUNDS);
  assert.ok(funds.every((f) => f.amount <= 0));
  assert.equal(funds.reduce((s, f) => s + f.amount, 0), -10000);
});

test('validatePercentages rejects a negative share', () => {
  assert.throws(() => validatePercentages([110, -10]), /non-negative/);
});

test('monthsOfYear lists twelve zero-padded months', () => {
  const months = monthsOfYear(2026);
  assert.equal(months.length, 12);
  assert.equal(months[0], '2026-01');
  assert.equal(months[8], '2026-09');
  assert.equal(months[11], '2026-12');
});

test('fundsByYear accumulates across every month that has income', () => {
  const txns = [
    flow('2026-09-01', 100000, 'Salary'),
    flow('2026-10-01', 100000, 'Salary'),
  ];
  const year = fundsByYear(txns, DEFAULT_SPLIT, DEFAULT_FUNDS, 2026);
  assert.equal(year.months.length, 2);
  assert.equal(year.total, 200000);
  const emergency = year.funds.find((f) => f.name === 'Emergency Fund');
  assert.equal(emergency.amount, 70000);
  assert.equal(year.funds.reduce((s, f) => s + f.amount, 0), 200000);
});

test('a month with no income contributes nothing and is not listed', () => {
  const txns = [flow('2026-09-01', 100000, 'Salary')];
  const year = fundsByYear(txns, DEFAULT_SPLIT, DEFAULT_FUNDS, 2026);
  assert.deepEqual(year.months.map((m) => m.month), ['2026-09']);
});

test('an overspent month pulls the year total down', () => {
  const txns = [
    flow('2026-09-01', 100000, 'Salary'),
    flow('2026-10-01', 100000, 'Salary'),
    flow('2026-10-05', -200000, 'Housing & Bills', 'fixed'),
  ];
  const year = fundsByYear(txns, DEFAULT_SPLIT, DEFAULT_FUNDS, 2026);
  assert.equal(year.months[1].projected, -100000);
  assert.equal(year.total, 0);
});

test('adding a month needs no edit anywhere, unlike the source spreadsheet', () => {
  const base = [flow('2026-09-01', 100000, 'Salary')];
  const before = fundsByYear(base, DEFAULT_SPLIT, DEFAULT_FUNDS, 2026);
  const after = fundsByYear([...base, flow('2026-11-01', 100000, 'Salary')], DEFAULT_SPLIT, DEFAULT_FUNDS, 2026);
  assert.equal(before.total, 100000);
  assert.equal(after.total, 200000);
});

test('another year does not leak in', () => {
  const txns = [flow('2025-09-01', 100000, 'Salary'), flow('2026-09-01', 50000, 'Salary')];
  assert.equal(fundsByYear(txns, DEFAULT_SPLIT, DEFAULT_FUNDS, 2026).total, 50000);
});

test('a custom fund set works as long as it totals 100', () => {
  const funds = [{ name: 'All of it', percent: 100 }];
  const year = fundsByYear([flow('2026-09-01', 100000, 'Salary')], DEFAULT_SPLIT, funds, 2026);
  assert.deepEqual(year.funds, [{ name: 'All of it', percent: 100, amount: 100000 }]);
});
