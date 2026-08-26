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
