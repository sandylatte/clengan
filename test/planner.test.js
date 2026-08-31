import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlannerGrid, monthFromSheetName, parseDate, parseAmount } from '../planner.js';

// Mirrors the real workbook: a summary strip whose "Income" heading is
// followed by a total, the real Income block below it, and two ledgers side
// by side whose dates only appear on the first row of a run.
const grid = () => [
  ['', '2026_SEPTEMBER'],
  ['Financial Summary'],
  ['Income', 'Expenses', 'Savings'],
  ['300200', '10030', '90060'],
  ['Income', '', '', '', 'Fixed Expenses', '', '', '', '', 'Flexible Expenses'],
  ['Salary', '300,000'],
  ['Bonus', '100'],
  ['', '', '', '', 'Date', 'Category', 'Amount', 'Note', '', 'Date', 'Category', 'Amount', 'Note'],
  ['', '', '', '', '9/1/2026', 'Housing & Bills', '10,000', 'rent', '', '9/2/2026', 'Food & Drinks', '10', ''],
  ['', '', '', '', '', 'Subscription', '5', '', '', '', 'Groceries', '20', 'market'],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
];

test('monthFromSheetName maps a planner tab to a month', () => {
  assert.equal(monthFromSheetName('2026_SEPT'), '2026-09');
  assert.equal(monthFromSheetName('2026_OCT'), '2026-10');
  assert.equal(monthFromSheetName('YEARLY_Savings'), null);
  assert.equal(monthFromSheetName('Sheet1'), null);
});

test('parseAmount strips thousands separators and reports blanks as null', () => {
  assert.equal(parseAmount('10,000'), 1000000);
  assert.equal(parseAmount('  '), null);
  assert.throws(() => parseAmount('abc'));
});

test('parseDate falls back to the previous row and normalises US slash dates', () => {
  assert.equal(parseDate('9/1/2026', null), '2026-09-01');
  assert.equal(parseDate('', '2026-09-01'), '2026-09-01');
  assert.equal(parseDate('2026-09-05', null), '2026-09-05');
  assert.equal(parseDate('not a date', null), null);
});

test('the summary total is never read as income', () => {
  const { rows } = parsePlannerGrid(grid(), '2026-09');
  const income = rows.filter((r) => r.amount > 0);
  assert.deepEqual(income.map((r) => r.category), ['Salary', 'Bonus']);
  assert.equal(income[0].amount, 30000000);
});

test('each ledger tags its rows with the bucket it came from', () => {
  const { rows, categories } = parsePlannerGrid(grid(), '2026-09');
  assert.equal(categories.get('Housing & Bills'), 'fixed');
  assert.equal(categories.get('Subscription'), 'fixed');
  assert.equal(categories.get('Food & Drinks'), 'flexible');
  assert.equal(categories.get('Groceries'), 'flexible');
  assert.equal(rows.filter((r) => r.bucket === 'fixed').length, 2);
  assert.equal(rows.filter((r) => r.bucket === 'flexible').length, 2);
});

test('spending is stored negative regardless of how the sheet signs it', () => {
  const { rows } = parsePlannerGrid(grid(), '2026-09');
  for (const row of rows.filter((r) => r.bucket)) assert.ok(row.amount < 0, row.category);
});

test('a blank date carries the previous row down', () => {
  const { rows } = parsePlannerGrid(grid(), '2026-09');
  assert.equal(rows.find((r) => r.category === 'Subscription').date, '2026-09-01');
  assert.equal(rows.find((r) => r.category === 'Groceries').date, '2026-09-02');
});

test('notes come across', () => {
  const { rows } = parsePlannerGrid(grid(), '2026-09');
  assert.equal(rows.find((r) => r.category === 'Housing & Bills').note, 'rent');
  assert.equal(rows.find((r) => r.category === 'Groceries').note, 'market');
});

test('padding rows are skipped, not imported as zero-amount transactions', () => {
  const { rows } = parsePlannerGrid(grid(), '2026-09');
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.amount !== 0));
});

test('a date from another month is refiled to the sheet and reported', () => {
  const { rows, problems } = parsePlannerGrid(grid(), '2026-10');
  assert.ok(rows.every((r) => r.date.startsWith('2026-10')), 'every row lands in the sheet month');
  assert.equal(problems.length, 4);
  assert.match(problems[0], /was dated 2026-09-01; filed under 2026-10-01/);
});

test('a non-numeric amount is reported and skips only its own row', () => {
  const broken = grid();
  broken[9][6] = 'lots';
  const { rows, problems } = parsePlannerGrid(broken, '2026-09');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /amount is not a number: "lots"/);
  assert.ok(rows.some((r) => r.category === 'Housing & Bills'));
  assert.ok(!rows.some((r) => r.category === 'Subscription'));
});

test('a sheet with no ledger blocks yields nothing rather than throwing', () => {
  const { rows, problems } = parsePlannerGrid([['TOTAL SAVINGS'], ['2026', 'Home Fund', '54036']], '2026-09');
  assert.deepEqual(rows, []);
  assert.deepEqual(problems, []);
});
