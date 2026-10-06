import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOf, filterMonth, monthlyTotals, spendingBreakdown, chartSlices, filterRows, rowCategory, rowsNet,
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

test('spendingBreakdown returns positive totals, largest first, spending only', () => {
  assert.deepEqual(spendingBreakdown(txns, { month: '2026-08' }), [
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

test('chartSlices keeps the top four and folds the rest into Other', () => {
  const rows = [9, 7, 5, 4, 3, 2, 1].map((total, i) => ({ category: `c${i}`, total }));
  const slices = chartSlices(rows);
  assert.deepEqual(slices.map((s) => [s.category, s.total, s.other]), [
    ['c0', 9, false], ['c1', 7, false], ['c2', 5, false], ['c3', 4, false], ['Other', 6, true],
  ]);
  assert.deepEqual(slices[4].members.map((m) => m.category), ['c4', 'c5', 'c6']);
  assert.equal(slices.reduce((sum, s) => sum + s.total, 0), 31, 'folding loses no money');
});

test('chartSlices leaves a tail of one as itself, and short lists alone', () => {
  const five = [5, 4, 3, 2, 1].map((total, i) => ({ category: `c${i}`, total }));
  assert.deepEqual(chartSlices(five).map((s) => s.category), ['c0', 'c1', 'c2', 'c3', 'c4']);
  assert.equal(chartSlices(five).some((s) => s.other), false);
  assert.deepEqual(chartSlices([]), []);
  assert.deepEqual(chartSlices([{ category: 'a', total: 1 }]).map((s) => s.category), ['a']);
});

const listRows = [
  { id: 'a', account: 'Cash', category: 'Groceries', amount: -5000, transfer_id: null },
  { id: 'b', account: 'Bank', category: 'Groceries', amount: -7000, transfer_id: null },
  { id: 'c', account: 'Bank', category: '', amount: -1000, transfer_id: null },
  { id: 'd', account: 'Bank', category: 'Salary', amount: 90000, transfer_id: null },
  { id: 'e', account: 'Bank', category: 'Transfer', amount: -20000, transfer_id: 'f' },
  { id: 'f', account: 'Cash', category: 'Transfer', amount: 20000, transfer_id: 'e' },
];
const ids = (rows) => rows.map((r) => r.id).join('');

test('filterRows narrows by category, by account, or both, and empty means any', () => {
  assert.equal(ids(filterRows(listRows)), 'abcdef');
  assert.equal(ids(filterRows(listRows, { category: 'Groceries' })), 'ab');
  assert.equal(ids(filterRows(listRows, { account: 'Cash' })), 'af');
  assert.equal(ids(filterRows(listRows, { category: 'Groceries', account: 'Bank' })), 'b');
  assert.equal(ids(filterRows(listRows, { category: 'Groceries', account: 'Nowhere' })), '');
});

test('filterRows files transfers under Transfer and blanks under Uncategorised', () => {
  assert.equal(rowCategory(listRows[2]), 'Uncategorised');
  assert.equal(ids(filterRows(listRows, { category: 'Uncategorised' })), 'c');
  assert.equal(ids(filterRows(listRows, { category: 'Transfer' })), 'ef');
});

test('rowsNet leaves transfers out and skips amounts that are not integers', () => {
  assert.equal(rowsNet(listRows), 77000);
  assert.equal(rowsNet(filterRows(listRows, { account: 'Cash' })), -5000);
  assert.equal(rowsNet([...listRows, { amount: 'lots', transfer_id: null }]), 77000);
  assert.equal(rowsNet([]), 0);
});
