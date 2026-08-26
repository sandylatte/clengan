import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsToSheetData, sheetDataToRows, accountsToSheetData, sheetDataToAccounts } from '../xlsx-io.js';

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

test('rowsToSheetData writes the raw amount through for a corrupt (non-integer) row instead of throwing', () => {
  const corrupt = [{ id: 'x', date: '2026-08-01', account: 'Bank', amount: 'lots', category: 'Food', transfer_id: null, note: '' }];
  const [row] = rowsToSheetData(corrupt);
  assert.equal(row.amount, 'lots');
});

test('sheetDataToRows rejects a transfer row whose partner is missing from the file', () => {
  const rows = [{ id: 'e', date: '2026-08-06', account: 'Bank', amount: '-200.00', category: 'Transfer', transfer_id: 'f', note: '' }];
  assert.throws(() => sheetDataToRows(rows), /transfer partner/);
});

test('sheetDataToRows rejects a transfer pair that does not point back at each other', () => {
  const rows = [
    { id: 'e', date: '2026-08-06', account: 'Bank', amount: '-200.00', category: 'Transfer', transfer_id: 'f', note: '' },
    { id: 'f', date: '2026-08-06', account: 'Savings', amount: '200.00', category: 'Transfer', transfer_id: 'g', note: '' },
  ];
  assert.throws(() => sheetDataToRows(rows), /does not point back/);
});

test('round trip on an empty transaction list returns an empty array, not a throw', () => {
  assert.deepEqual(sheetDataToRows(rowsToSheetData([])), []);
});

test('sheetDataToRows rejects a transfer pair whose amounts do not sum to zero', () => {
  const rows = [
    { id: 'e', date: '2026-08-06', account: 'Bank', amount: '-200.00', category: 'Transfer', transfer_id: 'f', note: '' },
    { id: 'f', date: '2026-08-06', account: 'Savings', amount: '150.00', category: 'Transfer', transfer_id: 'e', note: '' },
  ];
  assert.throws(() => sheetDataToRows(rows), /sum to zero/);
});

const accounts = [
  { name: 'Bank', opening_balance: 100000 },
  { name: 'Cash', opening_balance: 5000 },
];

test('accountsToSheetData writes decimal opening balances', () => {
  assert.deepEqual(accountsToSheetData(accounts), [
    { name: 'Bank', opening_balance: '1000.00' },
    { name: 'Cash', opening_balance: '50.00' },
  ]);
});

test('accounts round trip preserves every field exactly', () => {
  assert.deepEqual(sheetDataToAccounts(accountsToSheetData(accounts)), accounts);
});

test('sheetDataToAccounts rejects a row with no name', () => {
  assert.throws(() => sheetDataToAccounts([{ name: '', opening_balance: '10.00' }]), /name/);
});

test('sheetDataToAccounts rejects a malformed opening_balance', () => {
  assert.throws(() => sheetDataToAccounts([{ name: 'Bank', opening_balance: 'lots' }]), /opening_balance/);
});

test('sheetDataToAccounts rejects a duplicate account name with a row-identifying message', () => {
  assert.throws(
    () => sheetDataToAccounts([
      { name: 'Bank', opening_balance: '100.00' },
      { name: 'Bank', opening_balance: '999.00' },
    ]),
    /accounts row 3: duplicate account "Bank"/,
  );
});

test('sheetDataToAccounts treats differently-cased names as distinct accounts', () => {
  assert.deepEqual(
    sheetDataToAccounts([
      { name: 'bank', opening_balance: '10.00' },
      { name: 'Bank', opening_balance: '20.00' },
    ]),
    [
      { name: 'bank', opening_balance: 1000 },
      { name: 'Bank', opening_balance: 2000 },
    ],
  );
});
