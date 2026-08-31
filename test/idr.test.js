import test from 'node:test';
import assert from 'node:assert/strict';
import { formatIDR, formatAmount, fromCents, toCents } from '../money.js';
import { rowsToSheetData } from '../xlsx-io.js';

test('formatIDR groups thousands with dots and drops the subunit', () => {
  assert.equal(formatIDR(30000000), 'Rp 300.000');
  assert.equal(formatIDR(100000), 'Rp 1.000');
  assert.equal(formatIDR(99900), 'Rp 999');
  assert.equal(formatIDR(0), 'Rp 0');
});

test('formatIDR groups every three digits, however long the number', () => {
  assert.equal(formatIDR(100000000000), 'Rp 1.000.000.000');
  assert.equal(formatIDR(1234567800), 'Rp 12.345.678');
});

test('formatIDR does not group below a thousand', () => {
  assert.equal(formatIDR(50000), 'Rp 500');
  assert.equal(formatIDR(1), 'Rp 0');
});

test('the sign leads the symbol rather than sitting inside it', () => {
  assert.equal(formatIDR(-30000000), '-Rp 300.000');
  assert.equal(formatAmount(30000000), '+Rp 300.000');
  assert.equal(formatAmount(-30000000), '-Rp 300.000');
  assert.equal(formatAmount(0), 'Rp 0');
});

test('hundredths round rather than truncate', () => {
  assert.equal(formatIDR(150), 'Rp 2');
  assert.equal(formatIDR(149), 'Rp 1');
  assert.equal(formatIDR(-150), '-Rp 2');
});

test('formatIDR rejects a non-integer cent value like fromCents does', () => {
  assert.throws(() => formatIDR(1.5), /not an integer cent value/);
  assert.throws(() => formatIDR('100'), /not an integer cent value/);
});

// The display format carries a currency symbol and grouping dots. If it ever
// reached the spreadsheet, importXlsx could not read its own export back.
test('the Excel format stays a plain parseable decimal', () => {
  assert.equal(fromCents(30000000), '300000.00');
  const [row] = rowsToSheetData([{
    id: 'a', date: '2026-08-01', account: 'Bank', amount: 30000000,
    category: 'Salary', transfer_id: null, note: '',
  }]);
  assert.equal(row.amount, '300000.00');
  assert.doesNotMatch(String(row.amount), /Rp|\./.source === '' ? /x/ : /Rp/);
  assert.equal(toCents(row.amount), 30000000, 'exported value re-imports unchanged');
});
