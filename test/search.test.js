import test from 'node:test';
import assert from 'node:assert/strict';
import { searchTransactions } from '../rollup.js';

const row = (over = {}) => ({
  id: Math.random(), date: '2026-03-04', account: 'Bank BCA', amount: -1000,
  category: 'Groceries', name: '', note: '', transfer_id: null, ...over,
});

const rows = [
  row({ date: '2026-01-11', name: 'Grab to airport', category: 'Transportation', account: 'E-Wallet' }),
  row({ date: '2026-03-04', name: 'Weekly shop', category: 'Groceries', account: 'Bank BCA' }),
  row({ date: '2025-03-04', name: 'Weekly shop', category: 'Groceries', account: 'Cash', note: 'last year' }),
];

test('an empty query matches nothing, so the List keeps its month', () => {
  assert.equal(searchTransactions(rows, '').length, 0);
  assert.equal(searchTransactions(rows, '   ').length, 0);
  assert.equal(searchTransactions(rows, null).length, 0);
});

test('a query reaches outside the month on screen', () => {
  const found = searchTransactions(rows, 'grab');
  assert.equal(found.length, 1);
  assert.equal(found[0].date, '2026-01-11');
});

test('every word must match, across any field', () => {
  assert.equal(searchTransactions(rows, 'shop cash').length, 1);
  assert.equal(searchTransactions(rows, 'shop e-wallet').length, 0);
});

test('word order does not matter', () => {
  assert.equal(searchTransactions(rows, 'cash shop').length, 1);
});

test('matching is case insensitive', () => {
  assert.equal(searchTransactions(rows, 'GRAB').length, 1);
});

test('a month can be named or written', () => {
  assert.equal(searchTransactions(rows, 'jan').length, 1);
  assert.equal(searchTransactions(rows, '2026-03').length, 1);
  assert.equal(searchTransactions(rows, 'mar').length, 2);
});

test('the note is searchable', () => {
  const found = searchTransactions(rows, 'last year');
  assert.equal(found.length, 1);
  assert.equal(found[0].account, 'Cash');
});
