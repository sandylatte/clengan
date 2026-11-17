import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardModel, splitValid, netLabel } from '../dashboard.js';
import { DEFAULT_SPLIT } from '../budget.js';

const base = {
  accounts: [{ name: 'Cash', opening_balance: 1000 }],
  categories: [{ name: 'Salary', kind: 'income', position: 0 }, { name: 'Food', bucket: 'flexible', position: 1 }],
  funds: [{ name: 'A', percent: 60 }, { name: 'B', percent: 40 }],
  split: DEFAULT_SPLIT, plans: {}, limits: {}, period: 'month', month: '2026-11', today: '2026-11',
};
const rows = [
  { id: 1, date: '2026-11-01', account: 'Cash', category: 'Salary', amount: 100000 },
  { id: 2, date: '2026-11-02', account: 'Cash', category: 'Food', amount: -20000 },
  { id: 3, date: '2026-11-03', account: 'Cash', category: 'Food', amount: 'lots' },
];

test('splitValid keeps integer amounts and sets the rest aside', () => {
  const { valid, invalid } = splitValid(rows);
  assert.deepEqual(valid.map((t) => t.id), [1, 2]);
  assert.deepEqual(invalid.map((t) => t.id), [3]);
});

test('bad rows are left out of every total', () => {
  const m = dashboardModel(rows, base);
  assert.equal(m.invalid.length, 1);
  assert.equal(m.totals.net, 80000);
  assert.equal(m.headNet, 80000);
  assert.equal(m.balanceTotal, 81000);
});

test('budget card and funds card show the same savings figure', () => {
  const m = dashboardModel(rows, base);
  assert.equal(m.funds.ready, true);
  assert.equal(m.funds.period, m.buckets.savings.projected);
  assert.equal(m.funds.rows.reduce((s, f) => s + f.period, 0), m.buckets.savings.projected);
});

test('funds not totalling 100 report instead of throwing', () => {
  const m = dashboardModel(rows, { ...base, funds: [{ name: 'A', percent: 50 }] });
  assert.equal(m.funds.ready, false);
  assert.equal(m.funds.total, 50);
});

test('net label names this month, an older month and a year', () => {
  assert.equal(netLabel('month', '2026-11', '2026-11'), 'Net this month');
  assert.equal(netLabel('month', '2026-03', '2026-11'), 'Net in Mar 2026');
  assert.equal(netLabel('year', '2026-03', '2026-11'), 'Net this year');
  assert.equal(netLabel('year', '2025-03', '2026-11'), 'Net in 2025');
});
