import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlannerGrid, parsePlannerSheet, parsePlannerBook, parseMonthLabel, monthFromSheetName, parseDate, parseAmount } from '../planner.js';

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

// The layout moves. Everything below is a way the workbook has been, or
// plausibly will be, rearranged by hand — each must still import.

test('tab names are read however the month is written', () => {
  assert.deepEqual(parseMonthLabel('September 2026'), { year: 2026, month: 9 });
  assert.deepEqual(parseMonthLabel('2026-09'), { year: 2026, month: 9 });
  assert.deepEqual(parseMonthLabel('Oct 26'), { year: 2026, month: 10 });
  assert.deepEqual(parseMonthLabel('Sept'), { year: null, month: 9 });
  assert.equal(parseMonthLabel('Sheet1'), null);
  assert.equal(parseMonthLabel('Marketing'), null);
  assert.equal(parseMonthLabel('Financial Summary', { strict: true }), null);
});

test('dates arrive as Excel serials, words, day-first or a bare day', () => {
  const sep = { year: 2026, month: 9 };
  assert.equal(parseDate(46266, null), '2026-09-01');
  assert.equal(parseDate('1-Sep', null, sep), '2026-09-01');
  assert.equal(parseDate('September 15, 2026', null), '2026-09-15');
  assert.equal(parseDate('15/09/2026', null), '2026-09-15');
  assert.equal(parseDate('03/09/2026', null, sep), '2026-09-03', 'the sheet month settles 3/9 vs 9/3');
  assert.equal(parseDate(15, null, sep), '2026-09-15');
  assert.equal(parseDate('2/30/2026', null), null, 'an impossible day is not a date');
});

test('amounts read as rupiah, with dots or commas for thousands', () => {
  assert.equal(parseAmount('Rp 10.000'), 1000000);
  assert.equal(parseAmount('10.000'), 1000000, 'dots are thousands, not a decimal point');
  assert.equal(parseAmount('Rp1.500.000'), 150000000);
  assert.equal(parseAmount('10,000'), 1000000);
  assert.equal(parseAmount('1.234,50'), 123450);
  assert.equal(parseAmount('1,234.50'), 123450);
  assert.equal(parseAmount('10.5'), 1050);
  assert.equal(parseAmount('(Rp 500)'), -50000);
  assert.equal(parseAmount(10.5), 1050);
  assert.equal(parseAmount('-'), null);
  assert.throws(() => parseAmount('12.345.6'));
});

test('an Rp total under the summary Income heading is not income', () => {
  const { rows } = parsePlannerSheet([
    ['Income'], ['Rp 300.000'], [],
    ['Income'], ['Salary', 'Rp 300.000'],
  ], '2026_SEPT');
  assert.deepEqual(rows.map((r) => [r.category, r.amount]), [['Salary', 30000000]]);
});

test('renamed, reordered headings with an extra column still read', () => {
  const { rows } = parsePlannerSheet([
    ['Fixed'],
    ['Item', 'Paid?', 'Cost (Rp)', 'Date Paid', 'Remarks'],
    ['Rent', 'yes', 10000, 46266, 'sept'],
    ['Total', '', 10000, '', ''],
  ], '2026_SEPT');
  assert.deepEqual(rows, [{ date: '2026-09-01', category: 'Rent', amount: -1000000, note: 'sept', bucket: 'fixed' }]);
});

test('tables stacked in the same columns stop at each other', () => {
  const { rows } = parsePlannerSheet([
    ['Fixed Expenses'],
    ['Date', 'Category', 'Amount'],
    [46266, 'Rent', 100],
    [],
    ['Flexible Expenses'],
    ['Date', 'Category', 'Amount'],
    [46267, 'Food', 20],
  ], 'Sep 2026');
  assert.deepEqual(rows.map((r) => [r.category, r.bucket]), [['Rent', 'fixed'], ['Food', 'flexible']]);
});

test('a savings table and a per-category summary are not spending', () => {
  const { rows } = parsePlannerSheet([
    ['Flexible Expenses', '', '', '', 'Savings'],
    ['Date', 'Category', 'Amount', '', 'Category', 'Percent', 'Amount'],
    [46266, 'Food', 20, '', 'Home Fund', 0.5, 5000],
    [46267, 'Food', 30],
    [],
    ['Monthly Expenses'],
    ['Category', 'Amount'],
    ['Food', 50],
  ], '2026_SEPT');
  assert.deepEqual(rows.map((r) => r.amount), [-2000, -3000]);
});

test('one table with a Type column takes its bucket per row', () => {
  const { rows } = parsePlannerSheet([
    ['Date', 'Category', 'Type', 'Amount'],
    ['9/1/2026', 'Rent', 'Fixed', '10,000'],
    ['', 'Food', 'Flexible', '250'],
    ['', 'Salary', 'Income', '30,000'],
  ], '2026_SEPT');
  assert.deepEqual(rows.map((r) => [r.category, r.bucket, r.amount]), [
    ['Rent', 'fixed', -1000000], ['Food', 'flexible', -25000], ['Salary', null, 3000000],
  ]);
});

test('an income table under an Income heading imports positive', () => {
  const { rows } = parsePlannerSheet([
    ['Income'],
    ['Date', 'Source', 'Amount'],
    [46266, 'Salary', 30000],
  ], '2026_SEPT');
  assert.deepEqual(rows, [{ date: '2026-09-01', category: 'Salary', amount: 3000000, note: '', bucket: null }]);
});

test('a tab that names no month takes it from its rows and moves nothing', () => {
  const parsed = parsePlannerSheet([
    ['Date', 'Category', 'Amount'],
    ['9/30/2026', 'Food', 5],
    ['10/1/2026', 'Food', 5],
    ['10/2/2026', 'Food', 5],
  ], 'Sheet1');
  assert.equal(parsed.month, '2026-10');
  assert.deepEqual(parsed.rows.map((r) => r.date), ['2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(parsed.problems, []);
});

test('a tab without a year borrows it from the other tabs; empty tabs drop out', () => {
  const ledger = [['Date', 'Category', 'Amount'], ['1-Oct', 'Food', 5]];
  const sheets = parsePlannerBook([
    { name: '2026_SEPT', grid: [['Date', 'Category', 'Amount'], [46266, 'Food', 5]] },
    { name: 'October', grid: ledger },
    { name: 'YEARLY_Savings', grid: [['TOTAL'], ['2026', 'Home Fund', 54036]] },
  ]);
  assert.deepEqual(sheets.map((s) => s.month), ['2026-09', '2026-10']);
  assert.equal(sheets[1].rows[0].date, '2026-10-01');
});

test('a refiled date keeps inside the sheet month', () => {
  const { rows } = parsePlannerSheet([['Date', 'Category', 'Amount'], ['1/31/2026', 'Food', 5]], '2026_FEB');
  assert.equal(rows[0].date, '2026-02-28');
});

test('Indonesian tab names and headings read the same', () => {
  assert.deepEqual(parseMonthLabel('Agustus 2026'), { year: 2026, month: 8 });
  assert.deepEqual(parseMonthLabel('MEI_2026'), { year: 2026, month: 5 });
  const { rows } = parsePlannerSheet([
    ['Pengeluaran Tetap'],
    ['Tanggal', 'Kategori', 'Jumlah', 'Keterangan'],
    ['1/10/2026', 'Sewa', 'Rp 2.500.000', 'kos'],
  ], 'Oktober 2026');
  assert.deepEqual(rows, [{ date: '2026-10-01', category: 'Sewa', amount: -250000000, note: 'kos', bucket: 'fixed' }]);
});
